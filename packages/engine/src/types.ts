import type {
  Ending,
  MetricKey,
  ScenarioNode,
} from "@hero/schema";

export type Metrics = Record<MetricKey, number>;

export interface GameState {
  scenarioId: string;
  scenarioVersion: number;
  nodeId: string;
  clockMin: number;
  deadlineMin: number;
  baseHazard: number;
  psf: Record<string, number>;
  barriers: Record<string, number>;
  metrics: Metrics;
  flags: Record<string, boolean>;
  cardsUsed: string[];
  usedInfoActions: string[];
  log: GameLogEntry[];
  simulationSeed: string;
  presentationSeed: string;
  rngCounter: number;
}

export type UserActionType = "continue" | "choice" | "info" | "card";

export type GameAction =
  | { type: "continue" }
  | { type: "choice"; actionId: string }
  | { type: "info"; actionId: string }
  | { type: "card"; cardId: string };

export interface GameLogEntry {
  step: number;
  nodeId: string;
  actionType: UserActionType | "hazard_check";
  actionId?: string | undefined;
  clockBefore: number;
  clockAfter: number;
  hazardBefore: number;
  hazardAfter: number;
  breached?: boolean | undefined;
  weakBarriers?: string[] | undefined;
}

export type VisibleNode = Exclude<ScenarioNode, { type: "hazard" }>;

export interface GameView {
  nodeId: string;
  node: VisibleNode;
  clockMin: number;
  deadlineMin: number;
  cardsAvailable: string[];
  cardsUsed: string[];
  usedInfoActions: string[];
}

export interface ScoreContext {
  reflectionAnswered: boolean;
  swissCheeseViewed: boolean;
  previousBestMetricAvg?: number;
}

export interface ScoreBreakdown {
  completion: number;
  ending: number;
  learningMetrics: number;
  causalReflection: number;
  replayImprovement: number;
  total: number;
}

export interface Evaluation {
  ending: Ending;
  metrics: Metrics;
  metricAverage: number;
  hpPoint: number;
  scoreRuleVersion: string;
  breakdown: ScoreBreakdown;
  keyDecisionActionId: string | null;
  breachChain: Array<{
    hazardNodeId: string;
    weakBarriers: string[];
  }>;
}
