import { describe, expect, it } from "vitest";
import { isRestorableCompetitiveSession as valid } from "./competitiveCacheValidation";

const base = {
  formatVersion: 1, key: "u:S01", userId: "u", scenarioId: "S01",
  scenarioVersion: 1,
  scenario: { id: "S01", version: 1 },
  game: { scenarioId: "S01", scenarioVersion: 1, log: [] },
  server: {
    sessionId: "session-one", startedAt: "2026-10-08T01:00:00.000Z",
    seasonId: "season-one", seasonKey: "2026-10",
    scenarioVersionId: "version-one",
  },
};

describe("saved competitive session integrity", () => {
  it("accepts an intact same-owner competitive cache", () => {
    expect(valid(base, "u", "S01")).toBe(true);
  });
  it("rejects missing, array and malformed nested records without throwing", () => {
    expect(valid(null, "u", "S01")).toBe(false);
    expect(valid([], "u", "S01")).toBe(false);
    expect(valid({ ...base, scenario: null }, "u", "S01")).toBe(false);
    expect(valid({ ...base, game: null }, "u", "S01")).toBe(false);
    expect(valid({ ...base, server: null }, "u", "S01")).toBe(false);
  });
  it("rejects other owner, mismatched key or scenario ID", () => {
    expect(valid({ ...base, userId: "other" }, "u", "S01")).toBe(false);
    expect(valid({ ...base, key: "other:S01" }, "u", "S01")).toBe(false);
    expect(valid({ ...base, scenario: { id: "S02", version: 1 } }, "u", "S01")).toBe(false);
  });
  it("rejects invalid game state and version inconsistencies", () => {
    expect(valid({ ...base, scenarioVersion: 2 }, "u", "S01")).toBe(false);
    expect(valid({ ...base, game: { ...base.game, log: null } }, "u", "S01")).toBe(false);
    expect(valid({ ...base, game: { ...base.game, scenarioId: "S02" } }, "u", "S01")).toBe(false);
  });
  it("rejects malformed server session IDs or start times", () => {
    expect(valid({ ...base, server: { ...base.server, sessionId: "" } }, "u", "S01")).toBe(false);
    expect(valid({ ...base, server: { ...base.server, startedAt: "invalid" } }, "u", "S01")).toBe(false);
  });
});
