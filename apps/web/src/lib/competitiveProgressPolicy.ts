import { matchesCompletedCompetitiveSession } from "./competitiveCleanupPolicy";

export interface CompetitiveProgressCandidate {
  userId: string;
  scenarioId: string;
  server: { sessionId: string };
  game: { log: readonly unknown[] };
}

/**
 * A late progress write must never recreate a cache already cleared by
 * confirmed submission, overwrite a replay in another tab, or roll back
 * a newer game action. The caller must perform this check and the put in
 * one IndexedDB readwrite transaction.
 */
export function shouldPersistCompetitiveProgress(
  stored: unknown,
  incoming: CompetitiveProgressCandidate,
): boolean {
  if (!matchesCompletedCompetitiveSession(
    stored, incoming.userId, incoming.scenarioId, incoming.server.sessionId,
  )) return false;
  const current = stored as { game?: { log?: unknown } };
  return Array.isArray(current.game?.log) &&
    Array.isArray(incoming.game?.log) &&
    incoming.game.log.length > current.game.log.length;
}
