import { isConfirmedSubmissionResponse } from "./submissionReceipt";

export interface QueueWriteBody {
  sessionId: string;
  actions: readonly {
    type: string;
    actionId?: string;
    cardId?: string;
  }[];
  reflectionAnswered: boolean;
  swissCheeseViewed: boolean;
}

export interface QueueWriteRecord {
  sessionId: string;
  userId: string;
  scenarioId?: string;
  state: "pending" | "blocked" | "committed";
  body?: QueueWriteBody;
  attempts?: number;
  completionReceipt?: unknown;
}

export type QueueWriteDecision =
  | "write"
  | "preserve_committed"
  | "preserve_blocked"
  | "preserve_newer_attempt"
  | "owner_conflict"
  | "session_conflict"
  | "payload_conflict"
  | "invalid_committed_receipt";

export interface QueueWriteOptions {
  /** Only the explicit manual retry path may reactivate a blocked row. */
  allowBlockedRetry?: boolean;
}

function sameSubmissionBody(a: QueueWriteBody, b: QueueWriteBody): boolean {
  if (a.sessionId !== b.sessionId ||
      a.reflectionAnswered !== b.reflectionAnswered ||
      a.swissCheeseViewed !== b.swissCheeseViewed ||
      !Array.isArray(a.actions) || !Array.isArray(b.actions) ||
      a.actions.length !== b.actions.length) return false;
  return a.actions.every((entry, i) =>
    entry.type === b.actions[i].type &&
    entry.actionId === b.actions[i].actionId &&
    entry.cardId === b.actions[i].cardId
  );
}

/** One readwrite IDB transaction must guard queued actions and receipt status. */
export function decideQueueWrite(
  stored: QueueWriteRecord | undefined,
  incoming: QueueWriteRecord,
  options: QueueWriteOptions = {},
): QueueWriteDecision {
  if (stored && stored.userId !== incoming.userId) return "owner_conflict";
  if (stored && stored.sessionId !== incoming.sessionId) return "session_conflict";
  if (stored?.scenarioId !== undefined && incoming.scenarioId !== undefined &&
      stored.scenarioId !== incoming.scenarioId) return "session_conflict";

  // The database confirmation must take priority over stale tab states.
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

  if (stored?.body && incoming.body &&
      !sameSubmissionBody(stored.body, incoming.body)) return "payload_conflict";
  if (stored?.state === "blocked" && incoming.state === "pending" &&
      options.allowBlockedRetry !== true) return "preserve_blocked";

  // Preserve current attempt metadata when an older async write finishes last.
  // A genuine verified server completion supersedes any attempt counter.
  if (stored && incoming.state !== "committed" &&
      typeof stored.attempts === "number" &&
      typeof incoming.attempts === "number" &&
      incoming.attempts < stored.attempts) return "preserve_newer_attempt";
  return "write";
}
