import type { WalletError, WalletErrorCode } from "@/wallet/wallet-backend";

const SUMMARIES: Partial<Record<WalletErrorCode, string>> = {
  ERR_NETWORK: "Could not reach the indexer. Check your connection and try again.",
  ERR_INVALID_SEED: "The seed phrase is not valid.",
  ERR_INVALID_BIRTHDAY: "The birthday height is not valid.",
  ERR_ALREADY_EXISTS: "A wallet already exists on this device.",
  ERR_STORAGE: "The wallet file could not be read or written.",
};

export function walletErrorMessage(error: WalletError): string {
  const summary = SUMMARIES[error.code];
  return summary ? `${summary}\n\n${error.reason}` : error.reason;
}
