use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{RwLock, watch};
use zingolib::lightclient::LightClient;
use zingolib::lightclient::error::LightClientError;
use zingolib::netutils::time::PER_ATTEMPT_CONNECT_TIMEOUT;

use crate::WalletError;
use crate::wallet::Session;

const RESYNC_INTERVAL: Duration = Duration::from_secs(75);
const LISTENER_THROTTLE: Duration = Duration::from_millis(250);
const SAVE_BUDGET: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum SyncPhase {
    Idle,
    Syncing,
    Synced,
    Paused,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct SyncState {
    pub phase: SyncPhase,
    pub first_sync_complete: bool,
    pub error_code: Option<String>,
    pub error_reason: Option<String>,
}

impl SyncState {
    pub(crate) fn idle() -> Self {
        Self {
            phase: SyncPhase::Idle,
            first_sync_complete: false,
            error_code: None,
            error_reason: None,
        }
    }

    fn next(&self, phase: SyncPhase, failure: Option<&WalletError>) -> Self {
        Self {
            phase,
            first_sync_complete: self.first_sync_complete || phase == SyncPhase::Synced,
            error_code: failure.map(WalletError::code),
            error_reason: failure.map(WalletError::reason),
        }
    }
}

#[uniffi::export(foreign)]
pub trait SyncListener: Send + Sync {
    fn on_sync_state(&self, state: SyncState);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Demand {
    Run,
    Pause,
}

fn publish(state: &watch::Sender<SyncState>, phase: SyncPhase, failure: Option<&WalletError>) {
    state.send_if_modified(|current| {
        let next = current.next(phase, failure);
        let changed = *current != next;
        *current = next;
        changed
    });
}

pub(crate) async fn forward(
    mut state: watch::Receiver<SyncState>,
    listener: Arc<dyn SyncListener>,
) {
    loop {
        let current = state.borrow_and_update().clone();
        let _listener_panicked = catch_unwind(AssertUnwindSafe(|| listener.on_sync_state(current)));
        tokio::time::sleep(LISTENER_THROTTLE).await;
        if state.changed().await.is_err() {
            break;
        }
    }
}

pub(crate) async fn drive(
    session: Arc<Session>,
    indexer: http::Uri,
    mut demand: watch::Receiver<Demand>,
    state: Arc<watch::Sender<SyncState>>,
) {
    loop {
        if *demand.borrow_and_update() == Demand::Pause {
            publish(&state, SyncPhase::Paused, None);
            if demand.wait_for(|next| *next == Demand::Run).await.is_err() {
                break;
            }
        }
        publish(&state, SyncPhase::Syncing, None);
        let rest = match sync_to_tip(&session.client, &indexer, &mut demand, &state).await {
            Ok(()) => {
                publish(&state, SyncPhase::Synced, None);
                Some(RESYNC_INTERVAL)
            }
            Err(failure) => {
                publish(&state, SyncPhase::Failed, Some(&failure));
                None
            }
        };
        if !rested(&mut demand, rest).await {
            break;
        }
    }
}

async fn rested(demand: &mut watch::Receiver<Demand>, rest: Option<Duration>) -> bool {
    match rest {
        Some(interval) => tokio::select! {
            () = tokio::time::sleep(interval) => true,
            changed = demand.changed() => changed.is_ok(),
        },
        None => demand.changed().await.is_ok(),
    }
}

async fn sync_to_tip(
    client: &RwLock<LightClient>,
    indexer: &http::Uri,
    demand: &mut watch::Receiver<Demand>,
    state: &watch::Sender<SyncState>,
) -> Result<(), WalletError> {
    launch(client, indexer).await?;
    follow(client, demand, state).await;
    collect(client).await
}

async fn launch(client: &RwLock<LightClient>, indexer: &http::Uri) -> Result<(), WalletError> {
    let mut client = client.write().await;
    if client.indexer_uri().is_none() {
        tokio::time::timeout(
            PER_ATTEMPT_CONNECT_TIMEOUT,
            client.set_indexer_uri(indexer.clone()),
        )
        .await
        .map_err(|elapsed| WalletError::network(&elapsed))?
        .map_err(|refused| WalletError::network(&refused))?;
    }
    client
        .sync()
        .await
        .map_err(|failure| sync_failure(&failure))
}

async fn follow(
    client: &RwLock<LightClient>,
    demand: &mut watch::Receiver<Demand>,
    state: &watch::Sender<SyncState>,
) {
    let client = client.read().await;
    let mut finished = std::pin::pin!(client.wait_for_sync());
    loop {
        steer(&client, *demand.borrow_and_update(), state);
        tokio::select! {
            () = &mut finished => break,
            Ok(()) = demand.changed() => {}
        }
    }
}

fn steer(client: &LightClient, demand: Demand, state: &watch::Sender<SyncState>) {
    match demand {
        Demand::Pause => {
            let _engine_idle = client.pause_sync();
            publish(state, SyncPhase::Paused, None);
        }
        Demand::Run => {
            let _engine_running = client.resume_sync();
            publish(state, SyncPhase::Syncing, None);
        }
    }
}

async fn collect(client: &RwLock<LightClient>) -> Result<(), WalletError> {
    let mut client = client.write().await;
    client
        .await_sync()
        .await
        .map_err(|failure| sync_failure(&failure))?;
    let saved = tokio::time::timeout(SAVE_BUDGET, client.wait_for_save()).await;
    client
        .check_save_error()
        .await
        .map_err(|failure| WalletError::storage(&failure))?;
    saved.map_err(|elapsed| WalletError::storage(&elapsed))
}

fn sync_failure(failure: &LightClientError) -> WalletError {
    match failure {
        LightClientError::ClientError(_)
        | LightClientError::IndexerError(_)
        | LightClientError::Offline => WalletError::network(failure),
        _ => WalletError::sync(failure),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    const DELIVERY_BUDGET: Duration = Duration::from_secs(2);

    struct Recorder(Mutex<Vec<SyncState>>);

    impl SyncListener for Recorder {
        fn on_sync_state(&self, state: SyncState) {
            if let Ok(mut pushes) = self.0.lock() {
                pushes.push(state);
            }
        }
    }

    impl Recorder {
        fn phases(&self) -> Vec<SyncPhase> {
            self.0
                .lock()
                .map(|pushes| pushes.iter().map(|state| state.phase).collect())
                .unwrap_or_default()
        }
    }

    #[test]
    fn first_sync_complete_sticks_once_synced() {
        let synced = SyncState::idle().next(SyncPhase::Synced, None);
        assert!(synced.first_sync_complete);
        let paused = synced.next(SyncPhase::Paused, None);
        assert!(paused.first_sync_complete);
        assert!(
            !SyncState::idle()
                .next(SyncPhase::Syncing, None)
                .first_sync_complete
        );
    }

    #[test]
    fn a_failure_carries_its_code_and_reason_until_the_next_phase() {
        let failure = WalletError::Network {
            reason: "unreachable".to_owned(),
        };
        let failed = SyncState::idle().next(SyncPhase::Failed, Some(&failure));
        assert_eq!(failed.error_code.as_deref(), Some("ERR_NETWORK"));
        assert_eq!(
            failed.error_reason.as_deref(),
            Some("network error: unreachable")
        );
        let retrying = failed.next(SyncPhase::Syncing, None);
        assert_eq!(retrying.error_code, None);
        assert_eq!(retrying.error_reason, None);
    }

    #[test]
    fn only_a_changed_state_is_published() {
        let (state, mut observer) = watch::channel(SyncState::idle());
        publish(&state, SyncPhase::Idle, None);
        assert_eq!(observer.has_changed().ok(), Some(false));
        publish(&state, SyncPhase::Syncing, None);
        assert_eq!(observer.has_changed().ok(), Some(true));
        observer.mark_unchanged();
        publish(&state, SyncPhase::Syncing, None);
        assert_eq!(observer.has_changed().ok(), Some(false));
    }

    #[tokio::test]
    async fn the_forwarder_pushes_the_current_state_then_each_change() {
        let (state, observer) = watch::channel(SyncState::idle());
        let recorder = Arc::new(Recorder(Mutex::new(Vec::new())));
        let forwarder = tokio::spawn(forward(observer, recorder.clone()));
        tokio::task::yield_now().await;

        publish(&state, SyncPhase::Syncing, None);
        publish(&state, SyncPhase::Synced, None);
        tokio::time::sleep(LISTENER_THROTTLE + DELIVERY_BUDGET).await;
        drop(state);
        let _closed = forwarder.await;

        let phases = recorder.phases();
        assert_eq!(phases.first(), Some(&SyncPhase::Idle));
        assert_eq!(phases.last(), Some(&SyncPhase::Synced));
        assert!(phases.len() <= 3, "{phases:?}");
    }
}
