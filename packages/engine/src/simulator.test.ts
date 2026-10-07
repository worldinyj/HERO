import { ScenarioSchema, type Scenario } from "@hero/schema";
import { describe, expect, it } from "vitest";
import { simulateScenarioPaths } from "./simulator.ts";

function balancedFixture(): Scenario {
  return ScenarioSchema.parse({
    schemaVersion: "1.0.0",
    id: "simulator_fixture",
    version: 1,
    title: "시뮬레이터 테스트",
    defaultPerspectiveRole: "worker",
    audienceJobs: ["worker"],
    estimatedMinutes: 3,
    startNode: "decision",
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
      decision: {
        type: "decision",
        prompt: "선택",
        choices: [
          {
            actionId: "safe",
            label: "안전하게 진행",
            next: "safe_end",
            timeCostMin: 1,
            effects: { metricsDelta: { safety: 10 } },
          },
          {
            actionId: "stop",
            label: "멈추고 확인",
            next: "stop_end",
            timeCostMin: 1,
            effects: { metricsDelta: { challenge: 8 } },
          },
          {
            actionId: "risk",
            label: "바로 진행",
            next: "event_end",
            timeCostMin: 0,
            effects: { metricsDelta: { safety: -10 } },
          },
        ],
        infoActions: [],
      },
      safe_end: {
        type: "ending",
        ending: "safe_complete",
        title: "완료",
        summary: "안전 완료",
      },
      stop_end: {
        type: "ending",
        ending: "safe_stop",
        title: "중지",
        summary: "안전 중지",
      },
      event_end: {
        type: "ending",
        ending: "event",
        title: "사건",
        summary: "사건 발생",
      },
    },
  });
}

describe("path simulator", () => {
  it("enumerates every direct choice for each simulation seed", () => {
    const report = simulateScenarioPaths(balancedFixture(), {
      simulationSeeds: ["a", "b"],
    });

    expect(report.complete).toBe(true);
    expect(report.terminalPaths).toBe(6);
    expect(report.endingCounts.safe_complete).toBe(2);
    expect(report.endingCounts.safe_stop).toBe(2);
    expect(report.endingCounts.event).toBe(2);
    expect(report.choices).toHaveLength(3);
    expect(report.warnings.some((warning) => warning.severity === "error")).toBe(false);
  });

  it("reports an incomplete analysis when a terminal-path limit is hit", () => {
    const report = simulateScenarioPaths(balancedFixture(), {
      simulationSeeds: ["a", "b"],
      maxTerminalPaths: 2,
    });

    expect(report.complete).toBe(false);
    expect(
      report.warnings.some(
        (warning) => warning.code === "terminal_path_limit_reached",
      ),
    ).toBe(true);
  });

  it("flags an obviously dominant choice without calling it a correct answer", () => {
    const scenario = balancedFixture();
    const decision = scenario.nodes.decision;

    if (decision?.type !== "decision") {
      throw new Error("fixture_error");
    }

    decision.choices[0] = {
      ...decision.choices[0]!,
      effects: {
        metricsDelta: {
          safety: 50,
          awareness: 50,
          communication: 50,
          procedure: 50,
          challenge: 50,
        },
      },
    };

    const report = simulateScenarioPaths(scenario, {
      simulationSeeds: ["a", "b", "c"],
      dominantHpGap: 20,
      dominantFavorableGap: 0,
    });

    expect(
      report.warnings.some(
        (warning) => warning.code === "dominant_choice_bias",
      ),
    ).toBe(true);
  });
});
