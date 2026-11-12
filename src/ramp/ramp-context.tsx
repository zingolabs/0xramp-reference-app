import {
  buildZecSendReply,
  buildZecSendResumeUrl,
  PspError,
  ZecSendHandoffRefusedError,
  type HostToPaneMessage,
  type RampSession,
  type SessionStatus,
  type ZecSendOutcome,
  type ZecSendRequestPayload,
  type ZecSendResumeEvidence,
} from "@0xramp/sdk";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { useColors, type Colors } from "@/constants/colors";
import { ramp, sendStore } from "@/ramp/client";
import { RAMP_FIAT, RAMP_RETURN_URL } from "@/ramp/config";
import { rampLinkKind } from "@/ramp/links";
import { openPane } from "@/ramp/pane";
import {
  archiveSession,
  readArchivedSessions,
  readSavedRamp,
  removeArchivedSession,
  writeSavedRamp,
} from "@/ramp/storage";
import { walletBackend } from "@/wallet/backend";
import { toWalletError, type SendProposal } from "@/wallet/wallet-backend";
import { useWallet } from "@/wallet/wallet-context";

export type RampPhase = "loading" | "idle" | "active" | "blocked";

export type PendingSend = {
  sessionRef: string;
  request: ZecSendRequestPayload;
  deadline: string;
  proposal: SendProposal | null;
  proposalError: string | null;
  sending: boolean;
};

type RampState = {
  phase: RampPhase;
  busy: boolean;
  message: string | null;
  session: RampSession | null;
  status: SessionStatus | null;
  pendingSend: PendingSend | null;
  refundAddress: string | null;
  archive: RampSession[];
};

type Ramp = RampState & {
  open(): Promise<void>;
  refreshStatus(): Promise<void>;
  forget(): Promise<void>;
  resumeArchived(sessionRef: string): Promise<void>;
  confirmSend(): Promise<void>;
  declineSend(): Promise<void>;
};

const LINK_REPLAY_WINDOW_MS = 60_000;
const DEADLINE_MARGIN_MS = 30_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const SEND_ROUTE = "/ramp-send";

const INITIAL_STATE: RampState = {
  phase: "loading",
  busy: false,
  message: null,
  session: null,
  status: null,
  pendingSend: null,
  refundAddress: null,
  archive: [],
};

const RampContext = createContext<Ramp | null>(null);

function describeError(error: unknown): string {
  if (error instanceof PspError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function refusalMessage(error: unknown): string {
  if (error instanceof ZecSendHandoffRefusedError) {
    switch (error.reason) {
      case "answered":
        return "This send request was already answered. Check wallet history and status. Do not send again.";
      case "past-deadline":
        return "This send request passed its deadline. Reopen 0xramp to get a new one.";
      case "closed":
        return "0xramp no longer accepts this deposit. Check status.";
      case "mismatch":
      case "not-recorded":
        return "This link is not the send request 0xramp recorded. Nothing was sent.";
    }
  }
  return `The send request could not be verified (${describeError(error)}). Nothing was sent. Reopen 0xramp so it can offer the link again.`;
}

function resumeEvidence(reply: HostToPaneMessage): ZecSendResumeEvidence | undefined {
  if (reply.type === "psp/zec-send-result") {
    return { txid: reply.payload.txid, ...(reply.payload.txids ? { txids: reply.payload.txids } : {}) };
  }
  if (reply.type === "psp/zec-send-pending" && reply.payload.txids && reply.payload.txids.length > 1) {
    return { txids: reply.payload.txids };
  }
  return undefined;
}

function receipt(status: SessionStatus): string {
  const fiat = status.fiat ? ` · ${status.fiat.amountDisplay} ${status.fiat.currency}` : "";
  return `Sale ${status.outcome}${fiat}`;
}

export function RampProvider({ children }: { children: ReactNode }) {
  const { status: walletStatus } = useWallet();
  const colors = useColors();
  const palette = useRef<Colors>(colors);
  palette.current = colors;

  const [state, setState] = useState<RampState>(INITIAL_STATE);
  const live = useRef<RampState>(INITIAL_STATE);
  const ready = useRef<Promise<void> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const statusRequest = useRef<Promise<void> | null>(null);
  const handledLinks = useRef(new Map<string, number>());
  const deadlineTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function update(patch: Partial<RampState>) {
    live.current = { ...live.current, ...patch };
    setState(live.current);
  }

  function patchPending(requestId: string, patch: Partial<PendingSend>) {
    const pending = live.current.pendingSend;
    if (pending?.request.requestId === requestId) {
      update({ pendingSend: { ...pending, ...patch } });
    }
  }

  function disarmDeadline() {
    clearTimeout(deadlineTimer.current);
    deadlineTimer.current = undefined;
  }

  function armDeadline(deadline: string) {
    disarmDeadline();
    const wait = Date.parse(deadline) - Date.now() - DEADLINE_MARGIN_MS;
    deadlineTimer.current = setTimeout(() => {
      void abandonPending("deadline passed", "The send request reached its deadline. Nothing was sent.");
    }, Math.min(Math.max(0, wait), MAX_TIMEOUT_MS));
  }

  async function abandonPending(reason: string, message: string | null): Promise<void> {
    const pending = live.current.pendingSend;
    if (pending === null || pending.sending) {
      return;
    }
    disarmDeadline();
    await walletBackend.discardProposal().catch(() => undefined);
    await settlePending({ cancel: true, reason }, message);
  }

  function initialize(): Promise<void> {
    ready.current ??= (async () => {
      try {
        update({ archive: await readArchivedSessions() });
      } catch (error) {
        console.warn("Archived sessions unavailable:", describeError(error));
      }
      try {
        const saved = await readSavedRamp();
        if (saved === null) {
          update({ phase: "idle" });
        } else if (saved.state === "creating") {
          update({
            phase: "blocked",
            message: "A previous session creation did not finish. Reconcile it with 0xramp before a new sale, or forget it.",
          });
        } else {
          const session = ramp.restoreSession(saved.session);
          update({ phase: "active", session, message: "A saved session is open." });
        }
      } catch (error) {
        update({ phase: "blocked", message: `The saved session could not be read (${describeError(error)}). Forget it to start again.` });
      }
    })();
    return ready.current;
  }

  function exclusive(run: () => Promise<void>): Promise<void> {
    const next = queue.current.then(async () => {
      await initialize();
      await run();
    });
    queue.current = next.catch(() => undefined);
    return next;
  }

  async function refreshStatus(): Promise<void> {
    await initialize();
    const session = live.current.session;
    if (session === null) {
      return;
    }
    if (statusRequest.current) {
      return statusRequest.current;
    }
    statusRequest.current = (async () => {
      try {
        const status = await ramp.getStatus(session.sessionRef);
        if (live.current.session?.sessionRef !== session.sessionRef) {
          return;
        }
        if (status.outcome === "expired") {
          update({ status, phase: "blocked", message: "The session expired. Reconcile any late deposit before a new sale, or forget it." });
        } else if (status.terminal) {
          await abandonPending("session ended", null);
          await writeSavedRamp(null);
          update({ phase: "idle", session: null, status, message: receipt(status) });
        } else {
          update({ status, message: `Status: ${status.outcome}` });
        }
      } catch (error) {
        update({ message: `Status unavailable (${describeError(error)}). The session is kept. Do not send again.` });
      } finally {
        statusRequest.current = null;
      }
    })();
    return statusRequest.current;
  }

  async function resumePane(evidence: ZecSendResumeEvidence): Promise<void> {
    const session = live.current.session;
    if (session === null) {
      update({ message: "The send is recorded, but no session is open to resume. Status stays the receipt." });
      return;
    }
    let url: string;
    try {
      url = buildZecSendResumeUrl(session.sessionUrl, evidence);
    } catch (error) {
      update({ message: `The send is recorded, but the resume link could not be built (${describeError(error)}). Reopen 0xramp; status reconciles.` });
      return;
    }
    const back = await openPane(url, palette.current);
    if (back) {
      void handleLink(back);
    }
  }

  async function settlePending(outcome: ZecSendOutcome | undefined, message: string | null): Promise<void> {
    const pending = live.current.pendingSend;
    if (pending === null) {
      return;
    }
    disarmDeadline();
    const reply = buildZecSendReply(pending.sessionRef, pending.request.requestId, outcome);
    let persisted = true;
    try {
      await sendStore.complete(pending.sessionRef, pending.request, reply);
    } catch {
      persisted = false;
    }
    const evidence = resumeEvidence(reply);
    update({
      pendingSend: null,
      message: persisted
        ? message
        : "The send outcome could not be journaled. Reconcile with wallet history before any retry. Do not send again.",
    });
    if (evidence) {
      await resumePane(evidence);
    }
  }

  async function runHandoff(url: string, sessionRef: string): Promise<void> {
    if (live.current.pendingSend) {
      update({ message: "A send request is already waiting for confirmation." });
      return;
    }
    let request: ZecSendRequestPayload;
    let deadline: string;
    try {
      ({ request, deadline } = await ramp.verifyZecSendHandoff(url, { sessionRef }));
    } catch (error) {
      update({ message: refusalMessage(error) });
      return;
    }
    let previous;
    try {
      previous = await sendStore.claim(sessionRef, request);
    } catch (error) {
      update({ message: `The send request could not be journaled (${describeError(error)}). Reconcile before proceeding.` });
      return;
    }
    if (previous !== undefined) {
      const evidence = previous.reply ? resumeEvidence(previous.reply) : undefined;
      update({
        message: previous.reply
          ? "This send request was already answered. Do not send again."
          : "This send request is still unresolved. Reconcile wallet history before sending again.",
      });
      if (evidence) {
        await resumePane(evidence);
      }
      return;
    }
    if (live.current.phase !== "active" || live.current.session?.sessionRef !== sessionRef) {
      update({ pendingSend: { sessionRef, request, deadline, proposal: null, proposalError: null, sending: false } });
      await settlePending({ cancel: true, reason: "wallet confirmation not started" }, "The session ended before the wallet was asked. Nothing was sent.");
      return;
    }
    update({
      pendingSend: { sessionRef, request, deadline, proposal: null, proposalError: null, sending: false },
      message: null,
    });
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.push(SEND_ROUTE);
    armDeadline(deadline);
    try {
      const proposal = await walletBackend.proposeSend(request.address, Number(request.amountZat));
      patchPending(request.requestId, { proposal });
    } catch (error) {
      patchPending(request.requestId, { proposalError: toWalletError(error).reason });
    }
  }

  async function handleLink(url: string): Promise<void> {
    const kind = rampLinkKind(url);
    if (kind === null) {
      return;
    }
    const now = Date.now();
    const seen = handledLinks.current.get(url);
    if (seen !== undefined && now - seen < LINK_REPLAY_WINDOW_MS) {
      return;
    }
    handledLinks.current.set(url, now);
    await initialize();
    const session = live.current.session;
    if (kind === "handoff") {
      if (live.current.phase !== "active" || session === null) {
        update({ message: "A send request arrived with no open session. Check status." });
        return;
      }
      await exclusive(() => runHandoff(url, session.sessionRef));
      return;
    }
    try {
      const parsed = ramp.parseReturnUrl(url);
      if (session !== null && parsed.sessionRef === session.sessionRef) {
        await refreshStatus();
      }
    } catch {
      return;
    }
  }

  function open(): Promise<void> {
    return exclusive(async () => {
      if (live.current.phase === "blocked" || live.current.busy) {
        return;
      }
      update({ busy: true });
      try {
        let session = live.current.session;
        if (session === null) {
          const partnerSessionId = `zingo-${Date.now()}`;
          update({ message: "Creating session…" });
          try {
            await writeSavedRamp({ state: "creating", partnerSessionId });
            session = await ramp.createSession({
              direction: "sell",
              asset: "ZEC",
              fiat: RAMP_FIAT,
              returnUrl: RAMP_RETURN_URL,
              partnerSessionId,
            });
            await writeSavedRamp({ state: "active", session });
            update({ phase: "active", session, status: null, message: "Session created. Opening 0xramp…" });
          } catch (error) {
            update({
              phase: "blocked",
              message: `Session creation is unresolved (${describeError(error)}). Reconcile with 0xramp before retrying, or forget it.`,
            });
            return;
          }
        } else {
          await refreshStatus();
          if (live.current.session === null || live.current.phase !== "active") {
            return;
          }
          if (Date.parse(session.expiresAt) <= Date.now()) {
            update({ message: "The session URL expired. Check status. Forget the session to start a new sale." });
            return;
          }
          update({ message: "Opening 0xramp…" });
        }
        if (!ramp.isAllowedPaneUrl(session.sessionUrl)) {
          update({ message: "The session page is outside the 0xramp origin. It was not opened." });
          return;
        }
        const back = await openPane(session.sessionUrl, palette.current);
        if (back) {
          void handleLink(back);
        } else if (live.current.pendingSend === null) {
          update({ message: "0xramp closed. Reopen it to continue the sale." });
        }
      } finally {
        update({ busy: false });
      }
    });
  }

  function forget(): Promise<void> {
    return exclusive(async () => {
      await abandonPending("session forgotten", null);
      const session = live.current.session;
      if (session !== null) {
        await archiveSession(session);
        update({ archive: await readArchivedSessions() });
      }
      await writeSavedRamp(null);
      update({ phase: "idle", session: null, status: null, message: null });
    });
  }

  function resumeArchived(sessionRef: string): Promise<void> {
    return exclusive(async () => {
      if (live.current.phase !== "idle") {
        update({ message: "Forget the current session before reopening a previous one." });
        return;
      }
      const archived = live.current.archive.find((session) => session.sessionRef === sessionRef);
      if (archived === undefined) {
        return;
      }
      let session: RampSession;
      try {
        session = ramp.restoreSession(archived);
      } catch (error) {
        update({ message: `The previous session could not be restored (${describeError(error)}).` });
        return;
      }
      await removeArchivedSession(sessionRef);
      await writeSavedRamp({ state: "active", session });
      update({ phase: "active", session, status: null, archive: await readArchivedSessions(), message: "Previous session restored." });
      void open();
    });
  }

  async function confirmSend(): Promise<void> {
    const pending = live.current.pendingSend;
    if (pending === null || pending.proposal === null || pending.sending) {
      return;
    }
    disarmDeadline();
    patchPending(pending.request.requestId, { sending: true });
    let outcome: ZecSendOutcome | undefined;
    let message: string | null = "ZEC sent. Reopening 0xramp with the transaction…";
    try {
      const txids = await walletBackend.sendProposed();
      const [first] = txids;
      outcome = txids.length === 1 && first ? { txid: first } : { txids };
    } catch (error) {
      outcome = undefined;
      message = `The send did not report a result (${toWalletError(error).reason}). Do not send again. Reconcile with wallet history and status.`;
    }
    await settlePending(outcome, message);
  }

  function declineSend(): Promise<void> {
    return abandonPending("user declined", "Send declined. Nothing was sent. 0xramp keeps the sale open until its deadline.");
  }

  useEffect(() => {
    let mounted = true;
    void initialize().then(async () => {
      const url = await Linking.getInitialURL();
      if (mounted && url) {
        await handleLink(url);
      }
      if (mounted) {
        await refreshStatus();
      }
    });
    const links = Linking.addEventListener("url", (event) => {
      void handleLink(event.url);
    });
    const foreground = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void refreshStatus();
      }
    });
    return () => {
      mounted = false;
      links.remove();
      foreground.remove();
      disarmDeadline();
    };
  }, []);

  useEffect(() => {
    if (walletStatus === "none" && (live.current.session !== null || live.current.phase === "blocked")) {
      void forget();
    }
    if (walletStatus !== "ready") {
      update({ refundAddress: null });
      return;
    }
    let current = true;
    walletBackend.transparentAddress().then(
      (address) => {
        if (current) {
          update({ refundAddress: address });
        }
      },
      (error) => {
        console.warn("Refund address unavailable:", toWalletError(error).reason);
      },
    );
    return () => {
      current = false;
    };
  }, [walletStatus]);

  const value: Ramp = { ...state, open, refreshStatus, forget, resumeArchived, confirmSend, declineSend };

  return <RampContext value={value}>{children}</RampContext>;
}

export function useRamp(): Ramp {
  const value = use(RampContext);
  if (!value) {
    throw new Error("useRamp must be used inside RampProvider");
  }
  return value;
}
