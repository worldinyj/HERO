import { describe, expect, it } from "vitest";
import { decideQueueWrite, type QueueWriteRecord } from "./submissionQueueWritePolicy";
const pending: QueueWriteRecord = {
  userId: "user-one", sessionId: "session-one", state: "pending",
};
const receipt = (sessionId: string) => ({
  sessionId, alreadyCompleted: true,
  evaluation: { ending: "safe_complete", hpPoint: 80 },
});
const committed: QueueWriteRecord = {
  ...pending, state: "committed", completionReceipt: receipt("session-one"),
};
describe("IndexedDB transaction monotonic queue writer", () => {
  it("allows initial pending and valid committed promotion", () => {
    expect(decideQueueWrite(undefined, pending)).toBe("write");
    expect(decideQueueWrite(pending, committed)).toBe("write");
  });
  it("only unblocks a rejected submission during explicit manual retry", () => {
    expect(decideQueueWrite(pending, { ...pending, state: "blocked" })).toBe("write");
    expect(decideQueueWrite({ ...pending, state: "blocked" }, pending))
      .toBe("preserve_blocked");
    expect(decideQueueWrite({ ...pending, state: "blocked" }, pending,
      { allowBlockedRetry: true })).toBe("write");
  });
  it("prevents stale pending or blocked writes to committed entries", () => {
    expect(decideQueueWrite(committed, pending)).toBe("preserve_committed");
    expect(decideQueueWrite(committed, { ...pending, state: "blocked" }))
      .toBe("preserve_committed");
  });
  it("does not replace an already verified completion receipt", () => {
    expect(decideQueueWrite(committed, {
      ...committed, completionReceipt: receipt("session-one"),
    })).toBe("preserve_committed");
  });
  it("upgrades only legacy committed records to verified receipts", () => {
    expect(decideQueueWrite({ ...pending, state: "committed" }, committed)).toBe("write");
  });
  it("rejects invalid/mismatched committed receipts", () => {
    expect(decideQueueWrite(undefined, { ...pending, state: "committed" }))
      .toBe("invalid_committed_receipt");
    expect(decideQueueWrite(pending, {
      ...committed, completionReceipt: receipt("different"),
    })).toBe("invalid_committed_receipt");
  });
  it("prevents cross-user reuse of the same IndexedDB session key", () => {
    expect(decideQueueWrite(pending, { ...pending, userId: "another" }))
      .toBe("owner_conflict");
    expect(decideQueueWrite(committed, { ...committed, userId: "another" }))
      .toBe("owner_conflict");
  });
});


describe("immutable queued submission payload and monotonic retries", () => {
  const body = {
    sessionId: "session-one",
    actions: [
      { type: "continue" },
      { type: "choice", actionId: "verify-tag" },
    ],
    reflectionAnswered: true,
    swissCheeseViewed: true,
  };
  const saved = { ...pending, scenarioId: "S01", attempts: 3, body };

  it("accepts a retry with identical actions and newer attempt count", () => {
    expect(decideQueueWrite(saved, { ...saved, attempts: 4 })).toBe("write");
  });
  it("does not allow stale attempts to replace a newer queued record", () => {
    expect(decideQueueWrite(saved, { ...saved, attempts: 2 }))
      .toBe("preserve_newer_attempt");
  });
  it("rejects different actions in the same session", () => {
    expect(decideQueueWrite(saved, {
      ...saved, body: { ...body, actions: [
        { type: "continue" }, { type: "choice", actionId: "skip-tag" },
      ] },
    })).toBe("payload_conflict");
  });
  it("rejects a shortened offline action log", () => {
    expect(decideQueueWrite(saved, {
      ...saved, body: { ...body, actions: [{ type: "continue" }] },
    })).toBe("payload_conflict");
  });
  it("rejects a different scenario bound to the same session key", () => {
    expect(decideQueueWrite(saved, { ...saved, scenarioId: "S02" }))
      .toBe("session_conflict");
  });
  it("rejects a changed reflection flag for previously queued actions", () => {
    expect(decideQueueWrite(saved, {
      ...saved, body: { ...body, reflectionAnswered: false },
    })).toBe("payload_conflict");
  });
  it("permits server-confirmed commitment despite a lower local retry counter", () => {
    expect(decideQueueWrite(saved, {
      ...saved, state: "committed", attempts: 0,
      completionReceipt: {
        sessionId: "session-one", alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    })).toBe("write");
  });
});
