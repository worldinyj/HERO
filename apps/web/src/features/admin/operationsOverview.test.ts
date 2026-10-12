import { describe, expect, it } from "vitest";
import { exactCount, isScenarioPlayable, operationalScenarioState } from "./operationsOverview";
import type { SeasonScenario } from "./seasonScenario";
const row: SeasonScenario = { id: "a", slug: "test", title: "test", isActive: true, isCompetitive: true, publishedVersionId: "v", publishedVersion: 1, revision: "x", bindings: [{ versionId: "v", version: 1, status: "published", isActive: true }] };
describe("operations summary integrity", () => {
  it("distinguishes a verified zero from missing or failed count", () => {
    expect(exactCount({ error: null, count: 0 })).toBe(0);
    for (const count of [null, undefined, -1, "3", NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => exactCount({ error: null, count })).toThrow();
    expect(() => exactCount({ error: { message: "denied" }, count: 0 })).toThrow();
  });
  it("requires exactly one active binding to the published version", () => {
    expect(isScenarioPlayable(row)).toBe(true);
    for (const patch of [{ isActive: false }, { isCompetitive: false }, { publishedVersionId: null }, { bindings: [] },
      { bindings: [{ ...row.bindings[0]!, status: "archived" as const }] },
      { bindings: [{ ...row.bindings[0]!, versionId: "old" }] },
      { bindings: [...row.bindings, { ...row.bindings[0]!, versionId: "second" }] }]) {
      expect(isScenarioPlayable({ ...row, ...patch })).toBe(false);
    }
  });
  it("describes multiple active bindings as an operational issue", () => {
    expect(operationalScenarioState({ ...row, bindings: [...row.bindings, { ...row.bindings[0]!, versionId: "second" }] })).toContain("여러 버전");
  });
});
