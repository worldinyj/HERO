import type { GameLogEntry } from "@hero/engine";
import { openHeroOfflineDb, SUBMISSION_QUEUE_STORE } from "./offlineDb";
import { getSupabase } from "./supabase";
import { isConfirmedSubmissionResponse, submissionServerErrorCode } from "./submissionReceipt";
import { serializeSubmissionForSession } from "./submissionSerial";
import { cleanupAfterConfirmedCommit } from "./submissionCleanup";
import { clearCompetitiveSessionIfMatches } from "./competitivePersistence";
import { markQueueCommitted, queueStateNeedsNetwork, hasVerifiedCommittedReceipt } from "./submissionQueueState";
import { decideQueueWrite, type QueueWriteOptions } from "./submissionQueueWritePolicy";
import { decideConfirmedQueueDeletion } from "./submissionQueueDeletePolicy";
import { stageForegroundSubmission } from "./submissionForegroundStore";

export type SessionSubmissionAction =
  | { type: "continue" }
  | { type: "choice"; actionId: string }
  | { type: "info"; actionId: string }
  | { type: "card"; cardId: string };

export interface SessionSubmissionBody {
  sessionId: string;
  actions: SessionSubmissionAction[];
  reflectionAnswered: boolean;
  swissCheeseViewed: boolean;
}

export interface QueueableSessionSubmission {
  scenarioId: string;
  body: SessionSubmissionBody;
}

export interface PendingSessionSubmission extends QueueableSessionSubmission {
  formatVersion: 1;
  sessionId: string;
  userId: string;
  state: "pending" | "blocked" | "committed";
  completionReceipt?: unknown;
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export type SubmissionResult =
  | { status: "submitted"; data: unknown; cleanupPending: boolean }
  | { status: "queued"; reason: string }
  | { status: "rejected"; reason: string; httpStatus: number | null };

export interface SubmissionFlushResult {
  submitted: number;
  blocked: number;
  remaining: number;
}

interface AttemptResult {
  ok: boolean;
  data?: unknown;
  message?: string;
  httpStatus: number | null;
}

const activeFlushes = new Map<string, Promise<SubmissionFlushResult>>();

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "submit_session_failed";
}

export function submissionHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("context" in error)) {
    return null;
  }

  const context = (error as { context?: unknown }).context;
  return context instanceof Response ? context.status : null;
}

export function isRetryableSubmissionStatus(
  status: number | null,
  errorCode: string | null = null,
): boolean {
  if (status === 403 && errorCode === "plant_inactive") return true;
  return (
    status === null ||
    status === 401 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export function gameLogToSubmissionActions(
  log: GameLogEntry[],
  startIndex = 0,
): SessionSubmissionAction[] {
  const safeStart = Math.max(0, Math.min(log.length, Math.trunc(startIndex)));

  return log.slice(safeStart).flatMap<SessionSubmissionAction>((entry) => {
    if (entry.actionType === "hazard_check") return [];

    if (entry.actionType === "continue") {
      return [{ type: "continue" }];
    }

    if (!entry.actionId) {
      return [];
    }

    if (entry.actionType === "choice") {
      return [{ type: "choice", actionId: entry.actionId }];
    }

    if (entry.actionType === "info") {
      return [{ type: "info", actionId: entry.actionId }];
    }

    return [{ type: "card", cardId: entry.actionId }];
  });
}

async function currentUserId(): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;
  if (!data.session?.user.id) {
    throw new Error("authenticated_session_required");
  }

  return data.session.user.id;
}

async function invokeSubmission(
  body: SessionSubmissionBody,
): Promise<AttemptResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.functions.invoke("submit-session", {
      body,
    });

    if (error) {
      return {
        ok: false,
        message: submissionHttpStatus(error) === 403 &&
          (await submissionServerErrorCode(error)) === "plant_inactive"
          ? "plant_inactive" : errorMessage(error),
        httpStatus: submissionHttpStatus(error),
      };
    }

    if (!isConfirmedSubmissionResponse(data, body.sessionId)) {
      // A malformed 2xx might follow COMMIT. Never discard cached choices.
      return { ok: false, message: "submission_result_unknown", httpStatus: null };
    }
    return { ok: true, data, httpStatus: 200 };
  } catch (error) {
    return {
      ok: false,
      message: errorMessage(error),
      httpStatus: submissionHttpStatus(error),
    };
  }
}

async function writeQueueRecord(
  record: PendingSessionSubmission,
  options: QueueWriteOptions = {},
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) throw new Error("submission_queue_unavailable");

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SUBMISSION_QUEUE_STORE, "readwrite");
      const store = transaction.objectStore(SUBMISSION_QUEUE_STORE);
      let policyError: Error | null = null;
      // Check and put inside the SAME readwrite transaction. Even without
      // Web Locks, a stale tab cannot downgrade a committed completion.
      const request = store.get(record.sessionId);
      request.onsuccess = () => {
        const existing = request.result as PendingSessionSubmission | undefined;
        const decision = decideQueueWrite(existing, record, options);
        if (decision === "preserve_committed" ||
            decision === "preserve_blocked" ||
            decision === "preserve_newer_attempt") return;
        if (decision !== "write") {
          policyError = new Error("submission_queue_" + decision);
          transaction.abort();
          return;
        }
        try {
          store.put(record);
        } catch (error) {
          policyError = error instanceof Error
            ? error : new Error("submission_queue_write_failed");
          transaction.abort();
        }
      };
      request.onerror = () => {
        policyError = request.error ?? new Error("submission_queue_read_failed");
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(policyError ?? transaction.error ??
          new Error("submission_queue_write_failed"));
      transaction.onabort = () =>
        reject(policyError ?? transaction.error ??
          new Error("submission_queue_write_aborted"));
    });
  } finally {
    db.close();
  }
}

export async function listQueuedSubmissions(
  userId?: string,
): Promise<PendingSessionSubmission[]> {
  const db = await openHeroOfflineDb();
  if (!db) return [];

  try {
    const rows = await new Promise<PendingSessionSubmission[]>(
      (resolve, reject) => {
        const transaction = db.transaction(SUBMISSION_QUEUE_STORE, "readonly");
        const store = transaction.objectStore(SUBMISSION_QUEUE_STORE);
        const request = userId
          ? store.index("userId").getAll(userId)
          : store.getAll();

        request.onsuccess = () =>
          resolve(
            (request.result as PendingSessionSubmission[]).sort((a, b) =>
              a.queuedAt.localeCompare(b.queuedAt),
            ),
          );
        request.onerror = () =>
          reject(request.error ?? new Error("submission_queue_read_failed"));
      },
    );

    return rows;
  } finally {
    db.close();
  }
}

export async function removeQueuedSubmission(
  sessionId: string,
  userId: string,
  scenarioId: string,
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) throw new Error("submission_queue_unavailable");

  try {
    await new Promise<void>((resolve, reject) => {
      // The final read and delete are in the SAME readwrite transaction.
      // Do not delete a row overwritten/replaced by another browser tab.
      const transaction = db.transaction(SUBMISSION_QUEUE_STORE, "readwrite");
      const store = transaction.objectStore(SUBMISSION_QUEUE_STORE);
      let policyError: Error | null = null;
      const request = store.get(sessionId);
      request.onsuccess = () => {
        const stored = request.result as PendingSessionSubmission | undefined;
        const decision = decideConfirmedQueueDeletion(
          stored, userId, scenarioId, sessionId,
        );
        if (decision === "absent") return;
        if (decision !== "delete") {
          policyError = new Error("submission_queue_delete_" + decision);
          transaction.abort();
          return;
        }
        try {
          store.delete(sessionId);
        } catch (error) {
          policyError = error instanceof Error
            ? error : new Error("submission_queue_delete_failed");
          transaction.abort();
        }
      };
      request.onerror = () => {
        policyError = request.error ??
          new Error("submission_queue_delete_read_failed");
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(policyError ?? transaction.error ??
          new Error("submission_queue_delete_failed"));
      transaction.onabort = () =>
        reject(policyError ?? transaction.error ??
          new Error("submission_queue_delete_aborted"));
    });
  } finally {
    db.close();
  }
}

/**
 * One failed cache deletion cannot cancel a verified server receipt or
 * prevent cleanup of the other local record.
 */
async function cleanupConfirmedLocalSession(
  userId: string,
  scenarioId: string,
  sessionId: string,
  knownItem?: PendingSessionSubmission,
  receipt?: unknown,
  submission?: QueueableSessionSubmission,
): Promise<{ cleanupPending: boolean }> {
  // Persist a server-confirmed marker BEFORE any local deletion. If deletion
  // aborts, it is never safe to send this completed row over the network.
  const marker = await cleanupAfterConfirmedCommit(async () => {
    const item = knownItem ?? (await listQueuedSubmissions(userId)).find(
      (candidate) => candidate.sessionId === sessionId &&
        candidate.userId === userId,
    );
    const now = new Date().toISOString();
    if (item) {
      // An existing marker may come from a pre-receipt client. Upgrade it
      // only with a real matching receipt, never invented local scores.
      if (item.state !== "committed" ||
          (isConfirmedSubmissionResponse(receipt, sessionId) &&
           !hasVerifiedCommittedReceipt(item))) {
        await writeQueueRecord(markQueueCommitted(item, now, receipt));
      }
    } else if (submission && isConfirmedSubmissionResponse(receipt, sessionId)) {
      // Foreground first-time completion may have no queue row. Create a
      // durable receipt marker before touching either local cache.
      await writeQueueRecord({
        formatVersion: 1,
        sessionId,
        userId,
        scenarioId,
        body: submission.body,
        state: "committed",
        completionReceipt: receipt,
        queuedAt: now,
        updatedAt: now,
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
      });
    }
  });

  // If receipt marker persistence failed, preserve any existing pending
  // choices. A confirmed server response must never erase unmarked evidence.
  if (marker.cleanupPending) return { cleanupPending: true };

  // Delete the queue marker LAST so failed game-cache cleanup is recoverable.
  const cached = await cleanupAfterConfirmedCommit(async () => {
    await clearCompetitiveSessionIfMatches(userId, scenarioId, sessionId);
  });
  const queued = cached.cleanupPending
    ? { cleanupPending: true }
    : await cleanupAfterConfirmedCommit(() =>
        removeQueuedSubmission(sessionId, userId, scenarioId)
      );
  return { cleanupPending: cached.cleanupPending || queued.cleanupPending };
}

async function updateAttempt(
  item: PendingSessionSubmission,
  attempt: AttemptResult,
  state: "pending" | "blocked",
): Promise<void> {
  const now = new Date().toISOString();

  await writeQueueRecord({
    ...item,
    state,
    updatedAt: now,
    attempts: item.attempts + 1,
    lastAttemptAt: now,
    lastError: attempt.message ?? "submit_session_failed",
  });
}

export async function submitSessionWithQueue(
  input: QueueableSessionSubmission,
): Promise<SubmissionResult> {
  const userId = await currentUserId();

  // The page submit and the background queue must not write the same IDB
  // record or invoke this session concurrently in the same JS context.
  return serializeSubmissionForSession(userId, input.body.sessionId, async () => {
    if ((await currentUserId()) !== userId) {
      throw new Error("authenticated_session_changed");
    }

    // A previous getAll snapshot is unnecessary and may be stale. The single
    // readwrite preflight below verifies the CURRENT owner, scenario, body
    // and terminal state before any network call or local cleanup.
    const preparation = await stageForegroundSubmission(userId, input);
    if (preparation.kind === "conflict") {
      return {
        status: "rejected",
        reason: "submission_queue_payload_conflict",
        httpStatus: null,
      };
    }
    if (preparation.kind === "blocked") {
      return {
        status: "rejected",
        reason: "submission_blocked_requires_manual_retry",
        httpStatus: null,
      };
    }
    if (preparation.kind === "committed") {
      if (!hasVerifiedCommittedReceipt(preparation.record)) {
        return { status: "queued", reason: "confirmed_cleanup_pending" };
      }
      const { cleanupPending } = await cleanupConfirmedLocalSession(
        userId, preparation.record.scenarioId, preparation.record.sessionId,
        preparation.record,
      );
      return {
        status: "submitted",
        data: preparation.record.completionReceipt,
        cleanupPending,
      };
    }
    if (!online()) {
      return { status: "queued", reason: "offline" };
    }

    // User credentials can change while waiting for IndexedDB.
    if ((await currentUserId()) !== userId) {
      throw new Error("authenticated_session_changed");
    }
    const attempt = await invokeSubmission(preparation.record.body);
    if (attempt.ok) {
      const { cleanupPending } = await cleanupConfirmedLocalSession(
        userId, preparation.record.scenarioId, preparation.record.sessionId,
        preparation.record, attempt.data,
      );
      return { status: "submitted", data: attempt.data, cleanupPending };
    }

    const reason = attempt.message ?? "submit_session_failed";
    if (isRetryableSubmissionStatus(attempt.httpStatus, attempt.message)) {
      await updateAttempt(preparation.record, attempt, "pending");
      return { status: "queued", reason };
    }

    // Permanent server refusal requires an explicit future manual retry.
    await updateAttempt(preparation.record, attempt, "blocked");
    return {
      status: "rejected",
      reason: "submission_blocked_requires_manual_retry",
      httpStatus: attempt.httpStatus,
    };
  });
}

async function runFlush(userId: string): Promise<SubmissionFlushResult> {
  // Committed entries require local cleanup ONLY, even without internet.
  const snapshots = (await listQueuedSubmissions(userId))
    .filter((item) => item.state === "committed" || item.state === "pending")
    .sort((a, b) =>
      (a.state === "committed" ? 0 : 1) -
      (b.state === "committed" ? 0 : 1) ||
      a.queuedAt.localeCompare(b.queuedAt)
    );
  let submitted = 0;
  let blocked = 0;

  for (const snapshot of snapshots) {
    if (!online() && queueStateNeedsNetwork(snapshot.state)) break;
    const outcome = await serializeSubmissionForSession(
      userId,
      snapshot.sessionId,
      async () => {
        let signedInUserId: string;
        try {
          signedInUserId = await currentUserId();
        } catch {
          return "auth_unavailable";
        }
        if (signedInUserId !== userId) return "auth_unavailable";

        const item = (await listQueuedSubmissions(userId)).find(
          (candidate) => candidate.sessionId === snapshot.sessionId &&
            candidate.userId === userId,
        );
        if (!item || item.state === "blocked") return "skipped";

        if (item.state === "committed") {
          if (!hasVerifiedCommittedReceipt(item)) {
            // Legacy/unverified marker: retain evidence for manual review.
            // It is not eligible for API re-submission or local deletion.
            return "unverified_committed";
          }
          await cleanupConfirmedLocalSession(
            userId, item.scenarioId, item.sessionId, item,
          );
          return "cleaned";
        }

        if (!online()) return "offline";
        const attempt = await invokeSubmission(item.body);
        if (attempt.ok) {
          await cleanupConfirmedLocalSession(
            userId, item.scenarioId, item.sessionId, item, attempt.data,
          );
          return "submitted";
        }
        if (isRetryableSubmissionStatus(attempt.httpStatus, attempt.message)) {
          await updateAttempt(item, attempt, "pending");
          return "retryable";
        }
        await updateAttempt(item, attempt, "blocked");
        return "blocked";
      },
    );
    if (outcome === "submitted") submitted += 1;
    if (outcome === "blocked") blocked += 1;
    if (
      outcome === "retryable" || outcome === "offline" ||
      outcome === "auth_unavailable"
    ) break;
  }

  const remaining = (await listQueuedSubmissions(userId)).filter(
    (item) => queueStateNeedsNetwork(item.state),
  ).length;
  return { submitted, blocked, remaining };
}

export function flushQueuedSubmissions(
  userId: string,
): Promise<SubmissionFlushResult> {
  const existing = activeFlushes.get(userId);
  if (existing) return existing;

  const promise = runFlush(userId).finally(() => {
    activeFlushes.delete(userId);
  });

  activeFlushes.set(userId, promise);
  return promise;
}

/**
 * Explicit player-initiated retry of a permanently blocked submission.
 * Always send the immutable choices already stored in IndexedDB, rather
 * than reconstructing a possibly stale game log from the React component.
 * Hold the session lock through the receipt and cleanup.
 */
export async function retryBlockedSubmission(
  sessionId: string,
  userId: string,
  scenarioId?: string,
): Promise<SubmissionResult> {
  return serializeSubmissionForSession(userId, sessionId, async () => {
    if ((await currentUserId()) !== userId) {
      throw new Error("authenticated_session_changed");
    }
    const item = (await listQueuedSubmissions(userId)).find(
      (candidate) => candidate.sessionId === sessionId &&
        candidate.userId === userId,
    );
    if (!item || item.state !== "blocked") {
      return {
        status: "rejected", reason: "blocked_submission_not_found",
        httpStatus: null,
      };
    }
    if (scenarioId && item.scenarioId !== scenarioId) {
      return {
        status: "rejected", reason: "blocked_submission_scenario_mismatch",
        httpStatus: null,
      };
    }
    if (!online()) {
      return { status: "queued", reason: "offline_manual_retry_unavailable" };
    }

    // The only allowed blocked -> pending transition.
    await writeQueueRecord({
      ...item,
      state: "pending",
      updatedAt: new Date().toISOString(),
      lastError: null,
    }, { allowBlockedRetry: true });

    // A concurrent tab could have committed while we awaited the IDB
    // transaction. Never retransmit a verified completed session.
    const current = (await listQueuedSubmissions(userId)).find(
      (candidate) => candidate.sessionId === sessionId &&
        candidate.userId === userId,
    );
    if (current?.state === "committed") {
      if (!hasVerifiedCommittedReceipt(current)) {
        return { status: "queued", reason: "confirmed_cleanup_pending" };
      }
      const { cleanupPending } = await cleanupConfirmedLocalSession(
        userId, current.scenarioId, sessionId, current,
      );
      return {
        status: "submitted", data: current.completionReceipt, cleanupPending,
      };
    }
    if (!current || current.state !== "pending") {
      return {
        status: "rejected", reason: "blocked_submission_not_found",
        httpStatus: null,
      };
    }

    const attempt = await invokeSubmission(current.body);
    if (attempt.ok) {
      const { cleanupPending } = await cleanupConfirmedLocalSession(
        userId, current.scenarioId, sessionId, current, attempt.data,
      );
      return { status: "submitted", data: attempt.data, cleanupPending };
    }

    const reason = attempt.message ?? "submit_session_failed";
    if (isRetryableSubmissionStatus(attempt.httpStatus, attempt.message)) {
      await updateAttempt(current, attempt, "pending");
      return { status: "queued", reason };
    }

    // Permanent rejections require another explicit manual decision.
    await updateAttempt(current, attempt, "blocked");
    return {
      status: "rejected",
      reason: "submission_blocked_requires_manual_retry",
      httpStatus: attempt.httpStatus,
    };
  });
}

export function startSubmissionQueueProcessor(
  userId: string,
): () => void {
  if (typeof window === "undefined") return () => {};

  let active = true;

  const flush = () => {
    if (!active) return;
    // "committed" rows need only local IndexedDB cleanup and must also run
    // while offline. Pending network submissions are skipped by runFlush.
    void flushQueuedSubmissions(userId).catch(() => {
      // Keep durable rows; retry on later visibility/network change.
    });
  };

  const handleVisibility = () => {
    if (document.visibilityState === "visible") flush();
  };

  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", handleVisibility);
  queueMicrotask(flush);

  return () => {
    active = false;
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
