export type Balance = {
  spendableZats: number;
  unshieldedZats: number;
};

export type HistoryKind = "received" | "sent" | "shielded";

export type HistoryEntry = {
  txid: string;
  kind: HistoryKind;
  zats: number;
  timestampMs: number;
  pending: boolean;
};

export type SyncPhase = "idle" | "syncing" | "synced" | "paused" | "failed";

export type SyncState = {
  phase: SyncPhase;
  firstSyncComplete: boolean;
  errorCode: string | null;
  errorReason: string | null;
};

export type ZingoWalletModuleEvents = {
  onSyncState: (state: SyncState) => void;
};

export type SyncStateSubscription = {
  remove(): void;
};
