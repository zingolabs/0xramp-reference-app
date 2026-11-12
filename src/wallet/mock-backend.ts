import { MOCK_BALANCE, MOCK_HISTORY } from "@/wallet/mock-history";
import { WalletError, type SyncState, type WalletBackend } from "@/wallet/wallet-backend";

export type MockScenario = "new" | "existing" | "sync-failure";

const NETWORK_DELAY_MS = 900;
const SYNC_DURATION_MS = 2_500;
const SYNC_INTERVAL_MS = 75_000;
const SEED_WORD_COUNT = 24;
const EMPTY_BALANCE = { spendableZats: 0, unshieldedZats: 0 };
const MOCK_FEE_ZATS = 10_000;
const MOCK_TRANSPARENT_ADDRESS = "t1YbmA92ebTS2M223tZsSFZdn7nogkEwJNx";
const TXID_HEX_LENGTH = 64;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function mockScenarioFromEnv(value: string | undefined): MockScenario {
  return value === "existing" || value === "sync-failure" ? value : "new";
}

export function createMockBackend(scenario: MockScenario): WalletBackend {
  let walletExists = scenario !== "new";
  let loaded = false;
  let scanned = walletExists;
  let syncStarted = false;
  let failuresLeft = scenario === "sync-failure" ? 1 : 0;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  let proposedZats: number | null = null;
  let state: SyncState = { phase: "idle", firstSyncComplete: false, errorCode: null, errorReason: null };
  const listeners = new Set<(state: SyncState) => void>();

  function publish(next: Partial<SyncState>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener(state));
  }

  function requireLoaded() {
    if (!loaded) {
      throw new WalletError("ERR_NOT_LOADED", "No wallet is loaded.");
    }
  }

  function runSync() {
    clearTimeout(syncTimer);
    publish({ phase: "syncing", errorCode: null, errorReason: null });
    syncTimer = setTimeout(() => {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        publish({
          phase: "failed",
          errorCode: "ERR_NETWORK",
          errorReason: "Could not reach the indexer at https://zec.rocks:443 (mock).",
        });
        return;
      }
      scanned = true;
      publish({ phase: "synced", firstSyncComplete: true });
      syncTimer = setTimeout(runSync, SYNC_INTERVAL_MS);
    }, SYNC_DURATION_MS);
  }

  async function open() {
    await delay(NETWORK_DELAY_MS);
    if (walletExists) {
      throw new WalletError("ERR_ALREADY_EXISTS", "A wallet file already exists.");
    }
    walletExists = true;
    loaded = true;
    scanned = false;
  }

  return {
    async exists() {
      return walletExists;
    },
    async create() {
      await open();
    },
    async restore(seedPhrase, birthday) {
      if (seedPhrase.trim().split(/\s+/).length !== SEED_WORD_COUNT) {
        throw new WalletError("ERR_INVALID_SEED", `A seed phrase has ${SEED_WORD_COUNT} words.`);
      }
      if (!Number.isInteger(birthday) || birthday < 0) {
        throw new WalletError("ERR_INVALID_BIRTHDAY", "The birthday is a block height.");
      }
      await open();
    },
    async deleteWallet() {
      clearTimeout(syncTimer);
      walletExists = false;
      loaded = false;
      scanned = false;
      syncStarted = false;
      failuresLeft = scenario === "sync-failure" ? 1 : 0;
      publish({ phase: "idle", firstSyncComplete: false, errorCode: null, errorReason: null });
    },
    async load() {
      if (!walletExists) {
        throw new WalletError("ERR_NO_WALLET", "No wallet file exists.");
      }
      if (loaded) {
        throw new WalletError("ERR_ALREADY_LOADED", "The wallet is already loaded.");
      }
      loaded = true;
    },
    async balance() {
      requireLoaded();
      return scanned ? MOCK_BALANCE : EMPTY_BALANCE;
    },
    async history() {
      requireLoaded();
      return scanned ? MOCK_HISTORY : [];
    },
    async startSync() {
      requireLoaded();
      syncStarted = true;
      runSync();
    },
    async pauseSync() {
      requireLoaded();
      clearTimeout(syncTimer);
      publish({ phase: "paused" });
    },
    async resumeSync() {
      requireLoaded();
      if (syncStarted) {
        runSync();
      }
    },
    onSyncState(listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    async transparentAddress() {
      requireLoaded();
      return MOCK_TRANSPARENT_ADDRESS;
    },
    async proposeSend(address, amountZats) {
      requireLoaded();
      if (!/^t[13][1-9A-HJ-NP-Za-km-z]{25,89}$/.test(address)) {
        throw new WalletError("ERR_INVALID_ADDRESS", `${address} is not a transparent address.`);
      }
      if (!Number.isInteger(amountZats) || amountZats <= 0) {
        throw new WalletError("ERR_INVALID_AMOUNT", `${amountZats} is not a positive amount in zats.`);
      }
      const spendable = scanned ? MOCK_BALANCE.spendableZats : 0;
      const totalZats = amountZats + MOCK_FEE_ZATS;
      if (totalZats > spendable) {
        throw new WalletError(
          "ERR_INSUFFICIENT_FUNDS",
          `${spendable} zats are spendable, ${totalZats} zats are needed with the fee (mock).`,
        );
      }
      proposedZats = amountZats;
      return { amountZats, feeZats: MOCK_FEE_ZATS, totalZats };
    },
    async discardProposal() {
      requireLoaded();
      proposedZats = null;
    },
    async sendProposed() {
      requireLoaded();
      if (proposedZats === null) {
        throw new WalletError("ERR_SEND", "No proposal is stored (mock).");
      }
      await delay(NETWORK_DELAY_MS);
      proposedZats = null;
      return [Date.now().toString(16).padStart(TXID_HEX_LENGTH, "0")];
    },
  };
}
