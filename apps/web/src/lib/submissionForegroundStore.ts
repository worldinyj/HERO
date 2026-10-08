import { openHeroOfflineDb, SUBMISSION_QUEUE_STORE } from "./offlineDb";
import { decideForegroundStage } from "./submissionForegroundStagePolicy";
import type { PendingSessionSubmission, QueueableSessionSubmission } from "./submissionQueue";

export type ForegroundPreparation =
  | { kind: "ready"; record: PendingSessionSubmission }
  | { kind: "committed"; record: PendingSessionSubmission }
  | { kind: "blocked" }
  | { kind: "conflict" };

/**
 * A new online submission must be durable BEFORE its first server request.
 * Check existing evidence and conditionally store the pending row within
 * the same IndexedDB readwrite transaction.
 */
export async function stageForegroundSubmission(
  userId: string,
  input: QueueableSessionSubmission,
): Promise<ForegroundPreparation> {
  const db = await openHeroOfflineDb();
  if (!db) throw new Error("submission_queue_unavailable");
  const now = new Date().toISOString();
  const newRecord: PendingSessionSubmission = {
    formatVersion: 1,
    sessionId: input.body.sessionId,
    userId,
    scenarioId: input.scenarioId,
    body: input.body,
    state: "pending",
    queuedAt: now,
    updatedAt: now,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  try {
    return await new Promise<ForegroundPreparation>((resolve, reject) => {
      const tx = db.transaction(SUBMISSION_QUEUE_STORE, "readwrite");
      const store = tx.objectStore(SUBMISSION_QUEUE_STORE);
      let result: ForegroundPreparation | null = null;
      let policyError: Error | null = null;
      const request = store.get(newRecord.sessionId);
      request.onsuccess = () => {
        const existing = request.result as PendingSessionSubmission | undefined;
        const decision = decideForegroundStage(existing, newRecord);
        if (decision === "owner_conflict") {
          policyError = new Error("submission_queue_owner_conflict");
          tx.abort();
          return;
        }
        if (decision === "payload_conflict") {
          result = { kind: "conflict" };
          return;
        }
        if (decision === "committed") {
          result = { kind: "committed", record: existing! };
          return;
        }
        if (decision === "blocked") {
          result = { kind: "blocked" };
          return;
        }
        if (decision === "reuse_pending") {
          result = { kind: "ready", record: existing! };
          return;
        }
        try {
          // IndexedDB put snapshots newRecord. Send an equally independent
          // snapshot so later mutations to input.body cannot change the
          // outbound payload after its durable queued copy has been saved.
          const stagedCopy = structuredClone(newRecord);
          store.put(stagedCopy);
          result = { kind: "ready", record: stagedCopy };
        } catch (error) {
          policyError = error instanceof Error
            ? error : new Error("submission_queue_write_failed");
          tx.abort();
        }
      };
      request.onerror = () => {
        policyError = request.error ?? new Error("submission_queue_read_failed");
      };
      tx.oncomplete = () => {
        if (result) resolve(result);
        else reject(policyError ?? new Error("submission_queue_stage_incomplete"));
      };
      tx.onerror = () =>
        reject(policyError ?? tx.error ?? new Error("submission_queue_stage_failed"));
      tx.onabort = () =>
        reject(policyError ?? tx.error ?? new Error("submission_queue_stage_aborted"));
    });
  } finally {
    db.close();
  }
}

