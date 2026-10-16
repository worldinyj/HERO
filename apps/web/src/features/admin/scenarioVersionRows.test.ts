import { describe, expect, it } from "vitest";
import { readScenarioVersionRows } from "./scenarioVersionRows";

const info = { id: "scenario", slug: "test", title: "시험", is_active: true, is_competitive: false };
const row = { id: "version", version: 1, status: "draft", default_perspective_role: "worker",
  created_at: "2026-10-16T00:00:00Z", approved_at: null, published_at: null, scenarios: info };

describe("scenario list response", () => {
  it("accepts explicit empty and valid single-join representations", () => {
    expect(readScenarioVersionRows({ versions: [] })).toEqual([]);
    expect(readScenarioVersionRows({ versions: [row] })).toEqual([row]);
    const arrayJoin = { ...row, scenarios: [info] };
    expect(readScenarioVersionRows({ versions: [arrayJoin] })).toEqual([arrayJoin]);
  });
  it.each([null, {}, { versions: null }, { versions: [] , error: "denied" },
    { versions: [row, row] }, { versions: [{ ...row, status: "constructor" }] },
    { versions: [{ ...row, version: 0 }] }, { versions: [{ ...row, created_at: "bad" }] },
    { versions: [{ ...row, scenarios: null }] }, { versions: [{ ...row, scenarios: [] }] },
    { versions: [{ ...row, scenarios: [info, info] }] },
    { versions: [{ ...row, scenarios: { ...info, is_active: "yes" } }] },
  ])("rejects missing, ambiguous or malformed rows %#", response => {
    expect(() => readScenarioVersionRows(response)).toThrow("scenario_list_invalid");
  });
});
