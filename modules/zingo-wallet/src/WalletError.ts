export const WALLET_ERROR_CODES = [
  "ERR_NOT_LOADED",
  "ERR_ALREADY_LOADED",
  "ERR_ALREADY_EXISTS",
  "ERR_NO_WALLET",
  "ERR_INVALID_SEED",
  "ERR_INVALID_BIRTHDAY",
  "ERR_NETWORK",
  "ERR_STORAGE",
  "ERR_SYNC",
  "ERR_INTERNAL",
  "ERR_OUTDATED_APP",
] as const;

export type WalletErrorCode = (typeof WALLET_ERROR_CODES)[number];

const NATIVE_CAUSE_SEPARATOR = "\n→ Caused by: ";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  readonly reason: string;

  constructor(code: WalletErrorCode, reason: string) {
    super(reason);
    this.name = "WalletError";
    this.code = code;
    this.reason = reason;
  }
}

export function isWalletErrorCode(code: unknown): code is WalletErrorCode {
  return typeof code === "string" && (WALLET_ERROR_CODES as readonly string[]).includes(code);
}

export function toWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) {
    return error;
  }
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return new WalletError(
    isWalletErrorCode(code) ? code : "ERR_INTERNAL",
    innermostReason(message),
  );
}

function innermostReason(message: string): string {
  const start = message.lastIndexOf(NATIVE_CAUSE_SEPARATOR);
  return start === -1 ? message : message.slice(start + NATIVE_CAUSE_SEPARATOR.length);
}
