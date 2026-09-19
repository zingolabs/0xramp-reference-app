use zingolib::sync::ConfirmationStatus;
use zingolib::wallet::summary::data::{SendType, TransactionKind, TransactionSummary};

use crate::{WalletError, zats};

const MILLIS_PER_SECOND: i64 = 1_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, uniffi::Enum)]
pub enum HistoryKind {
    Received,
    Sent,
    Shielded,
}

#[derive(Debug, Clone, PartialEq, Eq, uniffi::Record)]
pub struct HistoryEntry {
    pub txid: String,
    pub kind: HistoryKind,
    pub zats: i64,
    pub timestamp_ms: i64,
    pub pending: bool,
}

pub(crate) fn entry(
    summary: &TransactionSummary,
    tip: Option<u32>,
    min_confirmations: u32,
) -> Option<Result<HistoryEntry, WalletError>> {
    let kind = kind(summary.kind)?;
    let confirmed_at = match summary.status {
        ConfirmationStatus::Failed(_) => return None,
        ConfirmationStatus::Confirmed(height) => Some(u32::from(height)),
        ConfirmationStatus::Mempool(_)
        | ConfirmationStatus::Transmitted(_)
        | ConfirmationStatus::Calculated(_) => None,
    };
    Some(zats(summary.value).map(|zats| HistoryEntry {
        txid: summary.txid.to_string(),
        kind,
        zats,
        timestamp_ms: i64::from(summary.datetime) * MILLIS_PER_SECOND,
        pending: pending(confirmed_at, tip, min_confirmations),
    }))
}

fn kind(kind: TransactionKind) -> Option<HistoryKind> {
    match kind {
        TransactionKind::Received => Some(HistoryKind::Received),
        TransactionKind::Sent(SendType::Send) => Some(HistoryKind::Sent),
        TransactionKind::Sent(SendType::Shield) => Some(HistoryKind::Shielded),
        TransactionKind::Sent(SendType::SendToSelf) => None,
    }
}

fn pending(confirmed_at: Option<u32>, tip: Option<u32>, min_confirmations: u32) -> bool {
    match (confirmed_at, tip) {
        (Some(height), Some(tip)) => confirmations(height, tip) < min_confirmations,
        _ => true,
    }
}

fn confirmations(height: u32, tip: u32) -> u32 {
    tip.saturating_sub(height).saturating_add(1)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN_CONFIRMATIONS: u32 = 3;
    const TIP: u32 = 3_100_000;

    #[test]
    fn kinds_map_and_self_sends_are_hidden() {
        assert_eq!(kind(TransactionKind::Received), Some(HistoryKind::Received));
        assert_eq!(
            kind(TransactionKind::Sent(SendType::Send)),
            Some(HistoryKind::Sent)
        );
        assert_eq!(
            kind(TransactionKind::Sent(SendType::Shield)),
            Some(HistoryKind::Shielded)
        );
        assert_eq!(kind(TransactionKind::Sent(SendType::SendToSelf)), None);
    }

    #[test]
    fn a_transaction_is_pending_until_it_reaches_the_minimum_confirmations() {
        let just_mined = TIP;
        let one_short = TIP - (MIN_CONFIRMATIONS - 1) + 1;
        let spendable = TIP - (MIN_CONFIRMATIONS - 1);
        assert!(pending(Some(just_mined), Some(TIP), MIN_CONFIRMATIONS));
        assert!(pending(Some(one_short), Some(TIP), MIN_CONFIRMATIONS));
        assert!(!pending(Some(spendable), Some(TIP), MIN_CONFIRMATIONS));
        assert!(!pending(Some(spendable - 1), Some(TIP), MIN_CONFIRMATIONS));
    }

    #[test]
    fn an_unmined_transaction_or_an_unknown_tip_is_pending() {
        assert!(pending(None, Some(TIP), MIN_CONFIRMATIONS));
        assert!(pending(Some(TIP), None, MIN_CONFIRMATIONS));
    }

    #[test]
    fn confirmations_count_the_block_itself() {
        assert_eq!(confirmations(TIP, TIP), 1);
        assert_eq!(confirmations(TIP - 2, TIP), 3);
        assert_eq!(confirmations(TIP + 1, TIP), 1);
    }
}
