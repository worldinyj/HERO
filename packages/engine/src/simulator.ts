import type { Ending, Scenario } from "@hero/schema";
import { act, createGame, isFinished } from "./engine.ts";
import { BARRIER_CARDS } from "./catalog.ts";
import { evaluate } from "./score.ts";
import type { GameAction, GameState, UserActionType } from "./types.ts";

const ENDINGS: Ending[] = [
  "safe_complete",
  "safe_stop",
  "near_miss",
  "event",
];

export interface PathSimulationOptions {
  simulationSeeds?: string[];
  maxTerminalPaths?: number;
  maxExploredStates?: number;
  maxActionsPerPath?: number;
  exampleLimit?: number;
  dominantHpGap?: number;
  dominantFavorableGap?: number;
  endingImbalanceThreshold?: number;
}

export interface SimulatedPathStep {
  nodeId: string;
  actionType: UserActionType;
  actionId?: string;
}

export interface TerminalPathExample {
  simulationSeed: string;
  ending: Ending;
  hpPoint: number;
  actions: SimulatedPathStep[];
}

export interface ChoiceSimulationStats {
  nodeId: string;
  actionId: string;
  label: string;
  samples: number;
  meanHp: number | null;
  favorableEndingRate: number | null;
  endingCounts: Record<Ending, number>;
}

export interface PathSimulationWarning {
  severity: "warning" | "error";
  code:
    | "terminal_path_limit_reached"
    | "explored_state_limit_reached"
    | "action_limit_reached"
    | "single_ending_reached"
    | "ending_imbalance"
    | "dominant_choice_bias";
  message: string;
  nodeId?: string;
  actionId?: string;
}

export interface PathSimulationReport {
  scenarioId: string;
  scenarioVersion: number;
  simulationSeeds: string[];
  complete: boolean;
  exploredStates: number;
  terminalPaths: number;
  endingCounts: Record<Ending, number>;
  endingRates: Record<Ending, number>;
  hp: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
  choices: ChoiceSimulationStats[];
  warnings: PathSimulationWarning[];
  examples: TerminalPathExample[];
}

interface QueueItem {
  state: GameState;
  steps: SimulatedPathStep[];
}

interface ChoiceAccumulator {
  samples: number;
  hpTotal: number;
  favorable: number;
  endingCounts: Record<Ending, number>;
}

function emptyEndingCounts(): Record<Ending, number> {
  return {
    safe_complete: 0,
    safe_stop: 0,
    near_miss: 0,
    event: 0,
  };
}

function actionId(action: GameAction): string | undefined {
  if (action.type === "choice" || action.type === "info") {
    return action.actionId;
  }

  if (action.type === "card") {
    return action.cardId;
  }

  return undefined;
}

function legalActions(scenario: Scenario, state: GameState): GameAction[] {
  const node = scenario.nodes[state.nodeId];

  if (!node) {
    throw new Error(`missing_node:${state.nodeId}`);
  }

  if (node.type === "ending") {
    return [];
  }

  if (node.type === "hazard") {
    throw new Error(`unexpected_visible_hazard:${state.nodeId}`);
  }

  if (node.type === "scene" || node.type === "event") {
    return [{ type: "continue" }];
  }

  const actions: GameAction[] = node.choices.map((choice) => ({
    type: "choice",
    actionId: choice.actionId,
  }));

  for (const info of node.infoActions) {
    const usageId = `${state.nodeId}:${info.actionId}`;
    if (!state.usedInfoActions.includes(usageId)) {
      actions.push({ type: "info", actionId: info.actionId });
    }
  }

  for (const cardId of scenario.cards) {
    if (state.cardsUsed.includes(cardId)) continue;
    if (node.allowedCards && !node.allowedCards.includes(cardId)) continue;
    if (!BARRIER_CARDS[cardId]) continue;
    actions.push({ type: "card", cardId });
  }

  return actions;
}

function pathStep(state: GameState, action: GameAction): SimulatedPathStep {
  const id = actionId(action);

  if (id === undefined) {
    return {
      nodeId: state.nodeId,
      actionType: action.type,
    };
  }

  return {
    nodeId: state.nodeId,
    actionType: action.type,
    actionId: id,
  };
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function favorable(ending: Ending): boolean {
  return ending === "safe_complete" || ending === "safe_stop";
}

export function simulateScenarioPaths(
  scenario: Scenario,
  options: PathSimulationOptions = {},
): PathSimulationReport {
  const simulationSeeds =
    options.simulationSeeds && options.simulationSeeds.length > 0
      ? options.simulationSeeds
      : ["balance-seed-1", "balance-seed-2", "balance-seed-3"];

  const maxTerminalPaths = options.maxTerminalPaths ?? 25_000;
  const maxExploredStates = options.maxExploredStates ?? 100_000;
  const maxActionsPerPath = options.maxActionsPerPath ?? 40;
  const exampleLimit = options.exampleLimit ?? 12;
  const dominantHpGap = options.dominantHpGap ?? 40;
  const dominantFavorableGap = options.dominantFavorableGap ?? 0.4;
  const endingImbalanceThreshold = options.endingImbalanceThreshold ?? 0.9;

  const warnings: PathSimulationWarning[] = [];
  const warningKeys = new Set<string>();
  const endingCounts = emptyEndingCounts();
  const examples: TerminalPathExample[] = [];
  const choiceAccumulators = new Map<string, ChoiceAccumulator>();

  let complete = true;
  let exploredStates = 0;
  let terminalPaths = 0;
  let hpTotal = 0;
  let hpMin: number | null = null;
  let hpMax: number | null = null;

  function addWarning(warning: PathSimulationWarning): void {
    const key = [
      warning.code,
      warning.nodeId ?? "",
      warning.actionId ?? "",
    ].join(":");

    if (warningKeys.has(key)) return;
    warningKeys.add(key);
    warnings.push(warning);
  }

  outer:
  for (const simulationSeed of simulationSeeds) {
    const queue: QueueItem[] = [
      {
        state: createGame(scenario, {
          simulationSeed,
          presentationSeed: "balance-presentation",
        }),
        steps: [],
      },
    ];

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      if (exploredStates >= maxExploredStates) {
        complete = false;
        addWarning({
          severity: "error",
          code: "explored_state_limit_reached",
          message:
            `Exploration stopped after ${maxExploredStates} states. Increase the limit or simplify the scenario graph.`,
        });
        break outer;
      }

      const item = queue[cursor];
      if (!item) continue;
      exploredStates += 1;

      if (isFinished(scenario, item.state)) {
        if (terminalPaths >= maxTerminalPaths) {
          complete = false;
          addWarning({
            severity: "error",
            code: "terminal_path_limit_reached",
            message:
              `Exploration stopped after ${maxTerminalPaths} terminal paths. Increase the limit or reduce optional-action combinations.`,
          });
          break outer;
        }

        const result = evaluate(scenario, item.state, {
          reflectionAnswered: true,
          swissCheeseViewed: true,
        });

        terminalPaths += 1;
        endingCounts[result.ending] += 1;
        hpTotal += result.hpPoint;
        hpMin = hpMin === null ? result.hpPoint : Math.min(hpMin, result.hpPoint);
        hpMax = hpMax === null ? result.hpPoint : Math.max(hpMax, result.hpPoint);

        for (const step of item.steps) {
          if (step.actionType !== "choice" || !step.actionId) continue;

          const key = `${step.nodeId}::${step.actionId}`;
          const accumulator =
            choiceAccumulators.get(key) ?? {
              samples: 0,
              hpTotal: 0,
              favorable: 0,
              endingCounts: emptyEndingCounts(),
            };

          accumulator.samples += 1;
          accumulator.hpTotal += result.hpPoint;
          accumulator.endingCounts[result.ending] += 1;
          if (favorable(result.ending)) {
            accumulator.favorable += 1;
          }

          choiceAccumulators.set(key, accumulator);
        }

        if (examples.length < exampleLimit) {
          examples.push({
            simulationSeed,
            ending: result.ending,
            hpPoint: result.hpPoint,
            actions: item.steps,
          });
        }

        continue;
      }

      if (item.steps.length >= maxActionsPerPath) {
        complete = false;
        addWarning({
          severity: "error",
          code: "action_limit_reached",
          message:
            `A path exceeded ${maxActionsPerPath} user actions before reaching an ending. Check for user-action cycles.`,
          nodeId: item.state.nodeId,
        });
        continue;
      }

      for (const action of legalActions(scenario, item.state)) {
        const next = act(scenario, item.state, action);
        queue.push({
          state: next,
          steps: [...item.steps, pathStep(item.state, action)],
        });
      }
    }
  }

  const endingRates = emptyEndingCounts();
  for (const ending of ENDINGS) {
    endingRates[ending] =
      terminalPaths === 0 ? 0 : round(endingCounts[ending] / terminalPaths, 4);
  }

  const choices: ChoiceSimulationStats[] = [];

  for (const [nodeId, node] of Object.entries(scenario.nodes)) {
    if (node.type !== "decision") continue;

    for (const choice of node.choices) {
      const accumulator = choiceAccumulators.get(
        `${nodeId}::${choice.actionId}`,
      );

      choices.push({
        nodeId,
        actionId: choice.actionId,
        label: choice.label,
        samples: accumulator?.samples ?? 0,
        meanHp:
          accumulator && accumulator.samples > 0
            ? round(accumulator.hpTotal / accumulator.samples)
            : null,
        favorableEndingRate:
          accumulator && accumulator.samples > 0
            ? round(accumulator.favorable / accumulator.samples, 4)
            : null,
        endingCounts: accumulator?.endingCounts ?? emptyEndingCounts(),
      });
    }
  }

  if (complete && terminalPaths > 0) {
    const reachedEndings = ENDINGS.filter((ending) => endingCounts[ending] > 0);

    if (reachedEndings.length === 1) {
      addWarning({
        severity: "warning",
        code: "single_ending_reached",
        message:
          `All ${terminalPaths} explored paths reached ${reachedEndings[0]}. Check whether meaningful outcome variation is intended.`,
      });
    }

    const dominantEnding = ENDINGS
      .map((ending) => ({
        ending,
        rate: endingCounts[ending] / terminalPaths,
      }))
      .sort((a, b) => b.rate - a.rate)[0];

    if (
      dominantEnding &&
      terminalPaths >= 20 &&
      dominantEnding.rate >= endingImbalanceThreshold
    ) {
      addWarning({
        severity: "warning",
        code: "ending_imbalance",
        message:
          `${dominantEnding.ending} accounts for ${round(dominantEnding.rate * 100)}% of explored terminal paths.`,
      });
    }

    const decisionIds = new Set(
      choices.map((choice) => choice.nodeId),
    );

    for (const nodeId of decisionIds) {
      const nodeChoices = choices
        .filter(
          (choice) =>
            choice.nodeId === nodeId &&
            choice.samples >= 3 &&
            choice.meanHp !== null &&
            choice.favorableEndingRate !== null,
        )
        .sort((a, b) => (b.meanHp ?? 0) - (a.meanHp ?? 0));

      const best = nodeChoices[0];
      const runnerUp = nodeChoices[1];

      if (!best || !runnerUp) continue;

      const hpGap = (best.meanHp ?? 0) - (runnerUp.meanHp ?? 0);
      const favorableGap =
        (best.favorableEndingRate ?? 0) -
        (runnerUp.favorableEndingRate ?? 0);

      if (
        hpGap >= dominantHpGap &&
        favorableGap >= dominantFavorableGap
      ) {
        addWarning({
          severity: "warning",
          code: "dominant_choice_bias",
          nodeId,
          actionId: best.actionId,
          message:
            `${best.actionId} dominates the next choice by ${round(hpGap)} mean HP and ${round(favorableGap * 100)} percentage points of favorable endings.`,
        });
      }
    }
  }

  return {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    simulationSeeds: [...simulationSeeds],
    complete,
    exploredStates,
    terminalPaths,
    endingCounts,
    endingRates,
    hp: {
      min: hpMin,
      max: hpMax,
      mean: terminalPaths === 0 ? null : round(hpTotal / terminalPaths),
    },
    choices,
    warnings,
    examples,
  };
}
