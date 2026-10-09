/** Only clear a cached play when it is this server-confirmed session. */
export function matchesCompletedCompetitiveSession(
  record: unknown,
  userId: string,
  scenarioId: string,
  completedSessionId: string,
): boolean {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const value = record as Record<string, unknown>;
  const server = value.server;
  return value.formatVersion === 1 &&
    value.key === userId + ":" + scenarioId &&
    value.userId === userId &&
    value.scenarioId === scenarioId &&
    Boolean(server) &&
    typeof server === "object" &&
    !Array.isArray(server) &&
    (server as Record<string, unknown>).sessionId === completedSessionId;
}
