import type { StoredCompetitiveSession } from "./competitivePersistence";

/** Inspect unknown IndexedDB data before accessing nested scenario/game fields. */
export function isRestorableCompetitiveSession(
  value: unknown,
  userId: string,
  scenarioId: string,
): value is StoredCompetitiveSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.formatVersion !== 1 ||
      row.key !== userId + ":" + scenarioId ||
      row.userId !== userId || row.scenarioId !== scenarioId ||
      !Number.isInteger(row.scenarioVersion)) return false;

  const scenario = row.scenario;
  const game = row.game;
  const server = row.server;
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario) ||
      !game || typeof game !== "object" || Array.isArray(game) ||
      !server || typeof server !== "object" || Array.isArray(server)) return false;

  const s = scenario as Record<string, unknown>;
  const g = game as Record<string, unknown>;
  const remote = server as Record<string, unknown>;

  return s.id === scenarioId &&
    s.version === row.scenarioVersion &&
    g.scenarioId === scenarioId &&
    g.scenarioVersion === row.scenarioVersion &&
    Array.isArray(g.log) &&
    typeof remote.sessionId === "string" && remote.sessionId.length > 0 &&
    typeof remote.startedAt === "string" &&
    Number.isFinite(Date.parse(remote.startedAt)) &&
    typeof remote.seasonId === "string" && remote.seasonId.length > 0 &&
    typeof remote.seasonKey === "string" && remote.seasonKey.length > 0 &&
    typeof remote.scenarioVersionId === "string" &&
    remote.scenarioVersionId.length > 0;
}
