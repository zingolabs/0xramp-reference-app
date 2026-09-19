import type { Balance, HistoryEntry, SyncState, SyncStateSubscription } from "../../modules/zingo-wallet";

export type {
  Balance,
  HistoryEntry,
  HistoryKind,
  SyncPhase,
  SyncState,
  SyncStateSubscription,
} from "../../modules/zingo-wallet";
export { toWalletError, WalletError, type WalletErrorCode } from "../../modules/zingo-wallet";

export type WalletBackend = {
  exists(): Promise<boolean>;
  create(): Promise<void>;
  restore(seedPhrase: string, birthday: number): Promise<void>;
  load(): Promise<void>;
  deleteWallet(): Promise<void>;
  balance(): Promise<Balance>;
  history(): Promise<HistoryEntry[]>;
  startSync(): Promise<void>;
  pauseSync(): Promise<void>;
  resumeSync(): Promise<void>;
  onSyncState(listener: (state: SyncState) => void): SyncStateSubscription;
};
