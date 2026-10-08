import { describe, expect, it } from "vitest";
import { shouldPersistCompetitiveProgress as shouldUpdate } from "./competitiveProgressPolicy";

const base = {
  formatVersion: 1, key: "u:S01", userId: "u",
  scenarioId: "S01", server: { sessionId: "first" },
  game: { log: [{ actionType: "continue" }] },
};
const incoming = { userId: "u", scenarioId: "S01",
  server: { sessionId: "first" },
  game: { log: [{ actionType: "continue" }, { actionType: "choice" }] },
};

describe("competitive play progress persistence monotonicity", () => {
  it("accepts a strictly newer log in the same stored server session", () => {
    expect(shouldUpdate(base, incoming)).toBe(true);
  });
  it("never resurrects a completed session after its cache was removed", () => {
    expect(shouldUpdate(undefined, incoming)).toBe(false);
  });
  it("preserves a new replay created by another tab", () => {
    expect(shouldUpdate({ ...base, server: { sessionId: "replay" } }, incoming))
      .toBe(false);
  });
  it("rejects writes for different owners, scenarios and keys", () => {
    expect(shouldUpdate({ ...base, userId: "other" }, incoming)).toBe(false);
    expect(shouldUpdate({ ...base, scenarioId: "other" }, incoming)).toBe(false);
    expect(shouldUpdate({ ...base, key: "other:S01" }, incoming)).toBe(false);
  });
  it("keeps a longer existing log when delayed updates arrive out of order", () => {
    expect(shouldUpdate({ ...base, game: {
      log: [...incoming.game.log, { actionType: "info" }],
    } }, incoming)).toBe(false);
  });
  it("does not rewrite equal-length game progress", () => {
    expect(shouldUpdate({ ...base, game: { log: [...incoming.game.log] } },
      incoming)).toBe(false);
  });
  it("fails closed for legacy or malformed cached game state", () => {
    expect(shouldUpdate({ ...base, formatVersion: 2 }, incoming)).toBe(false);
    expect(shouldUpdate({ ...base, game: null }, incoming)).toBe(false);
    expect(shouldUpdate({ ...base, game: {} }, incoming)).toBe(false);
  });
});
