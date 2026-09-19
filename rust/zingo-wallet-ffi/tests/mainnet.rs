use std::sync::Arc;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use zingo_wallet_ffi::{SyncListener, SyncPhase, SyncState, Wallet};

const INDEXER: &str = "https://zec.rocks:443";
const FIRST_PUSH_BUDGET: Duration = Duration::from_secs(60);
const SYNCED_BUDGET: Duration = Duration::from_mins(15);

struct Recorder(mpsc::Sender<SyncState>);

impl SyncListener for Recorder {
    fn on_sync_state(&self, state: SyncState) {
        let _receiver_gone = self.0.send(state);
    }
}

fn next_push(pushes: &mpsc::Receiver<SyncState>, deadline: Instant) -> SyncState {
    let budget = deadline.saturating_duration_since(Instant::now());
    pushes
        .recv_timeout(budget)
        .unwrap_or_else(|missing| panic!("no sync state push in time: {missing}"))
}

fn until_synced(pushes: &mpsc::Receiver<SyncState>, deadline: Instant) -> SyncState {
    loop {
        let state = next_push(pushes, deadline);
        println!("push: {state:?}");
        assert_ne!(state.phase, SyncPhase::Failed, "{state:?}");
        if state.phase == SyncPhase::Synced {
            return state;
        }
    }
}

fn released(pushes: &mpsc::Receiver<SyncState>) -> bool {
    loop {
        match pushes.recv_timeout(FIRST_PUSH_BUDGET) {
            Ok(_late) => {}
            Err(RecvTimeoutError::Disconnected) => return true,
            Err(RecvTimeoutError::Timeout) => return false,
        }
    }
}

#[tokio::test]
#[ignore = "creates a wallet against the live mainnet indexer zec.rocks"]
async fn a_new_wallet_reaches_the_tip_of_mainnet() {
    let dir = tempfile::tempdir().expect("a temp dir");
    let wallet_dir = dir.path().to_string_lossy().into_owned();
    let wallet = Wallet::new(wallet_dir.clone(), INDEXER.to_owned()).expect("a wallet handle");

    assert_eq!(wallet.exists().await.ok(), Some(false));
    wallet.create().await.expect("a new wallet on mainnet");
    assert_eq!(wallet.exists().await.ok(), Some(true));

    let (sender, pushes) = mpsc::channel();
    wallet
        .start_sync(Arc::new(Recorder(sender)))
        .await
        .expect("the sync loop starts");

    let synced = until_synced(&pushes, Instant::now() + SYNCED_BUDGET);
    assert!(synced.first_sync_complete);

    let balance = wallet.balance().await.expect("a balance");
    assert_eq!((balance.spendable_zats, balance.unshielded_zats), (0, 0));
    assert_eq!(
        wallet.history().await.map(|history| history.len()).ok(),
        Some(0)
    );

    wallet.pause_sync().await.expect("sync pauses");
    let paused = next_push(&pushes, Instant::now() + FIRST_PUSH_BUDGET);
    assert_eq!(paused.phase, SyncPhase::Paused);

    let (sender, reloaded) = mpsc::channel();
    wallet
        .start_sync(Arc::new(Recorder(sender)))
        .await
        .expect("a second start replaces the listener");
    let resumed = until_synced(&reloaded, Instant::now() + SYNCED_BUDGET);
    assert!(resumed.first_sync_complete);
    assert!(released(&pushes), "the replaced listener is dropped");

    let reopened = Wallet::new(wallet_dir, INDEXER.to_owned()).expect("a second handle");
    reopened.load().await.expect("the saved wallet loads");
    assert_eq!(
        reopened
            .balance()
            .await
            .map(|balance| balance.spendable_zats)
            .ok(),
        Some(0)
    );
}
