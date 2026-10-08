/** Fail closed on malformed profile and nickname policy snapshots. */
function recordOf(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidNicknameStatus(value: unknown): boolean {
  if (!recordOf(value)) return false;
  const season = value.seasonKey;
  return (
    typeof value.canChange === "boolean" &&
    typeof value.resetRequired === "boolean" &&
    typeof value.changedThisSeason === "boolean" &&
    (season === null || typeof season === "string") &&
    (value.nickname === undefined || typeof value.nickname === "string") &&
    (season !== null || value.canChange === false) &&
    (season === null || (typeof value.nickname === "string" && value.nickname.length > 0))
  );
}

export function isValidMyRecordSummary(value: unknown): boolean {
  if (!recordOf(value) || !recordOf(value.profile) || !recordOf(value.metrics)) return false;
  return (
    ["admin", "plant_manager", "player"].includes(String(value.profile.role)) &&
    typeof value.profile.nickname === "string" &&
    value.profile.nickname.length > 0 &&
    typeof value.metrics.completed_sessions === "number" &&
    Array.isArray(value.scenario_records) &&
    Array.isArray(value.season_history) &&
    (value.current_season === null || recordOf(value.current_season))
  );
}

export function canReconcileNickname(summary: unknown, status: unknown): boolean {
  if (!isValidMyRecordSummary(summary) || !isValidNicknameStatus(status)) return false;
  const profile = (summary as { profile: { role: string; nickname: string } }).profile;
  const policy = status as { nickname?: string };
  return profile.role === "player" &&
    (policy.nickname === undefined || profile.nickname === policy.nickname);
}

export function matchesCheckedNickname(
  checked: { value?: string; available?: boolean; checking?: boolean } | null,
  input: string,
): boolean {
  return checked?.available === true &&
    checked.checking === false &&
    checked.value === input.trim();
}
