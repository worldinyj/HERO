import { isConfirmedSubmissionResponse } from "./submissionReceipt";

export interface QueueWriteRecord {
  sessionId: string;
  userId: string;
  state: "pending" | "blocked" | "committed";
  completionReceipt?: unknown;
}

export type QueueWriteDecision =
  | "write"
  | "preserve_committed"
  | "owner_conflict"
  | "invalid_committed_receipt";

/** Enforce monotonic commitment inside a single IndexedDB readwrite transaction. */
export function decideQueueWrite(
  stored: QueueWriteRecord | undefined,
  incoming: QueueWriteRecord,
): QueueWriteDecision {
  if (stored && stored.userId !== incoming.userId) return "owner_conflict";
  if (incoming.state === "committed" &&
      !isConfirmedSubmissionResponse(incoming.completionReceipt, incoming.sessionId)) {
    return "invalid_committed_receipt";
  }
  if (stored?.state === "committed") {
    if (incoming.state !== "committed") return "preserve_committed";
    if (isConfirmedSubmissionResponse(stored.completionReceipt, stored.sessionId)) {
      return "preserve_committed";
    }
  }
  return "write";
}
