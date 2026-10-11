import { seasonBindingState, type SeasonScenario } from "./seasonScenario";

export interface OperationsCounts {
  activePlants: number;
  managers: number;
  players: number;
  completedSessions: number;
}

export function exactCount(result: { error: unknown; count: unknown }): number {
  if (result.error || !Number.isSafeInteger(result.count) || Number(result.count) < 0) {
    throw new Error("operations_count_unavailable");
  }
  return Number(result.count);
}

export function isScenarioPlayable(row: SeasonScenario): boolean {
  const active = row.bindings.filter(binding => binding.isActive);
  return row.isActive && row.isCompetitive && row.publishedVersionId !== null && active.length === 1 &&
    active[0]?.versionId === row.publishedVersionId && active[0]?.status === "published";
}

export function operationalScenarioState(row: SeasonScenario): string {
  if (row.bindings.filter(binding => binding.isActive).length > 1) {
    return "여러 버전이 동시에 연결되어 있습니다. 시나리오 관리에서 확인해주세요.";
  }
  return seasonBindingState(row);
}
