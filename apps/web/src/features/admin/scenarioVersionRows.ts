import { STATUS_LABEL, type ScenarioStatus } from "./scenarioStatus";

interface ScenarioInfo { id: string; slug: string; title: string; is_active: boolean; is_competitive: boolean }
export interface ScenarioVersionRow {
  id: string;
  version: number;
  status: ScenarioStatus;
  default_perspective_role: string;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  scenarios: ScenarioInfo | ScenarioInfo[];
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const date = (value: unknown): boolean => text(value) && Number.isFinite(Date.parse(value));

/** A failed or malformed list is never evidence that no saved versions exist. */
export function readScenarioVersionRows(value: unknown): ScenarioVersionRow[] {
  if (!object(value) || Object.hasOwn(value, "error") || !Array.isArray(value.versions)) throw Error("scenario_list_invalid");
  const ids = new Set<string>();
  for (const row of value.versions as unknown[]) {
    if (!object(row)) throw Error("scenario_list_invalid");
    const scenario = Array.isArray(row.scenarios) && row.scenarios.length === 1 ? row.scenarios[0] : row.scenarios;
    if (!text(row.id) || ids.has(row.id) || !Number.isSafeInteger(row.version) || Number(row.version) < 1 ||
      typeof row.status !== "string" || !Object.hasOwn(STATUS_LABEL, row.status) ||
      !text(row.default_perspective_role) || !date(row.created_at) ||
      (row.approved_at !== null && !date(row.approved_at)) || (row.published_at !== null && !date(row.published_at)) ||
      !object(scenario) || !text(scenario.id) || !text(scenario.slug) || !text(scenario.title) ||
      typeof scenario.is_active !== "boolean" || typeof scenario.is_competitive !== "boolean") throw Error("scenario_list_invalid");
    ids.add(row.id);
  }
  return value.versions as ScenarioVersionRow[];
}
