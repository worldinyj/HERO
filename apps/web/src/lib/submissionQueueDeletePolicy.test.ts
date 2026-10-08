import { describe, expect, it } from "vitest";
import { decideConfirmedQueueDeletion as decide } from "./submissionQueueDeletePolicy";
import type { DeletableQueueRecord } from "./submissionQueueDeletePolicy";

const base: DeletableQueueRecord = {
  userId: "user-one",
  scenarioId: "scenario-one",
  sessionId: "session-one",
  state: "committed",
  completionReceipt: {
    sessionId: "session-one",
    alreadyCompleted: true,
    evaluation: { ending: "safe_complete", hpPoint: 80 },
  },
};
const testDecision = (row: DeletableQueueRecord | undefined) =>
  decide(row, "user-one", "scenario-one", "session-one");

describe("atomic deletion of confirmed queue records", () => {
  it("accepts only a verified matching committed receipt", () => {
    expect(testDecision(base)).toBe("delete");
  });
  it("treats an already-removed record as an idempotent no-op", () => {
    expect(testDecision(undefined)).toBe("absent");
  });
  it("protects different owners and scenarios", () => {
    expect(testDecision({ ...base, userId: "other" })).toBe("identity_conflict");
    expect(testDecision({ ...base, scenarioId: "other" })).toBe("identity_conflict");
    expect(testDecision({ ...base, sessionId: "other" })).toBe("identity_conflict");
  });
  it("protects pending and blocked submissions", () => {
    expect(testDecision({ ...base, state: "pending" })).toBe("not_confirmed");
    expect(testDecision({ ...base, state: "blocked" })).toBe("not_confirmed");
  });
  it("protects legacy committed records without a receipt", () => {
    expect(testDecision({ ...base, completionReceipt: undefined })).toBe("not_confirmed");
  });
  it("protects malformed and mismatched receipts", () => {
    expect(testDecision({
      ...base,
      completionReceipt: {
        sessionId: "wrong", alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    })).toBe("not_confirmed");
    expect(testDecision({
      ...base,
      completionReceipt: {
        sessionId: "session-one", alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: Number.POSITIVE_INFINITY },
      },
    })).toBe("not_confirmed");
  });
});
