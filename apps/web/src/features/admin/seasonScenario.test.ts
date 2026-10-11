import { describe, expect, it } from "vitest";
import { confirmedSeasonBinding, readSeasonOverview, seasonBindingError, seasonBindingState, type SeasonScenario } from "./seasonScenario";
const id = "fd100000-0000-0000-0000-000000000001";
const other = "fd100000-0000-0000-0000-000000000002";
const row: SeasonScenario = { id, slug: "test", title: "시험", isActive: true, isCompetitive: true, publishedVersionId: other, publishedVersion: 2, revision: "a".repeat(32), bindings: [] };
const season = { id, seasonKey: "2026-10", title: "시즌", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" };
describe("season overview guard", () => {
  it("accepts empty seasons and valid connection history", () => {
    expect(readSeasonOverview({ season: null, scenarios: [] }).season).toBeNull();
    const overview = { season, scenarios: [{ ...row, bindings: [{ versionId: other, version: 2, status: "published", isActive: true }] }] };
    expect(readSeasonOverview(overview)).toEqual(overview);
  });
  it("rejects malformed metadata, duplicates, inherited statuses and error envelopes", () => {
    for (const data of [null, [], {}, { season: null, scenarios: [row] }, { season: { ...season, endsAt: "bad" }, scenarios: [] }, { season: { ...season, endsAt: season.startsAt }, scenarios: [] }, { season, scenarios: [row, row] }, { season, scenarios: [{ ...row, revision: "invalid" }] }, { season, scenarios: [{ ...row, publishedVersion: null }] }, { season, scenarios: [{ ...row, bindings: [{ versionId: other, version: 2, status: "toString", isActive: true }] }] }, { season, scenarios: [{ ...row, title: {} }] }, { season, scenarios: [], error: "failed" }]) expect(() => readSeasonOverview(data)).toThrow();
  });
  it("rejects duplicate bindings and malformed IDs and flags", () => {
    const b = { versionId: other, version: 2, status: "published", isActive: true };
    for (const bad of [{ ...row, bindings: [b, b] }, { ...row, id: "bad" }, { ...row, isActive: 1 }, { ...row, publishedVersion: 0 }]) expect(() => readSeasonOverview({ season, scenarios: [bad] })).toThrow();
  });
});
describe("authoritative season mutation receipt", () => {
  it("requires exact season, scenario, nullable version and activation flag", () => {
    for (const target of [other, null]) {
      const receipt = { updated: true, seasonId: id, scenarioId: id, versionId: target, isActive: target !== null };
      expect(confirmedSeasonBinding(receipt, id, id, target)).toBe(true);
      for (const wrong of [{ ...receipt, seasonId: other }, { ...receipt, scenarioId: other }, { ...receipt, versionId: "wrong" }, { ...receipt, isActive: target === null }, { ...receipt, updated: false }, { ...receipt, error: "failed" }, null]) expect(confirmedSeasonBinding(wrong, id, id, target)).toBe(false);
    }
  });
});
describe("actual play eligibility", () => {
  it("distinguishes missing, stale and playable bindings", () => {
    expect(seasonBindingState(row)).toContain("새 경쟁 플레이 불가");
    const active = { ...row, bindings: [{ versionId: other, version: 2, status: "published" as const, isActive: true }] };
    expect(seasonBindingState(active)).toContain("새 경쟁 플레이 가능");
    expect(seasonBindingState({ ...active, isActive: false })).toContain("대상이 아닙니다");
    expect(seasonBindingState({ ...active, publishedVersionId: id })).toContain("배포 상태가 아닙니다");
    expect(seasonBindingState({ ...active, bindings: [{ ...active.bindings[0]!, isActive: false }] })).toContain("연결 없음");
  });
  it("shows conflict guidance without consuming response or leaking internals", async () => {
    const context = new Response(JSON.stringify({ error: "season_binding_conflict" }), { status: 409 });
    expect(await seasonBindingError({ context })).toContain("다른 관리자가 연결");
    expect(context.bodyUsed).toBe(false);
    expect(await seasonBindingError(new Error("season_no_longer_open"))).toContain("시즌이 종료");
    for (const bad of [new Error("database secret"), new Error("toString"), { context: new Response("null") }]) expect(await seasonBindingError(bad)).toContain("반영 여부를 확인");
  });
});
