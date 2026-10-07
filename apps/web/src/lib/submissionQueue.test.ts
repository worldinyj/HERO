import type { GameLogEntry } from "@hero/engine";
import { describe, expect, it } from "vitest";
import {
  gameLogToSubmissionActions,
  isRetryableSubmissionStatus,
} from "./submissionQueue";

describe("submission queue helpers", () => {
  it("converts engine logs into server submission actions and hides hazard checks", () => {
    const log: GameLogEntry[] = [
      {
        step: 0,
        nodeId: "intro",
        actionType: "continue",
        clockBefore: 0,
        clockAfter: 0,
        hazardBefore: 10,
        hazardAfter: 10,
      },
      {
        step: 1,
        nodeId: "decision",
        actionType: "info",
        actionId: "inspect_label",
        clockBefore: 0,
        clockAfter: 1,
        hazardBefore: 10,
        hazardAfter: 10,
      },
      {
        step: 2,
        nodeId: "decision",
        actionType: "card",
        actionId: "self_check_star",
        clockBefore: 1,
        clockAfter: 2,
        hazardBefore: 10,
        hazardAfter: 5,
      },
      {
        step: 3,
        nodeId: "decision",
        actionType: "choice",
        actionId: "proceed",
        clockBefore: 2,
        clockAfter: 3,
        hazardBefore: 5,
        hazardAfter: 5,
      },
      {
        step: 4,
        nodeId: "hidden_hazard",
        actionType: "hazard_check",
        actionId: "identity",
        clockBefore: 3,
        clockAfter: 3,
        hazardBefore: 5,
        hazardAfter: 5,
        breached: false,
      },
    ];

    expect(gameLogToSubmissionActions(log)).toEqual([
      { type: "continue" },
      { type: "info", actionId: "inspect_label" },
      { type: "card", cardId: "self_check_star" },
      { type: "choice", actionId: "proceed" },
    ]);
  });

  it("submits only actions after a replay log boundary", () => {
    const log: GameLogEntry[] = [
      {
        step: 0,
        nodeId: "intro",
        actionType: "continue",
        clockBefore: 0,
        clockAfter: 0,
        hazardBefore: 10,
        hazardAfter: 10,
      },
      {
        step: 1,
        nodeId: "decision",
        actionType: "choice",
        actionId: "first_path",
        clockBefore: 0,
        clockAfter: 1,
        hazardBefore: 10,
        hazardAfter: 8,
      },
      {
        step: 2,
        nodeId: "replay_decision",
        actionType: "choice",
        actionId: "new_path",
        clockBefore: 1,
        clockAfter: 2,
        hazardBefore: 8,
        hazardAfter: 5,
      },
    ];

    expect(gameLogToSubmissionActions(log, 2)).toEqual([
      { type: "choice", actionId: "new_path" },
    ]);
  });

  it("retries network, throttling, and server failures", () => {
    expect(isRetryableSubmissionStatus(null)).toBe(true);
    expect(isRetryableSubmissionStatus(401)).toBe(true);
    expect(isRetryableSubmissionStatus(408)).toBe(true);
    expect(isRetryableSubmissionStatus(429)).toBe(true);
    expect(isRetryableSubmissionStatus(503)).toBe(true);
  });

  it("does not retry permanent validation or authorization failures", () => {
    expect(isRetryableSubmissionStatus(400)).toBe(false);
    expect(isRetryableSubmissionStatus(403)).toBe(false);
    expect(isRetryableSubmissionStatus(409)).toBe(false);
  });
});
