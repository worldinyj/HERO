import { sameSubmissionBody, type QueueWriteRecord } from "./submissionQueueWritePolicy";

export type ForegroundStageDecision =
  | "create" | "reuse_pending" | "committed" | "blocked"
  | "owner_conflict" | "payload_conflict";

/** Called on the CURRENT row inside the IndexedDB readwrite transaction. */
export function decideForegroundStage(
  stored: QueueWriteRecord | undefined,
  incoming: QueueWriteRecord,
): ForegroundStageDecision {
  if (!incoming.body || incoming.body.sessionId !== incoming.sessionId ||
      !sameSubmissionBody(incoming.body, incoming.body)) return "payload_conflict";
  if (!stored) return "create";
  if (stored.userId !== incoming.userId) return "owner_conflict";
  if (stored.sessionId !== incoming.sessionId ||
      stored.scenarioId !== incoming.scenarioId) return "payload_conflict";
  if (stored.state === "committed") return "committed";
  if (stored.state === "blocked") return "blocked";
  if (stored.state === "pending" && stored.body &&
      sameSubmissionBody(stored.body, incoming.body)) return "reuse_pending";
  return "payload_conflict";
}
