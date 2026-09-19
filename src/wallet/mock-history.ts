import { isIncoming, ZATS_PER_ZEC } from "@/wallet/history";
import type { Balance, HistoryEntry, HistoryKind } from "@/wallet/wallet-backend";

const HOUR = 3_600_000;
const NEWEST = Date.UTC(2026, 8, 19, 15, 0);
const ZATS_STEP = 10_000;

function seededRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const roundZats = (zec: number) => Math.round((zec * ZATS_PER_ZEC) / ZATS_STEP) * ZATS_STEP;

function pickKind(roll: number): HistoryKind {
	if (roll < 0.5) return "received";
	if (roll < 0.9) return "sent";
	return "shielded";
}

function mockTxid(random: () => number): string {
	return Array.from({ length: 64 }, () => Math.floor(random() * 16).toString(16)).join("");
}

function spendableZatsOf(history: HistoryEntry[]): number {
	return history.reduce((sum, entry) => {
		if (!isIncoming(entry.kind)) return sum - entry.zats;
		return entry.pending ? sum : sum + entry.zats;
	}, 0);
}

function buildHistory(count: number): HistoryEntry[] {
	const random = seededRandom(318);
	let timestampMs = NEWEST;

	const entries = Array.from({ length: count }, (_, index): HistoryEntry => {
		timestampMs -= (2 + random() * 30) * HOUR;
		const kind = pickKind(random());
		return {
			txid: mockTxid(random),
			kind,
			zats: roundZats(0.01 + (kind === "shielded" ? random() * 0.2 : random() ** 2 * 4)),
			timestampMs,
			pending: index < 2,
		};
	});

	const oldest = entries[count - 1];
	oldest.kind = "received";
	oldest.zats = Math.max(0, -spendableZatsOf(entries.slice(0, -1))) + 10 * ZATS_PER_ZEC;

	return entries;
}

export const MOCK_HISTORY = buildHistory(50);

export const MOCK_BALANCE: Balance = {
	spendableZats: spendableZatsOf(MOCK_HISTORY),
	unshieldedZats: 1_250_000,
};
