import * as ZingoWallet from "../../modules/zingo-wallet";

import type { WalletBackend } from "@/wallet/wallet-backend";

export const nativeBackend: WalletBackend = {
  exists: ZingoWallet.exists,
  create: ZingoWallet.create,
  restore: ZingoWallet.restore,
  load: ZingoWallet.load,
  deleteWallet: ZingoWallet.deleteWallet,
  balance: ZingoWallet.balance,
  history: ZingoWallet.history,
  startSync: ZingoWallet.startSync,
  pauseSync: ZingoWallet.pauseSync,
  resumeSync: ZingoWallet.resumeSync,
  onSyncState: ZingoWallet.addSyncStateListener,
};
