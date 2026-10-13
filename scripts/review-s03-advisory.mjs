// Read-only measurement for the fixed S03 expert-review targets.
// Run: node --import tsx scripts/review-s03-advisory.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { createGame, act } from "../packages/engine/src/engine.ts";
import { evaluate } from "../packages/engine/src/score.ts";
import { simulateScenarioPaths } from "../packages/engine/src/simulator.ts";

const target = process.argv.includes("--target=v4") ? "v4"
  : process.argv.includes("--target=v5") ? "v5"
  : process.argv.includes("--target=v6") ? "v6" : "v7";
const historical = target === "v4";
const file = historical
  ? "scenarios/research/generated/S03_V4_REVIEW_TARGET_20261013.json"
  : target === "v5" ? "scenarios/research/generated/S03_V5_REVIEW_TARGET_20261013.json"
  : target === "v6" ? "scenarios/research/generated/S03_V6_REVIEW_TARGET_20261013.json"
  : JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "scenarios/research/promotion-status.json"), "utf8")).entries.find(entry => entry.scenarioId === "s03_procedure_reality_gap").file;
const content = readFileSync(resolve(import.meta.dirname, "..", file));
const sha256 = createHash("sha256").update(content).digest("hex");
const expected = historical
  ? "f0560093b22ff77a2b9af30afc45ee575690da51b8882c5a8f9aff3a7cf7ee87"
  : target === "v5" ? "e5307496aaf0f5f70565a3aef872174f57f582148842b00f15b9eadc10239079"
  : target === "v6" ? "13e235bcc8e16a5ad4a70f57cbab63c7fc28c790fdd524253879e807d41c7e51"
  : "8fae4052c214f8e930db88bd029c81debbf0529c931f5edc5f0dd193bd8c1d38";
if (sha256 !== expected) throw new Error("review_target_changed: create a new review measurement");
const scenario = ScenarioSchema.parse(JSON.parse(content.toString("utf8")));
const context = { reflectionAnswered: true, swissCheeseViewed: true };
const definitions = [
  { id: "early_no_action", choices: ["pause_compare_current_state", ...(historical ? [] : ["document_no_action_and_handover"])] },
  { id: "team_then_no_action", choices: ["share_trend_with_peer", "place_keep_and_recheck", ...(historical ? [] : ["brief_no_action_then_record"])] },
  { id: "team_peer_then_monitor", choices: ["share_trend_with_peer", "peer_check_setting_direction", "monitor_before_handover"] },
  { id: "team_peer_then_handover", choices: ["share_trend_with_peer", "peer_check_setting_direction", "document_and_handover_trend"] },
  { id: "continue_then_peer_monitor", choices: ["continue_expected_sequence", "peer_check_setting_direction", "monitor_before_handover"] },
];
if (!historical) definitions.push({ id: "no_action_pending_confirmation", choices: ["pause_compare_current_state", "hold_no_action_for_additional_confirmation"] });
if (target === "v7") definitions.push({ id: "expected_response_pending_handover", choices: ["share_trend_with_peer", "peer_check_setting_direction", "hold_due_remaining_uncertainty"] });
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
