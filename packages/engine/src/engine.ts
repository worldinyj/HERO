import type {
  Effects,
  Scenario,
  ScenarioNode,
} from "@hero/schema";
import { validateScenarioGraph } from "@hero/schema";
import { BARRIER_CARDS } from "./catalog";
import { seededOrderKey, seededUnit } from "./rng";
import type {
  GameAction,
  GameLogEntry,
  GameState,
  GameView,
  Metrics,
  UserActionType,
  VisibleNode,
} from "./types";

const METRIC_KEYS = [
  "safety",
  "awareness",
  "communication",
  "procedure",
  "challenge",
] as const;

export interface CreateGameOptions {
  simulationSeed: string;
  presentationSeed?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    psf: { ...state.psf },
    barriers: { ...state.barriers },
    metrics: { ...state.metrics },
    flags: { ...state.flags },
    cardsUsed: [...state.cardsUsed],
    usedInfoActions: [...state.usedInfoActions],
    log: state.log.map((entry) => ({
      ...entry,
      weakBarriers: entry.weakBarriers ? [...entry.weakBarriers] : undefined,
    })),
  };
}

function combinedBarrier(barriers: Record<string, number>): number {
  const values = Object.values(barriers);
  if (values.length === 0) return 0;

  const residual = values.reduce(
    (product, value) => product * (1 - clamp(value, 0, 1)),
    1,
  );

  return clamp(1 - residual, 0, 1);
}

function deadlineMultiplier(state: GameState): number {
  const remaining = state.deadlineMin - state.clockMin;

  if (remaining < 0) return 1.8;
  if (remaining <= 10) return 1.5;
  if (remaining <= 30) return 1.2;
  return 1;
}

export function computeHazardIndex(state: GameState): number {
  const psfMultiplier = Object.values(state.psf).reduce(
    (product, value) => product * value,
    1,
  );

  const barrier = combinedBarrier(state.barriers);
  const index =
    state.baseHazard *
    psfMultiplier *
    deadlineMultiplier(state) *
    (1 - barrier);

  return clamp(index, 0, 100);
}

function applyEffects(state: GameState, effects?: Effects): void {
  if (!effects) return;

  for (const [key, multiplier] of Object.entries(effects.psfMultipliers ?? {})) {
    state.psf[key] = clamp((state.psf[key] ?? 1) * multiplier, 0.1, 10);
  }

  for (const [key, delta] of Object.entries(effects.barrierDelta ?? {})) {
    state.barriers[key] = clamp((state.barriers[key] ?? 0) + delta, 0, 1);
  }

  for (const key of METRIC_KEYS) {
    const delta = effects.metricsDelta?.[key];
    if (delta !== undefined) {
      state.metrics[key] = clamp(state.metrics[key] + delta, 0, 100);
    }
  }

  for (const [key, value] of Object.entries(effects.flags ?? {})) {
    state.flags[key] = value;
  }
}

function appendLog(
  state: GameState,
  entry: Omit<GameLogEntry, "step">,
): void {
  state.log.push({
    step: state.log.length,
    ...entry,
  });
}

function nextRandom(state: GameState): number {
  const value = seededUnit(state.simulationSeed, state.rngCounter);
  state.rngCounter += 1;
  return value;
}

function weakBarriers(state: GameState): string[] {
  return Object.entries(state.barriers)
    .filter(([, strength]) => strength < 0.5)
    .map(([id]) => id)
    .sort();
}

function advanceAutomatic(
  scenario: Scenario,
  state: GameState,
): GameState {
  let guard = 0;

  while (true) {
    guard += 1;
    if (guard > 100) {
      throw new Error("automatic_transition_loop");
    }

    const node = scenario.nodes[state.nodeId];
    if (!node) {
      throw new Error(`missing_node:${state.nodeId}`);
    }

    if (node.type !== "hazard") {
      return state;
    }

    const hazard = computeHazardIndex(state);
    const jitter = node.jitter === 0
      ? 0
      : (nextRandom(state) * 2 - 1) * node.jitter;
    const trigger = clamp(node.threshold + jitter, 0, 100);
    const breached = hazard >= trigger;

    appendLog(state, {
      nodeId: state.nodeId,
      actionType: "hazard_check",
      actionId: node.tag,
      clockBefore: state.clockMin,
      clockAfter: state.clockMin,
      hazardBefore: hazard,
      hazardAfter: hazard,
      breached,
      weakBarriers: breached ? weakBarriers(state) : [],
    });

    state.nodeId = breached ? node.breachNext : node.passNext;
  }
}

export function createGame(
  scenario: Scenario,
  options: CreateGameOptions,
): GameState {
  const issues = validateScenarioGraph(scenario).filter(
    (issue) => issue.severity === "error",
  );

  if (issues.length > 0) {
    throw new Error(`invalid_scenario:${issues[0]?.code ?? "unknown"}`);
  }

  const state: GameState = {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    nodeId: scenario.startNode,
    clockMin: scenario.initialState.clockMin,
    deadlineMin: scenario.initialState.deadlineMin,
    baseHazard: scenario.initialState.baseHazard,
    psf: { ...scenario.initialState.psf },
    barriers: { ...scenario.initialState.barriers },
    metrics: { ...scenario.initialState.metrics } as Metrics,
    flags: {},
    cardsUsed: [],
    usedInfoActions: [],
    log: [],
    simulationSeed: options.simulationSeed,
    presentationSeed:
      options.presentationSeed ?? `${options.simulationSeed}:presentation`,
    rngCounter: 0,
  };

  return advanceAutomatic(scenario, state);
}

function currentNode(scenario: Scenario, state: GameState): ScenarioNode {
  const node = scenario.nodes[state.nodeId];
  if (!node) {
    throw new Error(`missing_node:${state.nodeId}`);
  }
  return node;
}

function recordUserAction(
  state: GameState,
  nodeId: string,
  actionType: UserActionType,
  actionId: string | undefined,
  clockBefore: number,
  hazardBefore: number,
): void {
  appendLog(state, {
    nodeId,
    actionType,
    actionId,
    clockBefore,
    clockAfter: state.clockMin,
    hazardBefore,
    hazardAfter: computeHazardIndex(state),
  });
}

export function act(
  scenario: Scenario,
  current: GameState,
  action: GameAction,
): GameState {
  const state = cloneState(current);
  const node = currentNode(scenario, state);

  if (node.type === "ending") {
    throw new Error("game_finished");
  }

  if (node.type === "hazard") {
    throw new Error("hazard_node_must_auto_resolve");
  }

  const nodeId = state.nodeId;
  const clockBefore = state.clockMin;
  const hazardBefore = computeHazardIndex(state);

  if (action.type === "continue") {
    if (node.type !== "scene" && node.type !== "event") {
      throw new Error("continue_not_allowed");
    }

    state.nodeId = node.next;
    recordUserAction(
      state,
      nodeId,
      "continue",
      undefined,
      clockBefore,
      hazardBefore,
    );

    return advanceAutomatic(scenario, state);
  }

  if (node.type !== "decision") {
    throw new Error("decision_action_not_allowed");
  }

  if (action.type === "choice") {
    const choice = node.choices.find(
      (candidate) => candidate.actionId === action.actionId,
    );

    if (!choice) {
      throw new Error("choice_not_found");
    }

    state.clockMin += choice.timeCostMin;
    applyEffects(state, choice.effects);
    state.nodeId = choice.next;
    recordUserAction(
      state,
      nodeId,
      "choice",
      choice.actionId,
      clockBefore,
      hazardBefore,
    );

    return advanceAutomatic(scenario, state);
  }

  if (action.type === "info") {
    const info = node.infoActions.find(
      (candidate) => candidate.actionId === action.actionId,
    );

    if (!info) {
      throw new Error("info_action_not_found");
    }

    const usageId = `${nodeId}:${info.actionId}`;
    if (state.usedInfoActions.includes(usageId)) {
      throw new Error("info_action_already_used");
    }

    state.clockMin += info.timeCostMin;
    applyEffects(state, info.effects);
    state.usedInfoActions.push(usageId);
    recordUserAction(
      state,
      nodeId,
      "info",
      info.actionId,
      clockBefore,
      hazardBefore,
    );

    return state;
  }

  const card = BARRIER_CARDS[action.cardId];
  if (!card || !scenario.cards.includes(action.cardId)) {
    throw new Error("card_not_available");
  }

  if (
    node.allowedCards &&
    !node.allowedCards.includes(action.cardId)
  ) {
    throw new Error("card_not_allowed_here");
  }

  if (state.cardsUsed.includes(action.cardId)) {
    throw new Error("card_already_used");
  }

  state.clockMin += card.timeCostMin;
  applyEffects(state, card.effects);
  state.cardsUsed.push(action.cardId);
  recordUserAction(
    state,
    nodeId,
    "card",
    card.id,
    clockBefore,
    hazardBefore,
  );

  return state;
}

function shuffledVisibleNode(
  node: VisibleNode,
  presentationSeed: string,
  nodeId: string,
): VisibleNode {
  if (node.type !== "decision") {
    return node;
  }

  return {
    ...node,
    choices: [...node.choices].sort(
      (a, b) =>
        seededOrderKey(presentationSeed, `${nodeId}:${a.actionId}`) -
        seededOrderKey(presentationSeed, `${nodeId}:${b.actionId}`),
    ),
  };
}

export function getView(
  scenario: Scenario,
  state: GameState,
): GameView {
  const node = currentNode(scenario, state);

  if (node.type === "hazard") {
    throw new Error("hidden_hazard_node_exposed");
  }

  return {
    nodeId: state.nodeId,
    node: shuffledVisibleNode(node, state.presentationSeed, state.nodeId),
    clockMin: state.clockMin,
    deadlineMin: state.deadlineMin,
    cardsAvailable: scenario.cards.filter(
      (cardId) => !state.cardsUsed.includes(cardId),
    ),
    cardsUsed: [...state.cardsUsed],
    usedInfoActions: [...state.usedInfoActions],
  };
}

export function isFinished(
  scenario: Scenario,
  state: GameState,
): boolean {
  return currentNode(scenario, state).type === "ending";
}

function logEntryToAction(entry: GameLogEntry): GameAction | null {
  if (entry.actionType === "hazard_check") return null;
  if (entry.actionType === "continue") return { type: "continue" };
  if (entry.actionType === "choice" && entry.actionId) {
    return { type: "choice", actionId: entry.actionId };
  }
  if (entry.actionType === "info" && entry.actionId) {
    return { type: "info", actionId: entry.actionId };
  }
  if (entry.actionType === "card" && entry.actionId) {
    return { type: "card", cardId: entry.actionId };
  }
  return null;
}

export function replayFrom(
  scenario: Scenario,
  options: CreateGameOptions,
  priorLog: GameLogEntry[],
  targetNodeId: string,
): GameState {
  let state = createGame(scenario, options);

  for (const entry of priorLog) {
    if (entry.actionType === "hazard_check") continue;

    if (state.nodeId === targetNodeId) {
      return state;
    }

    const action = logEntryToAction(entry);
    if (action) {
      state = act(scenario, state, action);
    }
  }

  if (state.nodeId === targetNodeId) {
    return state;
  }

  throw new Error(`replay_target_not_found:${targetNodeId}`);
}
