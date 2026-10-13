// Read-only measurement for the fixed S03 v4 expert-review target.
// Run: node --import tsx scripts/review-s03-advisory.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { createGame, act } from "../packages/engine/src/engine.ts";
import { evaluate } from "../packages/engine/src/score.ts";
import { simulateScenarioPaths } from "../packages/engine/src/simulator.ts";

const file = "scenarios/drafts/S03_procedure_reality_v1.json";
const content = readFileSync(resolve(import.meta.dirname, "..", file));
const sha256 = createHash("sha256").update(content).digest("hex");
const expected = "f0560093b22ff77a2b9af30afc45ee575690da51b8882c5a8f9aff3a7cf7ee87";
if (sha256 !== expected) throw new Error("review_target_changed: create a new review measurement");
const scenario = ScenarioSchema.parse(JSON.parse(content.toString("utf8")));
const context = { reflectionAnswered: true, swissCheeseViewed: true };
const definitions = [
  { id: "early_no_action", choices: ["pause_compare_current_state"] },
  { id: "team_then_no_action", choices: ["share_trend_with_peer", "place_keep_and_recheck"] },
  { id: "team_peer_then_monitor", choices: ["share_trend_with_peer", "peer_check_setting_direction", "monitor_before_handover"] },
  { id: "team_peer_then_handover", choices: ["share_trend_with_peer", "peer_check_setting_direction", "document_and_handover_trend"] },
  { id: "continue_then_peer_monitor", choices: ["continue_expected_sequence", "peer_check_setting_direction", "monitor_before_handover"] },
];
const probes = definitions.map((definition) => {
  const outcomes = new Map();
  for (let seedIndex = 0; seedIndex < 20; seedIndex++) {
    let state = createGame(scenario, {
      simulationSeed: `s03-advisory-${seedIndex}`,
      presentationSeed: "stable",
    });
    let choiceIndex = 0;
    let steps = 0;
    while (scenario.nodes[state.nodeId].type !== "ending") {
      if (++steps > 100) throw new Error(`path_did_not_finish:${definition.id}`);
      const node = scenario.nodes[state.nodeId];
      if (node.type === "scene" || node.type === "event") {
        state = act(scenario, state, { type: "continue" });
      } else {
        const actionId = definition.choices[choiceIndex++];
        if (node.type !== "decision" || !node.choices.some((choice) => choice.actionId === actionId)) {
          throw new Error(`probe_path_changed:${definition.id}:${state.nodeId}`);
        }
        state = act(scenario, state, { type: "choice", actionId });
      }
    }
    if (choiceIndex !== definition.choices.length) throw new Error(`unused_probe_choice:${definition.id}`);
    const result = evaluate(scenario, state, context);
    const key = `${state.nodeId}:${result.hpPoint}`;
    const outcome = outcomes.get(key) ?? {
      endingNode: state.nodeId, ending: result.ending, hpPoint: result.hpPoint,
      breakdown: result.breakdown, seedCount: 0,
    };
    outcome.seedCount++;
    outcomes.set(key, outcome);
  }
  return { ...definition, seedCount: 20, outcomes: [...outcomes.values()] };
});
const simulation = simulateScenarioPaths(scenario);
if (!simulation.complete || simulation.warnings.length > 0) {
  throw new Error("strict_path_simulation_failed");
}
console.log(JSON.stringify({
  schemaVersion: 1,
  scenarioId: scenario.id, version: scenario.version, sourceFile: file, contentSha256: sha256,
  scope: "Read-only engine simulation; no info/card actions in probes, first attempt, reflection+timeline=true; not human approval or actual event likelihood",
  probeSeedTemplate: "s03-advisory-{0..19}",
  simulationSeedScope: "simulateScenarioPaths default 3 fixed seeds; path counts are enumerated action histories, not event probabilities",
  simulation: {
    complete: simulation.complete, exploredStates: simulation.exploredStates,
    terminalPaths: simulation.terminalPaths, hp: simulation.hp,
    endingCounts: simulation.endingCounts, warnings: simulation.warnings,
  },
  probes,
}, null, 2));
