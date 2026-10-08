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
  it("allows pending and blocked transitions", () => {
    expect(decideQueueWrite(pending, { ...pending, state: "blocked" })).toBe("write");
    expect(decideQueueWrite({ ...pending, state: "blocked" }, pending)).toBe("write");
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
