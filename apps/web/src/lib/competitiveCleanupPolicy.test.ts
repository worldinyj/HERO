import { describe, expect, it } from "vitest";
import { matchesCompletedCompetitiveSession as matches } from "./competitiveCleanupPolicy";

const base = {
  formatVersion: 1, key: "u:S01", userId: "u",
  scenarioId: "S01", server: { sessionId: "original" },
};

describe("confirmed session cleanup identity", () => {
  it("matches the exact cached server session", () => {
    expect(matches(base, "u", "S01", "original")).toBe(true);
  });
  it("preserves a newer replay in the same slot", () => {
    expect(matches({ ...base, server: { sessionId: "newer" } }, "u", "S01", "original")).toBe(false);
  });
  it("preserves records of another user or scenario", () => {
    expect(matches({ ...base, userId: "other" }, "u", "S01", "original")).toBe(false);
    expect(matches({ ...base, scenarioId: "S02" }, "u", "S01", "original")).toBe(false);
    expect(matches({ ...base, key: "other:S01" }, "u", "S01", "original")).toBe(false);
  });
  it("rejects malformed cached records", () => {
    expect(matches(null, "u", "S01", "original")).toBe(false);
    expect(matches({ ...base, formatVersion: 2 }, "u", "S01", "original")).toBe(false);
    expect(matches({ ...base, server: null }, "u", "S01", "original")).toBe(false);
  });
});
