export interface CompetitiveStartCandidate {
  userId: string;
  scenarioId: string;
  server: { sessionId: string; startedAt: string };
}

/** Reject stale starts and preserve existing progress across tabs. */
export function shouldSaveStartedCompetitiveSession(
  stored: unknown,
  incoming: CompetitiveStartCandidate,
): boolean {
  if (stored === undefined || stored === null) return true;
  if (typeof stored !== "object" || Array.isArray(stored)) return false;
  const current = stored as Record<string, unknown>;
  if (current.formatVersion !== 1 ||
      current.key !== incoming.userId + ":" + incoming.scenarioId ||
      current.userId !== incoming.userId ||
      current.scenarioId !== incoming.scenarioId) return false;
  const server = current.server;
  if (!server || typeof server !== "object" || Array.isArray(server)) return false;
  const existing = server as Record<string, unknown>;
  if (existing.sessionId === incoming.server.sessionId) return false;
  if (typeof existing.sessionId !== "string" ||
      typeof existing.startedAt !== "string" ||
      typeof incoming.server.startedAt !== "string") return false;
  const older = Date.parse(existing.startedAt);
  const newer = Date.parse(incoming.server.startedAt);
  return Number.isFinite(older) && Number.isFinite(newer) && newer > older;
}
