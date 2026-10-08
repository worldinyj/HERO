import type { PendingSessionSubmission } from "./submissionQueue";

/** A matching server receipt ends network retries for this local row. */
export function markQueueCommitted(
  item: PendingSessionSubmission,
  at: string,
): PendingSessionSubmission {
  return {
    ...item,
    state: "committed",
    updatedAt: at,
    lastError: null,
  };
}

export function queueStateNeedsNetwork(
  state: PendingSessionSubmission["state"],
): boolean {
  return state === "pending";
}
