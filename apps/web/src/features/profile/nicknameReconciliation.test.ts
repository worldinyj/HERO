import { describe, expect, it } from "vitest";
import { canReconcileNickname, isValidMyRecordSummary, isValidNicknameStatus, matchesCheckedNickname } from "./nicknameReconciliation";

const summary = {
  profile: { role: "player", nickname: "SAFETY01" },
  metrics: { completed_sessions: 2 },
  scenario_records: [],
  season_history: [],
  current_season: null,
};
const status = {
  canChange: false, resetRequired: false, changedThisSeason: true,
  seasonKey: "2026-10", nickname: "SAFETY01",
};

describe("nickname reconciliation response contracts", () => {
  it("accepts matching valid policy and profile snapshots", () => {
    expect(isValidMyRecordSummary(summary)).toBe(true);
    expect(isValidNicknameStatus(status)).toBe(true);
    expect(canReconcileNickname(summary, status)).toBe(true);
  });

  it.each([null, undefined, [], {}, { error: "internal_error" }, "invalid"])(
    "refuses malformed re-fetch response %s", (value) => {
      expect(isValidMyRecordSummary(value)).toBe(false);
      expect(isValidNicknameStatus(value)).toBe(false);
      expect(canReconcileNickname(value, status)).toBe(false);
      expect(canReconcileNickname(summary, value)).toBe(false);
    },
  );

  it("refuses policy or profile mismatch and partial response", () => {
    expect(canReconcileNickname(summary, { ...status, nickname: "STALE" })).toBe(false);
    expect(isValidNicknameStatus({ ...status, canChange: "false" })).toBe(false);
    expect(isValidNicknameStatus({ ...status, nickname: undefined })).toBe(false);
    expect(isValidNicknameStatus({
      canChange: true, resetRequired: false, changedThisSeason: false, seasonKey: null,
    })).toBe(false);
    expect(canReconcileNickname({ ...summary, profile: { nickname: "N", role: "admin" } }, status)).toBe(false);
  });

  it("accepts a legitimate no-open-season status without a nickname field", () => {
    const noSeason = {
      canChange: false, resetRequired: true, changedThisSeason: false,
      seasonKey: null, reason: "no_open_season",
    };
    expect(isValidNicknameStatus(noSeason)).toBe(true);
    expect(canReconcileNickname(summary, noSeason)).toBe(true);
  });

  it("requires exact, finished availability check for the current input", () => {
    const checked = { value: "ALPHA", available: true, checking: false };
    expect(matchesCheckedNickname(checked, "ALPHA")).toBe(true);
    expect(matchesCheckedNickname(checked, " BETA ")).toBe(false);
    expect(matchesCheckedNickname({ ...checked, checking: true }, "ALPHA")).toBe(false);
    expect(matchesCheckedNickname(null, "ALPHA")).toBe(false);
  });
});
