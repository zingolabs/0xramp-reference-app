uniffi::setup_scaffolding!();

mod error;
mod history;
mod runtime;
mod sync;
mod wallet;

pub use error::WalletError;
pub use history::{HistoryEntry, HistoryKind};
pub use sync::{SyncListener, SyncPhase, SyncState};
pub use wallet::{Balance, Wallet};

pub(crate) fn zats(value: u64) -> Result<i64, WalletError> {
    i64::try_from(value).map_err(|overflow| WalletError::internal(&overflow))
}
