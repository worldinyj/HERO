import { ScenarioSchema, type Scenario } from "@hero/schema";
import { describe, expect, it } from "vitest";
import { restoreReplayPrefix } from "./competitiveReplay";

function fixture(): Scenario {
  return ScenarioSchema.parse({
    schemaVersion: "1.0.0",
    id: "replay_fixture",
    version: 1,
    title: "리플레이 복구 테스트",
    defaultPerspectiveRole: "worker",
    audienceJobs: ["worker"],
    estimatedMinutes: 3,
    startNode: "intro",
    cards: [],
    initialState: {
      clockMin: 0,
      deadlineMin: 60,
      baseHazard: 0,
      psf: {},
      barriers: {},
      metrics: {
        safety: 50,
        awareness: 50,
        communication: 50,
        procedure: 50,
        challenge: 50,
      },
    },
    nodes: {
      intro: {
        type: "scene",
        text: "시작",
        next: "decision_1",
      },
      decision_1: {
        type: "decision",
        prompt: "첫 선택",
        choices: [
          { actionId: "a", label: "A", next: "decision_2", timeCostMin: 1 },
          { actionId: "b", label: "B", next: "decision_2", timeCostMin: 1 },
          { actionId: "c", label: "C", next: "decision_2", timeCostMin: 1 },
        ],
        infoActions: [],
      },
      decision_2: {
        type: "decision",
        prompt: "두 번째 선택",
        choices: [
          { actionId: "x", label: "X", next: "safe_end", timeCostMin: 1 },
          { actionId: "y", label: "Y", next: "safe_end", timeCostMin: 1 },
          { actionId: "z", label: "Z", next: "safe_end", timeCostMin: 1 },
        ],
        infoActions: [],
      },
      safe_end: {
        type: "ending",
        ending: "safe_complete",
        title: "완료",
        summary: "완료",
      },
    },
  });
}

describe("competitive replay recovery", () => {
  it("restores the exact state before the selected decision", () => {
    const state = restoreReplayPrefix(
      fixture(),
      {
        simulationSeed: "replay-seed",
        presentationSeed: "presentation-seed",
      },
      [
        { action_type: "continue", action_id: null },
        { action_type: "choice", action_id: "b" },
        { action_type: "choice", action_id: "x" },
      ],
      "decision_2",
    );

    expect(state.nodeId).toBe("decision_2");
    expect(state.log.filter((entry) => entry.actionType !== "hazard_check"))
      .toHaveLength(2);
  });

  it("rejects a replay node that the source path never reaches", () => {
    expect(() =>
      restoreReplayPrefix(
        fixture(),
        {
          simulationSeed: "replay-seed",
          presentationSeed: "presentation-seed",
        },
        [{ action_type: "continue", action_id: null }],
        "safe_end",
      ),
    ).toThrow("replay_target_not_reachable:safe_end");
  });
});
