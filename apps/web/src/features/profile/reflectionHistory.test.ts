import { describe, expect, it } from "vitest";
import { readReflectionHistory } from "./reflectionHistoryData";
const row = { session_id: "session-one", title: "S02", scenario_version: 4, season_title: "10월 시즌", completed_at: "2026-10-15T07:00:00Z", hp_point: 233, ending: "safe_complete", reflection_state: "available", reflection_label: "상황이 시작되기 전부터" };
describe("personal reflection history response", () => {
  it("accepts empty history, recorded reflection and explicit legacy absence", () => {
    expect(readReflectionHistory([])).toEqual([]);
    expect(readReflectionHistory([row])).toEqual([row]);
    expect(readReflectionHistory([{ ...row, reflection_state: "not_recorded", reflection_label: null }])).toHaveLength(1);
  });
  it("rejects malformed records rather than treating them as empty history", () => {
    for (const value of [null, {}, [null], [{ ...row, completed_at: "bad-date" }], [{ ...row, hp_point: 999 }],
      [{ ...row, reflection_label: null }], [{ ...row, reflection_state: "not_recorded" }],
      [{ ...row, ending: "unknown" }], [row, row], Array.from({ length: 21 }, (_, i) => ({ ...row, session_id: String(i) }))]) {
      expect(() => readReflectionHistory(value)).toThrow("invalid_reflection_history");
    }
  });
});
