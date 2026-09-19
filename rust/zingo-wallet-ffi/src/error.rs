use std::error::Error;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum WalletError {
    #[error("no wallet is loaded")]
    NotLoaded,
    #[error("a wallet is already loaded")]
    AlreadyLoaded,
    #[error("a wallet file already exists")]
    AlreadyExists,
    #[error("no wallet file exists")]
    NoWallet,
    #[error("invalid seed phrase: {reason}")]
    InvalidSeed { reason: String },
    #[error("invalid birthday: {reason}")]
    InvalidBirthday { reason: String },
    #[error("network error: {reason}")]
    Network { reason: String },
    #[error("storage error: {reason}")]
    Storage { reason: String },
    #[error("sync error: {reason}")]
    Sync { reason: String },
    #[error("internal error: {reason}")]
    Internal { reason: String },
}

#[uniffi::export]
impl WalletError {
    pub fn code(&self) -> String {
        match self {
            Self::NotLoaded => "ERR_NOT_LOADED",
            Self::AlreadyLoaded => "ERR_ALREADY_LOADED",
            Self::AlreadyExists => "ERR_ALREADY_EXISTS",
            Self::NoWallet => "ERR_NO_WALLET",
            Self::InvalidSeed { .. } => "ERR_INVALID_SEED",
            Self::InvalidBirthday { .. } => "ERR_INVALID_BIRTHDAY",
            Self::Network { .. } => "ERR_NETWORK",
            Self::Storage { .. } => "ERR_STORAGE",
            Self::Sync { .. } => "ERR_SYNC",
            Self::Internal { .. } => "ERR_INTERNAL",
        }
        .to_owned()
    }

    pub fn reason(&self) -> String {
        self.to_string()
    }
}

impl WalletError {
    pub(crate) fn network(cause: &(dyn Error + 'static)) -> Self {
        Self::Network {
            reason: describe(cause),
        }
    }

    pub(crate) fn storage(cause: &(dyn Error + 'static)) -> Self {
        Self::Storage {
            reason: describe(cause),
        }
    }

    pub(crate) fn sync(cause: &(dyn Error + 'static)) -> Self {
        Self::Sync {
            reason: describe(cause),
        }
    }

    pub(crate) fn internal(cause: &(dyn Error + 'static)) -> Self {
        Self::Internal {
            reason: describe(cause),
        }
    }
}

pub(crate) fn describe(error: &(dyn Error + 'static)) -> String {
    std::iter::successors(Some(error), |&cause| cause.source())
        .map(|cause| cause.to_string().trim_end_matches('.').to_owned())
        .fold(String::new(), |chain, cause| {
            if chain.is_empty() {
                cause
            } else if chain.contains(&cause) {
                chain
            } else {
                format!("{chain}: {cause}")
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Debug, thiserror::Error)]
    #[error("indexer refused.")]
    struct Refused(#[source] std::io::Error);

    #[derive(Debug, thiserror::Error)]
    #[error("file error. {0}")]
    struct Echoing(#[source] std::io::Error);

    fn reasoned(reason: &str) -> [WalletError; 6] {
        let reason = reason.to_owned();
        [
            WalletError::InvalidSeed {
                reason: reason.clone(),
            },
            WalletError::InvalidBirthday {
                reason: reason.clone(),
            },
            WalletError::Network {
                reason: reason.clone(),
            },
            WalletError::Storage {
                reason: reason.clone(),
            },
            WalletError::Sync {
                reason: reason.clone(),
            },
            WalletError::Internal { reason },
        ]
    }

    #[test]
    fn every_variant_carries_its_contract_code() {
        let unit = [
            (WalletError::NotLoaded, "ERR_NOT_LOADED"),
            (WalletError::AlreadyLoaded, "ERR_ALREADY_LOADED"),
            (WalletError::AlreadyExists, "ERR_ALREADY_EXISTS"),
            (WalletError::NoWallet, "ERR_NO_WALLET"),
        ];
        let codes = [
            "ERR_INVALID_SEED",
            "ERR_INVALID_BIRTHDAY",
            "ERR_NETWORK",
            "ERR_STORAGE",
            "ERR_SYNC",
            "ERR_INTERNAL",
        ];
        for (error, code) in unit {
            assert_eq!(error.code(), code);
        }
        for (error, code) in reasoned("x").into_iter().zip(codes) {
            assert_eq!(error.code(), code);
        }
    }

    #[test]
    fn the_reason_names_the_failure_and_its_cause() {
        for error in reasoned("timed out") {
            assert!(
                error.reason().ends_with(": timed out"),
                "{}",
                error.reason()
            );
        }
        assert_eq!(WalletError::NoWallet.reason(), "no wallet file exists");
    }

    #[test]
    fn describe_walks_the_cause_chain_once() {
        let refused = Refused(std::io::Error::other("connection reset"));
        assert_eq!(describe(&refused), "indexer refused: connection reset");

        let echoing = Echoing(std::io::Error::other("disk full"));
        assert_eq!(describe(&echoing), "file error. disk full");
    }

    #[test]
    fn the_constructors_pick_the_variant() {
        let cause = std::io::Error::other("unreachable");
        assert_eq!(WalletError::network(&cause).code(), "ERR_NETWORK");
        assert_eq!(WalletError::storage(&cause).code(), "ERR_STORAGE");
        assert_eq!(WalletError::sync(&cause).code(), "ERR_SYNC");
        assert_eq!(WalletError::internal(&cause).code(), "ERR_INTERNAL");
    }
}
