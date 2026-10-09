import type { PendingSessionSubmission } from "./submissionQueue";
import { isConfirmedSubmissionResponse } from "./submissionReceipt";

/** A matching server receipt ends network retries for this local row. */
export function markQueueCommitted(
  item: PendingSessionSubmission,
  at: string,
  receipt?: unknown,
): PendingSessionSubmission {
  return {
    ...item,
    state: "committed",
    completionReceipt: receipt ?? item.completionReceipt,
    updatedAt: at,
    lastError: null,
  };
}

export function queueStateNeedsNetwork(
  state: PendingSessionSubmission["state"],
): boolean {
  return state === "pending";
}

/** Legacy committed rows without a matching receipt need investigation,
 * not network replay and not silent deletion of their only evidence. */
export function hasVerifiedCommittedReceipt(
  item: PendingSessionSubmission,
): boolean {
  return item.state === "committed" &&
    isConfirmedSubmissionResponse(item.completionReceipt, item.sessionId);
}
