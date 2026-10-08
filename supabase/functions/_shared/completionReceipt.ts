export interface CommittedCompletion {
  alreadyCompleted: boolean;
  sessionId: string;
  evaluation: { hpPoint: number; ending: string; [key: string]: unknown };
}

/** A PG RPC response, not a local simulation, proves the stored outcome. */
export function readCommittedCompletion(
  value: unknown,
  requestedSessionId: string,
): CommittedCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.already_completed !== "boolean" ||
    row.session_id !== requestedSessionId ||
    !row.evaluation ||
    typeof row.evaluation !== "object" ||
    Array.isArray(row.evaluation)
  ) return null;
  const evaluation = row.evaluation as Record<string, unknown>;
  if (
    typeof evaluation.ending !== "string" ||
    typeof evaluation.hpPoint !== "number" ||
    !Number.isFinite(evaluation.hpPoint)
  ) return null;
  return {
    alreadyCompleted: row.already_completed,
    sessionId: requestedSessionId,
    evaluation: evaluation as CommittedCompletion["evaluation"],
  };
}
