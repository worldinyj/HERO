import { type ScenarioStatus, STATUS_LABEL } from "./scenarioStatus";

export interface SeasonScenario {
  id: string; slug: string; title: string; isActive: boolean; isCompetitive: boolean;
  publishedVersionId: string | null; publishedVersion: number | null; revision: string;
  bindings: Array<{ versionId: string; version: number; status: ScenarioStatus; isActive: boolean }>;
}
export interface SeasonOverview {
  season: { id: string; seasonKey: string; title: string; startsAt: string; endsAt: string } | null;
  scenarios: SeasonScenario[];
}
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const version = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
export function readSeasonOverview(value: unknown): SeasonOverview {
  if (!object(value) || Object.hasOwn(value, "error") || !Array.isArray(value.scenarios)) throw Error("invalid_season_overview");
  const season = value.season;
  if (season !== null && (!object(season) || !uuid(season.id) || !text(season.seasonKey) || !text(season.title) ||
    !text(season.startsAt) || !text(season.endsAt) || !Number.isFinite(Date.parse(season.startsAt)) ||
    !Number.isFinite(Date.parse(season.endsAt)) || Date.parse(season.startsAt) >= Date.parse(season.endsAt))) throw Error("invalid_season_overview");
  if (season === null && value.scenarios.length) throw Error("invalid_season_overview");
  const ids = new Set<string>();
  for (const row of value.scenarios) {
    if (!object(row) || !uuid(row.id) || ids.has(row.id) || !text(row.slug) || !text(row.title) ||
      typeof row.isActive !== "boolean" || typeof row.isCompetitive !== "boolean" ||
      !text(row.revision) || !/^[0-9a-f]{32}$/.test(row.revision) || !Array.isArray(row.bindings) ||
      !(row.publishedVersionId === null && row.publishedVersion === null || uuid(row.publishedVersionId) && version(row.publishedVersion))) throw Error("invalid_season_overview");
    ids.add(row.id);
    const bindings = new Set<string>();
    for (const b of row.bindings) {
      if (!object(b) || !uuid(b.versionId) || bindings.has(b.versionId) || !version(b.version) ||
        typeof b.status !== "string" || !Object.hasOwn(STATUS_LABEL, b.status) || typeof b.isActive !== "boolean") throw Error("invalid_season_overview");
      bindings.add(b.versionId);
    }
  }
  return value as unknown as SeasonOverview;
}
export function confirmedSeasonBinding(value: unknown, seasonId: string, scenarioId: string, versionId: string | null): boolean {
  return object(value) && !Object.hasOwn(value, "error") && value.updated === true && value.seasonId === seasonId &&
    value.scenarioId === scenarioId && value.versionId === versionId && value.isActive === (versionId !== null);
}
export function seasonBindingState(row: SeasonScenario): string {
  const active = row.bindings.filter(b => b.isActive);
  if (!active.length) return "연결 없음 · 새 경쟁 플레이 불가";
  if (!row.isActive || !row.isCompetitive) return "연결은 남아 있지만 현재 경쟁 플레이 대상이 아닙니다.";
  const applied = active.find(b => b.versionId === row.publishedVersionId && b.status === "published");
  return applied ? `v${applied.version} 적용 중 · 새 경쟁 플레이 가능` : "연결된 버전이 배포 상태가 아닙니다. 현재 배포 버전을 연결해주세요.";
}
export async function seasonBindingError(cause: unknown): Promise<string> {
  let code = cause instanceof Error ? cause.message : "";
  if (object(cause) && cause.context instanceof Response) {
    try { const body: unknown = await cause.context.clone().json(); if (object(body) && typeof body.error === "string") code = body.error; } catch { /* Safe fallback. */ }
  }
  const messages: Record<string, string> = {
    season_no_longer_open: "시즌이 종료되었거나 현재 시즌이 바뀌었습니다. 취소 후 시즌 연결 새로고침을 눌러주세요.",
    season_binding_conflict: "다른 관리자가 연결을 변경했습니다. 취소 후 시즌 연결 새로고침을 눌러 현재 상태를 확인해주세요.",
    scenario_version_not_published: "선택한 버전의 배포 상태가 변경되었습니다. 취소 후 목록을 새로고침해주세요.",
    scenario_not_eligible: "현재 활성 경쟁 시나리오가 아닙니다. 취소 후 목록을 새로고침해주세요.",
    binding_no_change: "이미 같은 연결 상태입니다. 취소 후 시즌 연결 새로고침을 눌러주세요.",
    admin_required: "활성 관리자 권한이 필요합니다. 로그인 계정을 확인해주세요.",
    unauthorized: "로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.",
    rate_limited: "요청이 많습니다. 잠시 후 다시 시도해주세요.",
  };
  return (Object.hasOwn(messages, code) ? messages[code] : undefined) ?? "시즌 연결 결과를 확인하지 못했습니다. 취소 후 시즌 연결 새로고침으로 반영 여부를 확인해주세요.";
}
