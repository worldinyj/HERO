import type { PendingSessionSubmission } from "./submissionQueue";

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
