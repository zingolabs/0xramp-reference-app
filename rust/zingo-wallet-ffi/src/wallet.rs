use std::io::ErrorKind;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use tokio::sync::{RwLock, watch};
use zingolib::config::{ChainType, ClientConfig, WalletConfig, construct_indexer_uri};
use zingolib::lightclient::LightClient;
use zingolib::lightclient::error::LightClientError;
use zingolib::netutils::time::{DEFAULT_REQUEST_TIMEOUT, PER_ATTEMPT_CONNECT_TIMEOUT};
use zingolib::netutils::{GrpcIndexer, Indexer as _};
use zingolib::sync::{IronwoodNote, OrchardNote, SaplingNote};
use zingolib::wallet::error::{BalanceError, KeyError, WalletError as LibraryError};
use zingolib::wallet::{LightWallet, WalletSettings};

use crate::error::describe;
use crate::history::{self, HistoryEntry};
use crate::runtime::{self, AbortOnDrop, spawn_guarded};
use crate::sync::{self, Demand, SyncListener, SyncState};
use crate::{WalletError, zats};

const ONE_ACCOUNT: NonZeroU32 = NonZeroU32::MIN;
const ACCOUNT: zip32::AccountId = zip32::AccountId::ZERO;

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct Balance {
    pub spendable_zats: i64,
    pub unshielded_zats: i64,
}

pub(crate) struct Session {
    pub(crate) client: RwLock<LightClient>,
    wallet: Arc<RwLock<LightWallet>>,
}

#[derive(Clone)]
struct Store {
    wallet_dir: PathBuf,
    wallet_path: PathBuf,
    indexer: http::Uri,
    lifecycle: Arc<tokio::sync::Mutex<()>>,
    session: Arc<RwLock<Option<Arc<Session>>>>,
}

struct Driver {
    sync_loop: AbortOnDrop<()>,
    forwarder: AbortOnDrop<()>,
}

#[derive(uniffi::Object)]
pub struct Wallet {
    store: Store,
    demand: watch::Sender<Demand>,
    state: Arc<watch::Sender<SyncState>>,
    driver: Mutex<Option<Driver>>,
}

#[uniffi::export]
impl Wallet {
    #[uniffi::constructor]
    pub fn new(wallet_dir: String, indexer_uri: String) -> Result<Arc<Self>, WalletError> {
        let wallet_dir = PathBuf::from(wallet_dir);
        std::fs::create_dir_all(&wallet_dir).map_err(|failure| WalletError::storage(&failure))?;
        let indexer =
            construct_indexer_uri(indexer_uri).map_err(|invalid| WalletError::network(&invalid))?;
        let wallet_path = config(&wallet_dir, WalletConfig::Read)?
            .get_wallet_path()
            .to_path_buf();
        Ok(Arc::new(Self {
            store: Store {
                wallet_dir,
                wallet_path,
                indexer,
                lifecycle: Arc::default(),
                session: Arc::default(),
            },
            demand: watch::Sender::new(Demand::Run),
            state: Arc::new(watch::Sender::new(SyncState::idle())),
            driver: Mutex::default(),
        }))
    }

    pub async fn exists(&self) -> Result<bool, WalletError> {
        let store = self.store.clone();
        runtime::read(async move { store.file_exists().await }).await
    }

    pub async fn create(&self) -> Result<(), WalletError> {
        let store = self.store.clone();
        runtime::write(async move {
            let _serial = store.lifecycle.lock().await;
            store.ensure_vacant().await?;
            let chain_height = chain_tip(&store.indexer).await?;
            let client = store
                .open(WalletConfig::NewSeed {
                    no_of_accounts: ONE_ACCOUNT,
                    chain_height,
                    wallet_settings: WalletSettings::default(),
                })
                .await?;
            store.install(client, Persist::Now).await
        })
        .await
    }

    pub async fn restore(&self, seed_phrase: String, birthday: i64) -> Result<(), WalletError> {
        let birthday = u32::try_from(birthday).map_err(|_| WalletError::InvalidBirthday {
            reason: format!("{birthday} is not a block height"),
        })?;
        let store = self.store.clone();
        runtime::write(async move {
            let _serial = store.lifecycle.lock().await;
            store.ensure_vacant().await?;
            let client = store
                .open(WalletConfig::MnemonicPhrase {
                    mnemonic_phrase: normalized(&seed_phrase),
                    no_of_accounts: ONE_ACCOUNT,
                    birthday,
                    wallet_settings: WalletSettings::default(),
                })
                .await?;
            let tip = chain_tip(&store.indexer).await?;
            if birthday > tip {
                return Err(WalletError::InvalidBirthday {
                    reason: format!("{birthday} is above the chain tip {tip}"),
                });
            }
            store.install(client, Persist::Now).await
        })
        .await
    }

    pub async fn load(&self) -> Result<(), WalletError> {
        let store = self.store.clone();
        runtime::write(async move {
            let _serial = store.lifecycle.lock().await;
            if store.session.read().await.is_some() {
                return Err(WalletError::AlreadyLoaded);
            }
            if !store.file_exists().await? {
                return Err(WalletError::NoWallet);
            }
            let client = LightClient::new(store.config(WalletConfig::Read)?, false)
                .await
                .map_err(|unreadable| WalletError::storage(&unreadable))?;
            store.install(client, Persist::Later).await
        })
        .await
    }

    pub async fn delete(&self) -> Result<(), WalletError> {
        let running = self
            .driver
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        drop(running);
        let store = self.store.clone();
        runtime::write(async move {
            let _serial = store.lifecycle.lock().await;
            store.discard().await;
            store.remove_file().await
        })
        .await?;
        self.state.send_replace(SyncState::idle());
        Ok(())
    }

    pub async fn balance(&self) -> Result<Balance, WalletError> {
        let wallet = self.store.session().await?.wallet.clone();
        runtime::read(async move {
            let wallet = wallet.read().await;
            let spendable = [
                wallet.spendable_balance::<IronwoodNote>(ACCOUNT, false),
                wallet.spendable_balance::<OrchardNote>(ACCOUNT, false),
                wallet.spendable_balance::<SaplingNote>(ACCOUNT, false),
            ]
            .into_iter()
            .try_fold(0_u64, |sum, pool| match pool {
                Ok(pool) => Ok(sum.saturating_add(pool.into_u64())),
                Err(BalanceError::KeyError(KeyError::NoViewCapability)) => Ok(sum),
                Err(failure) => Err(WalletError::internal(&failure)),
            })?;
            let unshielded = wallet
                .account_balance(ACCOUNT)
                .map_err(|failure| WalletError::internal(&failure))?
                .confirmed_transparent_balance
                .map_or(0, |confirmed| confirmed.into_u64());
            Ok(Balance {
                spendable_zats: zats(spendable)?,
                unshielded_zats: zats(unshielded)?,
            })
        })
        .await
    }

    pub async fn history(&self) -> Result<Vec<HistoryEntry>, WalletError> {
        let wallet = self.store.session().await?.wallet.clone();
        runtime::read(async move {
            let wallet = wallet.read().await;
            let tip = wallet.sync_state.last_known_chain_height().map(u32::from);
            let min_confirmations = wallet.wallet_settings.min_confirmations.get();
            let summaries = wallet
                .transaction_summaries(true)
                .await
                .map_err(|failure| WalletError::internal(&failure))?;
            summaries
                .iter()
                .filter_map(|summary| history::entry(summary, tip, min_confirmations))
                .collect()
        })
        .await
    }

    pub async fn start_sync(&self, listener: Arc<dyn SyncListener>) -> Result<(), WalletError> {
        let session = self.store.session().await?;
        self.demand
            .send_if_modified(|demand| std::mem::replace(demand, Demand::Run) == Demand::Pause);
        let forwarder = spawn_guarded(sync::forward(self.state.subscribe(), listener))?;
        let mut driver = self.driver.lock().unwrap_or_else(PoisonError::into_inner);
        match driver.as_mut() {
            Some(running) if !running.sync_loop.is_finished() => running.forwarder = forwarder,
            _ => {
                let sync_loop = spawn_guarded(sync::drive(
                    session,
                    self.store.indexer.clone(),
                    self.demand.subscribe(),
                    self.state.clone(),
                ))?;
                *driver = Some(Driver {
                    sync_loop,
                    forwarder,
                });
            }
        }
        Ok(())
    }

    pub async fn pause_sync(&self) -> Result<(), WalletError> {
        self.store.session().await?;
        self.demand.send_replace(Demand::Pause);
        Ok(())
    }

    pub async fn resume_sync(&self) -> Result<(), WalletError> {
        self.store.session().await?;
        self.demand.send_replace(Demand::Run);
        Ok(())
    }
}

#[derive(Clone, Copy)]
enum Persist {
    Now,
    Later,
}

impl Store {
    fn config(&self, wallet_config: WalletConfig) -> Result<ClientConfig, WalletError> {
        config(&self.wallet_dir, wallet_config)
    }

    async fn session(&self) -> Result<Arc<Session>, WalletError> {
        self.session
            .read()
            .await
            .clone()
            .ok_or(WalletError::NotLoaded)
    }

    async fn discard(&self) {
        let Some(session) = self.session.write().await.take() else {
            return;
        };
        let mut client = session.client.write().await;
        let _engine_stopping = client.stop_sync();
        let _saves_stopped = client.shutdown_save_task().await;
    }

    async fn file_exists(&self) -> Result<bool, WalletError> {
        tokio::fs::try_exists(&self.wallet_path)
            .await
            .map_err(|failure| WalletError::storage(&failure))
    }

    async fn remove_file(&self) -> Result<(), WalletError> {
        tokio::fs::remove_file(&self.wallet_path)
            .await
            .or_else(|failure| match failure.kind() {
                ErrorKind::NotFound => Ok(()),
                _ => Err(WalletError::storage(&failure)),
            })
    }

    async fn ensure_vacant(&self) -> Result<(), WalletError> {
        if self.session.read().await.is_some() {
            return Err(WalletError::AlreadyLoaded);
        }
        if self.file_exists().await? {
            return Err(WalletError::AlreadyExists);
        }
        Ok(())
    }

    async fn open(&self, wallet_config: WalletConfig) -> Result<LightClient, WalletError> {
        LightClient::new(self.config(wallet_config)?, false)
            .await
            .map_err(refused)
    }

    async fn install(&self, mut client: LightClient, persist: Persist) -> Result<(), WalletError> {
        if let Persist::Now = persist {
            client
                .flush()
                .await
                .map_err(|failure| WalletError::storage(&failure))?;
            if !self.file_exists().await? {
                return Err(WalletError::Storage {
                    reason: format!("{} was not written", self.wallet_path.display()),
                });
            }
        }
        client.save_task().await;
        let wallet = client.wallet().clone();
        let mut session = self.session.write().await;
        if session.is_some() {
            return Err(WalletError::AlreadyLoaded);
        }
        *session = Some(Arc::new(Session {
            client: RwLock::new(client),
            wallet,
        }));
        Ok(())
    }
}

fn config(wallet_dir: &Path, wallet_config: WalletConfig) -> Result<ClientConfig, WalletError> {
    ClientConfig::builder()
        .set_chain_type(ChainType::Mainnet)
        .set_wallet_dir(wallet_dir.to_path_buf())
        .set_wallet_config(wallet_config)
        .build()
        .map_err(|failure| WalletError::storage(&failure))
}

async fn chain_tip(indexer: &http::Uri) -> Result<u32, WalletError> {
    zingolib::ensure_default_crypto_provider();
    let mut client = tokio::time::timeout(
        PER_ATTEMPT_CONNECT_TIMEOUT,
        GrpcIndexer::new(indexer.clone()),
    )
    .await
    .map_err(|elapsed| WalletError::network(&elapsed))?
    .map_err(|refused| WalletError::network(&refused))?;
    let tip = client
        .get_latest_block(DEFAULT_REQUEST_TIMEOUT)
        .await
        .map_err(|failure| WalletError::network(&failure))?;
    u32::try_from(tip.height).map_err(|overflow| WalletError::internal(&overflow))
}

fn normalized(seed_phrase: &str) -> String {
    seed_phrase
        .split_whitespace()
        .map(str::to_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}

fn refused(failure: LightClientError) -> WalletError {
    match &failure {
        LightClientError::FileError(file) if file.kind() == ErrorKind::AlreadyExists => {
            WalletError::AlreadyExists
        }
        LightClientError::FileError(file) => WalletError::storage(file),
        LightClientError::WalletError(LibraryError::MnemonicError(invalid)) => {
            WalletError::InvalidSeed {
                reason: describe(invalid),
            }
        }
        LightClientError::WalletError(below @ LibraryError::BirthdayBelowSapling(..)) => {
            WalletError::InvalidBirthday {
                reason: describe(below),
            }
        }
        _ => WalletError::internal(&failure),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SyncPhase;

    const UNREACHABLE_INDEXER: &str = "http://127.0.0.1:9";
    const NEW_SEED_HEIGHT: u32 = 3_000_000;
    const BELOW_SAPLING: i64 = 1;
    const MAINNET_HEIGHT: i64 = 3_000_000;
    const TWENTY_FOUR_WORD_SEED: &str = "hospital museum valve antique skate museum unfold vocal weird milk scale social vessel identify crowd hospital control album rib bulb path oven civil tank";
    const BAD_CHECKSUM_SEED: &str = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon";

    fn wallet_in(dir: &tempfile::TempDir) -> Arc<Wallet> {
        Wallet::new(
            dir.path().to_string_lossy().into_owned(),
            UNREACHABLE_INDEXER.to_owned(),
        )
        .expect("a temp dir takes a wallet")
    }

    fn occupy(wallet: &Wallet) {
        std::fs::write(&wallet.store.wallet_path, b"not a wallet")
            .expect("the temp dir is writable");
    }

    fn code<T: std::fmt::Debug>(outcome: Result<T, WalletError>) -> String {
        outcome.expect_err("the call fails").code()
    }

    async fn seed(wallet: &Wallet) {
        let client = wallet
            .store
            .open(WalletConfig::NewSeed {
                no_of_accounts: ONE_ACCOUNT,
                chain_height: NEW_SEED_HEIGHT,
                wallet_settings: WalletSettings::default(),
            })
            .await
            .expect("a seed needs no indexer");
        wallet
            .store
            .install(client, Persist::Now)
            .await
            .expect("the new wallet is written and loaded");
    }

    #[test]
    fn new_creates_the_wallet_dir_and_touches_nothing_else() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let nested = dir.path().join("zingo-wallet");
        Wallet::new(
            nested.to_string_lossy().into_owned(),
            UNREACHABLE_INDEXER.to_owned(),
        )
        .expect("the dir is created");
        assert!(nested.is_dir());
        assert_eq!(nested.read_dir().map(Iterator::count).ok(), Some(0));
    }

    #[tokio::test]
    async fn exists_follows_the_wallet_file() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        assert_eq!(wallet.exists().await.ok(), Some(false));
        occupy(&wallet);
        assert_eq!(wallet.exists().await.ok(), Some(true));
    }

    #[tokio::test]
    async fn an_existing_file_refuses_create_and_restore_before_the_network() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        occupy(&wallet);
        assert_eq!(code(wallet.create().await), "ERR_ALREADY_EXISTS");
        assert_eq!(
            code(
                wallet
                    .restore(TWENTY_FOUR_WORD_SEED.to_owned(), MAINNET_HEIGHT)
                    .await
            ),
            "ERR_ALREADY_EXISTS"
        );
        assert_eq!(
            std::fs::read(&wallet.store.wallet_path).ok().as_deref(),
            Some(b"not a wallet".as_slice())
        );
    }

    #[tokio::test]
    async fn load_needs_a_readable_wallet_file() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        assert_eq!(code(wallet.load().await), "ERR_NO_WALLET");
        occupy(&wallet);
        assert_eq!(code(wallet.load().await), "ERR_STORAGE");
    }

    #[tokio::test]
    async fn restore_rejects_bad_input_before_the_network() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        assert_eq!(
            code(wallet.restore(TWENTY_FOUR_WORD_SEED.to_owned(), -1).await),
            "ERR_INVALID_BIRTHDAY"
        );
        assert_eq!(
            code(
                wallet
                    .restore(BAD_CHECKSUM_SEED.to_owned(), MAINNET_HEIGHT)
                    .await
            ),
            "ERR_INVALID_SEED"
        );
        assert_eq!(
            code(
                wallet
                    .restore(TWENTY_FOUR_WORD_SEED.to_owned(), BELOW_SAPLING)
                    .await
            ),
            "ERR_INVALID_BIRTHDAY"
        );
        assert_eq!(wallet.exists().await.ok(), Some(false));
    }

    #[tokio::test]
    async fn a_valid_restore_needs_the_indexer() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        let shouted = TWENTY_FOUR_WORD_SEED.to_uppercase().replace(' ', "  \n");
        assert_eq!(
            code(wallet.restore(shouted, MAINNET_HEIGHT).await),
            "ERR_NETWORK"
        );
        assert_eq!(wallet.exists().await.ok(), Some(false));
        assert_eq!(code(wallet.create().await), "ERR_NETWORK");
    }

    #[tokio::test]
    async fn wallet_calls_need_a_loaded_wallet() {
        struct Silent;
        impl SyncListener for Silent {
            fn on_sync_state(&self, _state: SyncState) {}
        }

        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        assert_eq!(code(wallet.balance().await), "ERR_NOT_LOADED");
        assert_eq!(code(wallet.history().await), "ERR_NOT_LOADED");
        assert_eq!(
            code(wallet.start_sync(Arc::new(Silent)).await),
            "ERR_NOT_LOADED"
        );
        assert_eq!(code(wallet.pause_sync().await), "ERR_NOT_LOADED");
        assert_eq!(code(wallet.resume_sync().await), "ERR_NOT_LOADED");
    }

    #[tokio::test]
    async fn delete_without_a_wallet_is_quiet() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        wallet.delete().await.expect("there is nothing to forget");
        assert_eq!(wallet.exists().await.ok(), Some(false));
    }

    #[tokio::test]
    async fn delete_drops_the_file_the_session_and_the_sync_state() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        seed(&wallet).await;
        assert_eq!(wallet.exists().await.ok(), Some(true));
        assert!(wallet.balance().await.is_ok());
        wallet.state.send_replace(SyncState {
            phase: SyncPhase::Synced,
            first_sync_complete: true,
            error_code: None,
            error_reason: None,
        });

        wallet.delete().await.expect("the wallet is forgotten");

        assert_eq!(wallet.exists().await.ok(), Some(false));
        assert_eq!(code(wallet.balance().await), "ERR_NOT_LOADED");
        assert_eq!(*wallet.state.borrow(), SyncState::idle());
    }

    #[tokio::test]
    async fn a_deleted_wallet_leaves_room_for_the_next_one() {
        let dir = tempfile::tempdir().expect("a temp dir");
        let wallet = wallet_in(&dir);
        seed(&wallet).await;
        let first = wallet.balance().await.expect("the first wallet answers");

        wallet
            .delete()
            .await
            .expect("the first wallet is forgotten");
        assert_eq!(code(wallet.create().await), "ERR_NETWORK");

        seed(&wallet).await;
        assert_eq!(wallet.exists().await.ok(), Some(true));
        assert_eq!(wallet.balance().await.ok(), Some(first));
    }

    #[test]
    fn seed_phrases_are_normalized() {
        assert_eq!(normalized("  Abandon\n\tABOUT  zoo "), "abandon about zoo");
    }
}
