import { describe, expect, it } from "vitest";
import { decideForegroundStage as decide } from "./submissionForegroundStagePolicy";
const pending = {
  sessionId: "session-one", userId: "user-one", scenarioId: "S01",
  state: "pending" as const,
  body: {
    sessionId: "session-one",
    actions: [{ type: "continue" as const }, { type: "choice" as const, actionId: "verify" }],
    reflectionAnswered: true, swissCheeseViewed: true,
  },
};
describe("atomic online submission staging policy", () => {
  it("stages an initially absent pending record", () => {
    expect(decide(undefined, pending)).toBe("create");
  });
  it("reuses the immutable original actions", () => {
    expect(decide(pending, { ...pending, body: structuredClone(pending.body) }))
      .toBe("reuse_pending");
  });
  it("rejects a different session owner", () => {
    expect(decide({ ...pending, userId: "someone-else" }, pending))
      .toBe("owner_conflict");
  });
  it("rejects a different scenario and changed actions", () => {
    expect(decide({ ...pending, scenarioId: "S02" }, pending)).toBe("payload_conflict");
    expect(decide({ ...pending, body: {
      ...pending.body, actions: [{ type: "choice", actionId: "unsafe" }],
    } }, pending)).toBe("payload_conflict");
  });
  it("keeps committed receipts and legacy committed evidence", () => {
    expect(decide({ ...pending, state: "committed" }, pending)).toBe("committed");
  });
  it("keeps blocked records for manual review", () => {
    expect(decide({ ...pending, state: "blocked" }, pending)).toBe("blocked");
  });
  it("rejects malformed incoming actions", () => {
    expect(decide(undefined, { ...pending, body: {
      ...pending.body, actions: [{ type: "unknown" }],
    } } as never)).toBe("payload_conflict");
  });
  it("rejects mismatched body session identity", () => {
    expect(decide(undefined, { ...pending, body: {
      ...pending.body, sessionId: "other",
    } })).toBe("payload_conflict");
  });
});
