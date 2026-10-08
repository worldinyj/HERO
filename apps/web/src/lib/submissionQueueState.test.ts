import { describe, expect, it } from "vitest";
import { markQueueCommitted, queueStateNeedsNetwork } from "./submissionQueueState";
import type { PendingSessionSubmission } from "./submissionQueue";

const sample: PendingSessionSubmission = {
  formatVersion: 1, sessionId: "a0000000-0000-4000-8000-000000000001",
  userId: "u", scenarioId: "S01",
  body: { sessionId: "a0000000-0000-4000-8000-000000000001",
    actions: [{ type: "continue" }], reflectionAnswered: true, swissCheeseViewed: true },
  state: "pending", queuedAt: "2026-10-07T00:00:00Z",
  updatedAt: "2026-10-07T01:00:00Z", attempts: 3,
  lastAttemptAt: null, lastError: "timeout",
};

describe("confirmed queue state", () => {
  it("keeps original actions/history while switching to committed", () => {
    const result = markQueueCommitted(sample, "2026-10-08T00:00:00Z");
    expect(result.state).toBe("committed");
    expect(result.body).toBe(sample.body);
    expect(result.attempts).toBe(3);
    expect(result.queuedAt).toBe(sample.queuedAt);
    expect(result.lastError).toBeNull();
    expect(sample.state).toBe("pending");
  });
  it("persists the authoritative receipt with the committed marker", () => {
    const receipt = {
      sessionId: sample.sessionId,
      alreadyCompleted: false,
      evaluation: { ending: "safe_complete", hpPoint: 80 },
    };
    const result = markQueueCommitted(sample, "2026-10-08T00:00:00Z", receipt);
    expect(result.completionReceipt).toBe(receipt);
    expect(sample.completionReceipt).toBeUndefined();
  });
  it("sends only pending rows over the network", () => {
    expect(queueStateNeedsNetwork("pending")).toBe(true);
    expect(queueStateNeedsNetwork("blocked")).toBe(false);
    expect(queueStateNeedsNetwork("committed")).toBe(false);
  });
});
