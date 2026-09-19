import type { HistoryKind } from "@/wallet/wallet-backend";

export const ZATS_PER_ZEC = 100_000_000;

const DISPLAY_STEP_ZATS = 10_000;

export function isIncoming(kind: HistoryKind): boolean {
  return kind === "received" || kind === "shielded";
}

export function formatZec(zats: number): string {
  const zec =
    Math.abs(zats) < DISPLAY_STEP_ZATS
      ? zats / ZATS_PER_ZEC
      : (Math.trunc(zats / DISPLAY_STEP_ZATS) * DISPLAY_STEP_ZATS) / ZATS_PER_ZEC;
  return zec.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}
