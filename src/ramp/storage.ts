import type { RampSession, ZecSendStorage } from "@0xramp/sdk";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "ramp.session";
const ARCHIVE_KEY = "ramp.archive";
const ARCHIVE_PREFIX = "ramp.archive.";
const JOURNAL_PREFIX = "ramp.journal.";
const ARCHIVE_LIMIT = 10;

export type SavedRamp =
  | { state: "creating"; partnerSessionId: string }
  | { state: "active"; session: RampSession };

export async function readSavedRamp(): Promise<SavedRamp | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (raw === null) {
    return null;
  }
  const record: unknown = JSON.parse(raw);
  if (typeof record !== "object" || record === null || !("state" in record)) {
    throw new Error("The saved ramp record has no state.");
  }
  if (record.state === "creating" && "partnerSessionId" in record && typeof record.partnerSessionId === "string") {
    return { state: "creating", partnerSessionId: record.partnerSessionId };
  }
  if (record.state === "active" && "session" in record && typeof record.session === "object" && record.session !== null) {
    return { state: "active", session: record.session as RampSession };
  }
  throw new Error("The saved ramp record has an unknown shape.");
}

export function writeSavedRamp(record: SavedRamp | null): Promise<void> {
  return record === null
    ? SecureStore.deleteItemAsync(SESSION_KEY)
    : SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(record));
}

async function readArchiveIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(ARCHIVE_KEY);
  if (raw === null) {
    return [];
  }
  const refs: unknown = JSON.parse(raw);
  return Array.isArray(refs) ? refs.filter((ref): ref is string => typeof ref === "string") : [];
}

export async function readArchivedSessions(): Promise<RampSession[]> {
  const sessions: RampSession[] = [];
  for (const ref of await readArchiveIndex()) {
    const raw = await SecureStore.getItemAsync(ARCHIVE_PREFIX + ref);
    if (raw !== null) {
      sessions.push(JSON.parse(raw) as RampSession);
    }
  }
  return sessions;
}

export async function archiveSession(session: RampSession): Promise<void> {
  const refs = (await readArchiveIndex()).filter((ref) => ref !== session.sessionRef);
  refs.unshift(session.sessionRef);
  for (const dropped of refs.splice(ARCHIVE_LIMIT)) {
    await SecureStore.deleteItemAsync(ARCHIVE_PREFIX + dropped);
  }
  await SecureStore.setItemAsync(ARCHIVE_PREFIX + session.sessionRef, JSON.stringify(session));
  await SecureStore.setItemAsync(ARCHIVE_KEY, JSON.stringify(refs));
}

export async function removeArchivedSession(sessionRef: string): Promise<void> {
  const refs = (await readArchiveIndex()).filter((ref) => ref !== sessionRef);
  await SecureStore.deleteItemAsync(ARCHIVE_PREFIX + sessionRef);
  await SecureStore.setItemAsync(ARCHIVE_KEY, JSON.stringify(refs));
}

export const journalStorage: ZecSendStorage = {
  get: (key) => SecureStore.getItemAsync(JOURNAL_PREFIX + key),
  set: (key, value) => SecureStore.setItemAsync(JOURNAL_PREFIX + key, value),
};
