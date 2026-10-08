import type { GameLogEntry } from "@hero/engine";
import { openHeroOfflineDb, SUBMISSION_QUEUE_STORE } from "./offlineDb";
import { getSupabase } from "./supabase";
import { isConfirmedSubmissionResponse, submissionServerErrorCode } from "./submissionReceipt";
import { serializeSubmissionForSession } from "./submissionSerial";

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
  state: "pending" | "blocked";
  queuedAt: string;
  updatedAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export type SubmissionResult =
  | { status: "submitted"; data: unknown }
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
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) throw new Error("submission_queue_unavailable");

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SUBMISSION_QUEUE_STORE, "readwrite");
      transaction.objectStore(SUBMISSION_QUEUE_STORE).put(record);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("submission_queue_write_failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("submission_queue_write_aborted"));
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
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SUBMISSION_QUEUE_STORE, "readwrite");
      transaction.objectStore(SUBMISSION_QUEUE_STORE).delete(sessionId);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("submission_queue_delete_failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("submission_queue_delete_aborted"));
    });
  } finally {
    db.close();
  }
}

async function enqueueForUser(
  userId: string,
  input: QueueableSessionSubmission,
  reason: string,
): Promise<void> {
  const existing = (await listQueuedSubmissions(userId)).find(
    (item) => item.sessionId === input.body.sessionId,
  );
  const now = new Date().toISOString();

  await writeQueueRecord({
    formatVersion: 1,
    sessionId: input.body.sessionId,
    userId,
    scenarioId: input.scenarioId,
    body: input.body,
    state: "pending",
    queuedAt: existing?.queuedAt ?? now,
    updatedAt: now,
    attempts: existing?.attempts ?? 0,
    lastAttemptAt: existing?.lastAttemptAt ?? null,
    lastError: reason,
  });
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

    if (!online()) {
      await enqueueForUser(userId, input, "offline");
      return { status: "queued", reason: "offline" };
    }

    const attempt = await invokeSubmission(input.body);

    if (attempt.ok) {
      await removeQueuedSubmission(input.body.sessionId);
      return { status: "submitted", data: attempt.data };
    }

    const reason = attempt.message ?? "submit_session_failed";

    if (isRetryableSubmissionStatus(attempt.httpStatus, attempt.message)) {
      await enqueueForUser(userId, input, reason);
      return { status: "queued", reason };
    }

    // If an earlier offline copy exists, a permanent rejection must stop
    // automatic retries without silently discarding the stored actions.
    const existing = (await listQueuedSubmissions(userId)).find(
      (item) => item.sessionId === input.body.sessionId,
    );
    if (existing) await updateAttempt(existing, attempt, "blocked");

    return {
      status: "rejected",
      reason,
      httpStatus: attempt.httpStatus,
    };
  });
}

async function runFlush(userId: string): Promise<SubmissionFlushResult> {
  const queued = (await listQueuedSubmissions(userId)).filter(
    (item) => item.state === "pending",
  );
  if (!online()) {
    return { submitted: 0, blocked: 0, remaining: queued.length };
  }

  let submitted = 0;
  let blocked = 0;

  for (const snapshot of queued) {
    if (!online()) break;

    const outcome = await serializeSubmissionForSession(
      userId,
      snapshot.sessionId,
      async () => {
        // A queued flush may have waited behind a successful foreground
        // submission. Re-read after acquiring the session lock rather
        // than resurrecting its stale snapshot.
        if (!online()) return "offline";
        let signedInUserId: string;
        try {
          signedInUserId = await currentUserId();
        } catch {
          return "auth_unavailable";
        }
        if (signedInUserId !== userId) return "auth_unavailable";

        const item = (await listQueuedSubmissions(userId)).find(
          (candidate) => candidate.sessionId === snapshot.sessionId &&
            candidate.state === "pending" && candidate.userId === userId,
        );
        if (!item) return "skipped";

        const attempt = await invokeSubmission(item.body);
        if (attempt.ok) {
          await removeQueuedSubmission(item.sessionId);
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
    (item) => item.state === "pending",
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

export async function retryBlockedSubmission(
  sessionId: string,
  userId: string,
): Promise<void> {
  const item = (await listQueuedSubmissions(userId)).find(
    (candidate) => candidate.sessionId === sessionId,
  );

  if (!item || item.state !== "blocked") return;

  await writeQueueRecord({
    ...item,
    state: "pending",
    updatedAt: new Date().toISOString(),
    lastError: null,
  });

  if (online()) {
    await flushQueuedSubmissions(userId);
  }
}

export function startSubmissionQueueProcessor(
  userId: string,
): () => void {
  if (typeof window === "undefined") return () => {};

  let active = true;

  const flush = () => {
    if (!active || !online()) return;
    void flushQueuedSubmissions(userId).catch(() => {
      // The queue remains durable. A later reconnect/visibility change retries.
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
