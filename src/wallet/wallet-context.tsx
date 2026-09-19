import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { walletBackend } from "@/wallet/backend";
import {
	toWalletError,
	type Balance,
	type HistoryEntry,
	type SyncState,
	type SyncStateSubscription,
} from "@/wallet/wallet-backend";

export type WalletStatus = "checking" | "none" | "ready";

type Wallet = {
	status: WalletStatus;
	hasWallet: boolean;
	balance: Balance;
	history: HistoryEntry[];
	syncState: SyncState;
	createWallet: () => Promise<void>;
	restoreWallet: (seedPhrase: string, birthday: number) => Promise<void>;
	switchWallet: () => Promise<void>;
	retrySync: () => Promise<void>;
};

type Session = {
	loaded: boolean;
	syncStarted: boolean;
	pausedInBackground: boolean;
	subscription: SyncStateSubscription | null;
};

const EMPTY_BALANCE: Balance = { spendableZats: 0, unshieldedZats: 0 };

const IDLE_SYNC: SyncState = {
	phase: "idle",
	firstSyncComplete: false,
	errorCode: null,
	errorReason: null,
};

const WalletContext = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<WalletStatus>("checking");
	const [balance, setBalance] = useState<Balance>(EMPTY_BALANCE);
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [syncState, setSyncState] = useState<SyncState>(IDLE_SYNC);
	const session = useRef<Session>({
		loaded: false,
		syncStarted: false,
		pausedInBackground: false,
		subscription: null,
	});

	async function refresh() {
		try {
			const [nextBalance, nextHistory] = await Promise.all([
				walletBackend.balance(),
				walletBackend.history(),
			]);
			setBalance(nextBalance);
			setHistory(nextHistory);
		} catch (error) {
			console.warn("Wallet refresh failed:", toWalletError(error).reason);
		}
	}

	function failSync(error: unknown) {
		const { code, reason } = toWalletError(error);
		setSyncState((current) => ({
			...current,
			phase: "failed",
			errorCode: code,
			errorReason: reason,
		}));
	}

	function subscribe() {
		if (session.current.subscription) {
			return;
		}
		session.current.subscription = walletBackend.onSyncState((next) => {
			setSyncState(next);
			if (next.phase === "synced") {
				refresh();
			}
		});
	}

	async function load() {
		try {
			await walletBackend.load();
		} catch (error) {
			if (toWalletError(error).code !== "ERR_ALREADY_LOADED") {
				throw error;
			}
		}
		session.current.loaded = true;
	}

	async function startSync() {
		if (session.current.syncStarted) {
			await walletBackend.resumeSync();
			return;
		}
		await walletBackend.startSync();
		session.current.syncStarted = true;
	}

	async function openWallet(open: () => Promise<void>) {
		subscribe();
		await open();
		session.current.loaded = true;
		await refresh();
		setStatus("ready");
		await startSync().catch(failSync);
	}

	useEffect(() => {
		let active = true;
		const current = session.current;

		walletBackend.exists().then(
			async (found) => {
				if (!active) {
					return;
				}
				if (!found) {
					setStatus("none");
					return;
				}
				try {
					await openWallet(load);
				} catch (error) {
					setStatus("ready");
					failSync(error);
				}
			},
			(error) => {
				console.warn("Wallet check failed:", toWalletError(error).reason);
				if (active) {
					setStatus("none");
				}
			},
		);

		return () => {
			active = false;
			current.subscription?.remove();
			current.subscription = null;
		};
	}, []);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (next) => {
			const current = session.current;
			if (!current.syncStarted) {
				return;
			}
			if (next === "background" && !current.pausedInBackground) {
				current.pausedInBackground = true;
				walletBackend.pauseSync().catch((error) => {
					console.warn("Pausing sync failed:", toWalletError(error).reason);
				});
			} else if (next === "active" && current.pausedInBackground) {
				current.pausedInBackground = false;
				walletBackend.resumeSync().catch(failSync);
			}
		});
		return () => subscription.remove();
	}, []);

	async function openOrThrow(open: () => Promise<void>) {
		try {
			await openWallet(open);
		} catch (error) {
			throw toWalletError(error);
		}
	}

	async function switchWallet() {
		try {
			await walletBackend.deleteWallet();
		} catch (error) {
			throw toWalletError(error);
		}
		session.current.loaded = false;
		session.current.syncStarted = false;
		session.current.pausedInBackground = false;
		setBalance(EMPTY_BALANCE);
		setHistory([]);
		setSyncState(IDLE_SYNC);
		setStatus("none");
	}

	async function retrySync() {
		setSyncState((current) => ({
			...current,
			phase: "syncing",
			errorCode: null,
			errorReason: null,
		}));
		try {
			subscribe();
			if (!session.current.loaded) {
				await load();
				await refresh();
			}
			await startSync();
		} catch (error) {
			failSync(error);
		}
	}

	const wallet: Wallet = {
		status,
		hasWallet: status === "ready",
		balance,
		history,
		syncState,
		createWallet: () => openOrThrow(() => walletBackend.create()),
		restoreWallet: (seedPhrase, birthday) =>
			openOrThrow(() => walletBackend.restore(seedPhrase, birthday)),
		switchWallet,
		retrySync,
	};

	return <WalletContext value={wallet}>{children}</WalletContext>;
}

export function useWallet(): Wallet {
	const wallet = use(WalletContext);
	if (!wallet) {
		throw new Error("useWallet must be used inside WalletProvider");
	}
	return wallet;
}
