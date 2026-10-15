export interface ReflectionRecord {
  session_id: string;
  title: string;
  scenario_version: number;
  season_title: string;
  completed_at: string;
  hp_point: number;
  ending: "safe_complete" | "safe_stop" | "near_miss" | "event";
  reflection_state: "available" | "not_recorded" | "unavailable";
  reflection_label: string | null;
}

export function readReflectionHistory(value: unknown): ReflectionRecord[] {
  if (!Array.isArray(value) || value.length > 20) throw Error("invalid_reflection_history");
  const ids = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.session_id !== "string" || !row.session_id || ids.has(row.session_id) ||
        typeof row.title !== "string" || !row.title ||
        !Number.isInteger(row.scenario_version) || row.scenario_version < 1 ||
        typeof row.season_title !== "string" ||
        typeof row.completed_at !== "string" || !Number.isFinite(Date.parse(row.completed_at)) ||
        !Number.isInteger(row.hp_point) || row.hp_point < 0 || row.hp_point > 310 ||
        !["safe_complete", "safe_stop", "near_miss", "event"].includes(row.ending) ||
        !["available", "not_recorded", "unavailable"].includes(row.reflection_state) ||
        (row.reflection_state === "available"
          ? typeof row.reflection_label !== "string" || !row.reflection_label.trim()
          : row.reflection_label !== null)) throw Error("invalid_reflection_history");
    ids.add(row.session_id);
  }
  return value as ReflectionRecord[];
}
