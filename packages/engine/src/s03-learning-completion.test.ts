import { describe, expect, it } from "vitest";
import { ScenarioSchema } from "@hero/schema";
import draft from "../../../scenarios/drafts/S03_procedure_reality_v1.json";
import { createGame, act, evaluate } from "./index";

const scenario = ScenarioSchema.parse(draft);
const context = { reflectionAnswered: true, swissCheeseViewed: true };
function run(choices: string[], seed: string) {
  let state = createGame(scenario, { simulationSeed: seed, presentationSeed: "stable" });
  let index = 0;
  for (let step = 0; step < 30; step++) {
    const node = scenario.nodes[state.nodeId]!;
    if (node.type === "ending") {
      expect(index).toBe(choices.length);
      return { state, result: evaluate(scenario, state, context) };
    }
    if (node.type === "scene" || node.type === "event") {
      state = act(scenario, state, { type: "continue" });
    } else {
      const actionId = choices[index++];
      if (!actionId) throw new Error(`unexpected decision:${state.nodeId}`);
      state = act(scenario, state, { type: "choice", actionId });
    }
  }
  throw new Error("path did not finish");
}

describe("S03 v5 learning completion", () => {
  it("requires evidence confirmation and handover before no-action completion", () => {
    let state = createGame(scenario, { simulationSeed: "s03-learning-0" });
    state = act(scenario, state, { type: "continue" });
    state = act(scenario, state, { type: "choice", actionId: "pause_compare_current_state" });
    expect(state.nodeId).toBe("event_no_action_basis");
    state = act(scenario, state, { type: "continue" });
    expect(state.nodeId).toBe("decision_no_action_handover");
    const node = scenario.nodes[state.nodeId]!;
    expect(node.type).toBe("decision");
  });

  it("values verified no-action learning completion at least as much as continuing with checks", () => {
    for (let i = 0; i < 20; i++) {
      const seed = `s03-advisory-${i}`;
      const early = run(["pause_compare_current_state", "document_no_action_and_handover"], seed);
      const team = run(["share_trend_with_peer", "place_keep_and_recheck", "brief_no_action_then_record"], seed);
      const continued = run(["share_trend_with_peer", "peer_check_setting_direction", "document_and_handover_trend"], seed);
      expect(early.result.ending).toBe("safe_complete");
      expect(team.result.ending).toBe("safe_complete");
      expect(early.result.hpPoint).toBeGreaterThanOrEqual(continued.result.hpPoint);
      expect(team.result.hpPoint).toBeGreaterThanOrEqual(continued.result.hpPoint);
    }
  });

  it("preserves safe stop for additional uncertainty instead of rewarding a bare pause as completion", () => {
    const held = run(["pause_compare_current_state", "hold_no_action_for_additional_confirmation"], "s03-advisory-0");
    expect(held.state.nodeId).toBe("safe_stop_end");
    expect(held.result.ending).toBe("safe_stop");
  });

  it("distinguishes the educational alternative and does not infer justified necessity from normal response", () => {
    const basis = scenario.nodes.event_no_action_basis;
    const continued = scenario.nodes.safe_complete_end;
    expect(basis?.type === "event" ? basis.text : "").toContain("교육용 대안");
    expect(continued?.type === "ending" ? continued.summary : "").toContain("필요성");
    expect(scenario.incidentDebrief?.causalChain).toContain("지시 설정치의 적정성을 별도로 확인하지 않고 입력");
  });
});
