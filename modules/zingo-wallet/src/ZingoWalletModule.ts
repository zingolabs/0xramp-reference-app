import { NativeModule, requireNativeModule } from "expo";

import type { Balance, HistoryEntry, SendProposal, ZingoWalletModuleEvents } from "./ZingoWallet.types";

declare class ZingoWalletModule extends NativeModule<ZingoWalletModuleEvents> {
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
  transparentAddress(): Promise<string>;
  proposeSend(address: string, amountZats: number): Promise<SendProposal>;
  discardProposal(): Promise<void>;
  sendProposed(): Promise<string[]>;
}

let nativeModule: ZingoWalletModule | undefined;

export function zingoWalletModule(): ZingoWalletModule {
  nativeModule ??= requireNativeModule<ZingoWalletModule>("ZingoWallet");
  return nativeModule;
}

export type { ZingoWalletModule };
