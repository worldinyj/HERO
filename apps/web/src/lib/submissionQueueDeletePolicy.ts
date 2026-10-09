import { isConfirmedSubmissionResponse } from "./submissionReceipt";

export interface DeletableQueueRecord {
  userId: string;
  scenarioId: string;
  sessionId: string;
  state: "pending" | "blocked" | "committed";
  completionReceipt?: unknown;
}

export type QueueDeleteDecision =
  | "absent"
  | "delete"
  | "identity_conflict"
  | "not_confirmed";

/** Only an authenticated user/session with a verified server receipt may be removed. */
export function decideConfirmedQueueDeletion(
  record: DeletableQueueRecord | undefined,
  userId: string,
  scenarioId: string,
  sessionId: string,
): QueueDeleteDecision {
  if (!record) return "absent";
  if (record.userId !== userId ||
      record.scenarioId !== scenarioId ||
      record.sessionId !== sessionId) {
    return "identity_conflict";
  }
  if (record.state !== "committed" ||
      !isConfirmedSubmissionResponse(record.completionReceipt, sessionId)) {
    return "not_confirmed";
  }
  return "delete";
}
