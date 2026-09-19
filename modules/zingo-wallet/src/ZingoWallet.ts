import { toWalletError, WalletError } from "./WalletError";
import type { Balance, HistoryEntry, SyncState, SyncStateSubscription } from "./ZingoWallet.types";
import { zingoWalletModule, type ZingoWalletModule } from "./ZingoWalletModule";

type MethodName =
  | "exists"
  | "create"
  | "restore"
  | "load"
  | "deleteWallet"
  | "balance"
  | "history"
  | "startSync"
  | "pauseSync"
  | "resumeSync";

async function call<T>(
  name: MethodName,
  invoke: (module: ZingoWalletModule) => Promise<T>,
): Promise<T> {
  try {
    const module = zingoWalletModule();
    if (typeof module[name] !== "function") {
      throw new WalletError(
        "ERR_OUTDATED_APP",
        `The installed app has no "${name}" in its native module. Rebuild it with "pnpm android" or "pnpm ios".`,
      );
    }
    return await invoke(module);
  } catch (error) {
    throw toWalletError(error);
  }
}

export function exists(): Promise<boolean> {
  return call("exists", (module) => module.exists());
}

export function create(): Promise<void> {
  return call("create", (module) => module.create());
}

export function restore(seedPhrase: string, birthday: number): Promise<void> {
  return call("restore", (module) => module.restore(seedPhrase, birthday));
}

export function load(): Promise<void> {
  return call("load", (module) => module.load());
}

export function deleteWallet(): Promise<void> {
  return call("deleteWallet", (module) => module.deleteWallet());
}

export function balance(): Promise<Balance> {
  return call("balance", (module) => module.balance());
}

export function history(): Promise<HistoryEntry[]> {
  return call("history", (module) => module.history());
}

export function startSync(): Promise<void> {
  return call("startSync", (module) => module.startSync());
}

export function pauseSync(): Promise<void> {
  return call("pauseSync", (module) => module.pauseSync());
}

export function resumeSync(): Promise<void> {
  return call("resumeSync", (module) => module.resumeSync());
}

export function addSyncStateListener(listener: (state: SyncState) => void): SyncStateSubscription {
  try {
    return zingoWalletModule().addListener("onSyncState", listener);
  } catch (error) {
    throw toWalletError(error);
  }
}
