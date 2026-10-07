import {
  act,
  createGame,
  metricAverage,
  replayFrom,
  type GameAction,
  type GameState,
} from "@hero/engine";
import type { Scenario } from "@hero/schema";
import { create } from "zustand";

interface TutorialGameStore {
  game: GameState | null;
  previousBestMetricAvg: number | null;
  start: (scenario: Scenario) => void;
  dispatch: (scenario: Scenario, action: GameAction) => void;
  replayAt: (scenario: Scenario, nodeId: string) => void;
  reset: () => void;
}

export const useTutorialGameStore = create<TutorialGameStore>((set, get) => ({
  game: null,
  previousBestMetricAvg: null,

  start: (scenario) => {
    set({
      game: createGame(scenario, {
        simulationSeed: "tutorial-local-v1",
        presentationSeed: "tutorial-ui-v1",
      }),
      previousBestMetricAvg: null,
    });
  },

  dispatch: (scenario, action) => {
    const current = get().game;
    if (!current) {
      throw new Error("tutorial_game_not_started");
    }

    set({ game: act(scenario, current, action) });
  },

  replayAt: (scenario, nodeId) => {
    const current = get().game;
    if (!current) {
      throw new Error("tutorial_game_not_started");
    }

    const currentAverage = metricAverage(current);
    const previousBest = get().previousBestMetricAvg;

    set({
      game: replayFrom(
        scenario,
        {
          simulationSeed: current.simulationSeed,
          presentationSeed: current.presentationSeed,
        },
        current.log,
        nodeId,
      ),
      previousBestMetricAvg:
        previousBest === null
          ? currentAverage
          : Math.max(previousBest, currentAverage),
    });
  },

  reset: () => set({ game: null, previousBestMetricAvg: null }),
}));
