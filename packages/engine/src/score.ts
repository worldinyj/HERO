import type { Scenario } from "@hero/schema";
import { isFinished } from "./engine";
import type {
  Evaluation,
  GameState,
  ScoreContext,
} from "./types";

export const SCORE_RULE_VERSION = "1.0.0" as const;
export const SCENARIO_HP_MAX = 310 as const;

const ENDING_POINTS = {
  safe_complete: 60,
  safe_stop: 55,
  near_miss: 35,
  event: 15,
} as const;

export function metricAverage(state: GameState): number {
  const values = Object.values(state.metrics);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function keyDecisionActionId(state: GameState): string | null {
  const choices = state.log.filter(
    (entry) => entry.actionType === "choice" && entry.actionId,
  );

  if (choices.length === 0) return null;

  return choices.reduce((best, current) => {
    const bestDelta = Math.abs(best.hazardAfter - best.hazardBefore);
    const currentDelta = Math.abs(current.hazardAfter - current.hazardBefore);
    return currentDelta > bestDelta ? current : best;
  }).actionId ?? null;
}

export function evaluate(
  scenario: Scenario,
  state: GameState,
  context: ScoreContext,
): Evaluation {
  if (!isFinished(scenario, state)) {
    throw new Error("cannot_evaluate_unfinished_game");
  }

  const node = scenario.nodes[state.nodeId];
  if (!node || node.type !== "ending") {
    throw new Error("ending_node_missing");
  }

  const avg = metricAverage(state);
  const learningMetrics = Math.round(avg);
  const causalReflection =
    (context.reflectionAnswered ? 10 : 0) +
    (context.swissCheeseViewed ? 10 : 0);

  const replayImprovement = context.previousBestMetricAvg === undefined
    ? 0
    : Math.min(
        30,
        Math.max(0, Math.round((avg - context.previousBestMetricAvg) * 0.5)),
      );

  const breakdown = {
    completion: 100,
    ending: ENDING_POINTS[node.ending],
    learningMetrics,
    causalReflection,
    replayImprovement,
    total: 0,
  };

  breakdown.total =
    breakdown.completion +
    breakdown.ending +
    breakdown.learningMetrics +
    breakdown.causalReflection +
    breakdown.replayImprovement;

  const breachChain = state.log
    .filter((entry) => entry.actionType === "hazard_check" && entry.breached)
    .map((entry) => ({
      hazardNodeId: entry.nodeId,
      weakBarriers: entry.weakBarriers ?? [],
    }));

  return {
    ending: node.ending,
    metrics: { ...state.metrics },
    metricAverage: avg,
    hpPoint: Math.min(SCENARIO_HP_MAX, breakdown.total),
    scoreRuleVersion: SCORE_RULE_VERSION,
    breakdown,
    keyDecisionActionId: keyDecisionActionId(state),
    breachChain,
  };
}
