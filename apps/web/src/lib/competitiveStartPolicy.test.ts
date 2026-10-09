import { describe, expect, it } from "vitest";
import { shouldSaveStartedCompetitiveSession as accept } from "./competitiveStartPolicy";

const candidate = {
  userId: "u", scenarioId: "S01",
  server: { sessionId: "new", startedAt: "2026-10-08T12:01:00.000Z" },
};
const cached = {
  formatVersion: 1, key: "u:S01", userId: "u", scenarioId: "S01",
  server: { sessionId: "old", startedAt: "2026-10-08T12:00:00.000Z" },
  game: { log: [{ actionType: "continue" }] },
};
describe("competitive start response ordering", () => {
  it("permits initial session creation", () => {
    expect(accept(undefined, candidate)).toBe(true);
    expect(accept(null, candidate)).toBe(true);
  });
  it("allows newer server sessions", () => {
    expect(accept(cached, candidate)).toBe(true);
  });
  it("preserves same session progress on delayed resume", () => {
    expect(accept({ ...cached, server: { ...cached.server, sessionId: "new" } }, candidate)).toBe(false);
  });
  it("rejects an older response after a newer replay", () => {
    expect(accept({ ...cached, server: {
      sessionId: "third", startedAt: "2026-10-08T12:02:00.000Z",
    } }, candidate)).toBe(false);
  });
  it("preserves an existing session at tied start times", () => {
    expect(accept({ ...cached, server: {
      ...cached.server, startedAt: candidate.server.startedAt,
    } }, candidate)).toBe(false);
  });
  it("fails closed for malformed timestamps and identities", () => {
    expect(accept({ ...cached, server: { ...cached.server, startedAt: "invalid" } }, candidate)).toBe(false);
    expect(accept({ ...cached, userId: "another" }, candidate)).toBe(false);
    expect(accept({ ...cached, key: "another:S01" }, candidate)).toBe(false);
    expect(accept({ ...cached, scenarioId: "another" }, candidate)).toBe(false);
    expect(accept({}, candidate)).toBe(false);
  });
});
