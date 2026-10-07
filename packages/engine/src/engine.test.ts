import {
  ScenarioSchema,
  type Scenario,
  validateScenarioGraph,
} from "@hero/schema";
import { describe, expect, it } from "vitest";
import {
  act,
  createGame,
  evaluate,
  getView,
  replayFrom,
  SCENARIO_HP_MAX,
} from "./index";

function scenarioFixture(): Scenario {
  return ScenarioSchema.parse({
    schemaVersion: "1.0.0",
    id: "test_scenario",
    version: 1,
    title: "테스트 시나리오",
    defaultPerspectiveRole: "worker",
    audienceJobs: ["worker"],
    estimatedMinutes: 5,
    startNode: "intro",
    cards: ["stop_when_unsure"],
    initialState: {
      clockMin: 540,
      deadlineMin: 600,
      baseHazard: 60,
      psf: { time_pressure: 1.2 },
      barriers: { briefing: 0.1 },
      metrics: {
        safety: 100,
        awareness: 100,
        communication: 100,
        procedure: 100,
        challenge: 100,
      },
    },
    nodes: {
      intro: {
        type: "scene",
        speaker: "김 차장",
        text: "시험을 시작합니다.",
        next: "decision_1",
      },
      decision_1: {
        type: "decision",
        prompt: "어떻게 진행하시겠습니까?",
        choices: [
          {
            actionId: "use_peer_check",
            label: "동료 확인 후 진행한다.",
            next: "hazard_1",
            timeCostMin: 1,
            effects: {
              barrierDelta: { peer_check: 0.9 },
            },
          },
          {
            actionId: "continue_alone",
            label: "혼자 계속 진행한다.",
            next: "hazard_1",
            timeCostMin: 1,
          },
          {
            actionId: "review_again",
            label: "절차를 한 번 더 읽고 진행한다.",
            next: "hazard_1",
            timeCostMin: 2,
            effects: {
              barrierDelta: { procedure_review: 0.2 },
              metricsDelta: { procedure: 0 },
            },
          },
        ],
        infoActions: [],
        allowedCards: ["stop_when_unsure"],
      },
      hazard_1: {
        type: "hazard",
        threshold: 50,
        jitter: 10,
        passNext: "safe_end",
        breachNext: "event_end",
        tag: "equipment_mismatch",
      },
      safe_end: {
        type: "ending",
        ending: "safe_complete",
        title: "작업 완료",
        summary: "방어막이 작동했습니다.",
      },
      event_end: {
        type: "ending",
        ending: "event",
        title: "사건 발생",
        summary: "여러 방어막이 약해졌습니다.",
      },
    },
  });
}

describe("HERO engine", () => {
  it("replays the same actions deterministically with the same simulation seed", () => {
    const scenario = scenarioFixture();
    const options = { simulationSeed: "season-2026-10:s01" };

    let first = createGame(scenario, options);
    first = act(scenario, first, { type: "continue" });
    first = act(scenario, first, {
      type: "choice",
      actionId: "continue_alone",
    });

    let second = createGame(scenario, options);
    second = act(scenario, second, { type: "continue" });
    second = act(scenario, second, {
      type: "choice",
      actionId: "continue_alone",
    });

    expect(second.nodeId).toBe(first.nodeId);
    expect(second.log).toEqual(first.log);
  });

  it("presentation seed only changes visible choice order, not action identity or outcome", () => {
    const scenario = scenarioFixture();
    const simulationSeed = "season-2026-10:s01";

    const orders = [
      "presentation-a",
      "presentation-b",
      "presentation-c",
      "presentation-d",
      "presentation-e",
    ].map((presentationSeed) => {
      let state = createGame(scenario, {
        simulationSeed,
        presentationSeed,
      });
      state = act(scenario, state, { type: "continue" });

      const view = getView(scenario, state);
      if (view.node.type !== "decision") {
        throw new Error("fixture_expected_decision");
      }

      return view.node.choices.map((choice) => choice.actionId);
    });

    expect(new Set(orders.map((order) => order.join("|"))).size).toBeGreaterThan(1);
    for (const order of orders) {
      expect([...order].sort()).toEqual([
        "continue_alone",
        "review_again",
        "use_peer_check",
      ]);
    }

    let first = createGame(scenario, {
      simulationSeed,
      presentationSeed: "presentation-a",
    });
    first = act(scenario, first, { type: "continue" });
    first = act(scenario, first, {
      type: "choice",
      actionId: "continue_alone",
    });

    let second = createGame(scenario, {
      simulationSeed,
      presentationSeed: "presentation-e",
    });
    second = act(scenario, second, { type: "continue" });
    second = act(scenario, second, {
      type: "choice",
      actionId: "continue_alone",
    });

    expect(second.nodeId).toBe(first.nodeId);
    expect(second.metrics).toEqual(first.metrics);
    expect(second.barriers).toEqual(first.barriers);
    expect(second.log).toEqual(first.log);
  });

  it("never exposes a hazard node in the player view", () => {
    const scenario = scenarioFixture();
    let state = createGame(scenario, { simulationSeed: "same-seed" });
    state = act(scenario, state, { type: "continue" });

    const decisionView = getView(scenario, state);
    expect(decisionView.node.type).toBe("decision");

    state = act(scenario, state, {
      type: "choice",
      actionId: "continue_alone",
    });

    const endingView = getView(scenario, state);
    expect(endingView.node.type).toBe("ending");
    expect("baseHazard" in endingView).toBe(false);
    expect("psf" in endingView).toBe(false);
    expect("barriers" in endingView).toBe(false);
  });

  it("restores the state before a target decision node", () => {
    const scenario = scenarioFixture();
    const options = { simulationSeed: "replay-seed" };
    let state = createGame(scenario, options);
    state = act(scenario, state, { type: "continue" });
    state = act(scenario, state, {
      type: "choice",
      actionId: "continue_alone",
    });

    const replay = replayFrom(
      scenario,
      options,
      state.log,
      "decision_1",
    );

    expect(replay.nodeId).toBe("decision_1");
    expect(replay.log).toHaveLength(1);
  });

  it("caps a fully successful scenario at 310 HP", () => {
    const scenario = scenarioFixture();
    let state = createGame(scenario, { simulationSeed: "score-seed" });
    state = act(scenario, state, { type: "continue" });
    state = act(scenario, state, {
      type: "choice",
      actionId: "use_peer_check",
    });

    const result = evaluate(scenario, state, {
      reflectionAnswered: true,
      swissCheeseViewed: true,
      previousBestMetricAvg: 40,
    });

    expect(result.ending).toBe("safe_complete");
    expect(result.breakdown.completion).toBe(100);
    expect(result.breakdown.ending).toBe(60);
    expect(result.breakdown.learningMetrics).toBe(100);
    expect(result.breakdown.causalReflection).toBe(20);
    expect(result.breakdown.replayImprovement).toBe(30);
    expect(result.hpPoint).toBe(SCENARIO_HP_MAX);
  });

  it("detects missing node references", () => {
    const scenario = scenarioFixture();
    const broken = structuredClone(scenario);
    const intro = broken.nodes.intro;

    if (intro?.type !== "scene") {
      throw new Error("fixture_error");
    }

    intro.next = "missing_node";

    expect(
      validateScenarioGraph(broken).some(
        (issue) => issue.code === "missing_reference",
      ),
    ).toBe(true);
  });
});
