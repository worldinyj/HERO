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
import {
  clearGameSession,
  loadGameSession,
  saveGameSession,
} from "../../lib/gamePersistence";

interface TutorialGameStore {
  game: GameState | null;
  previousBestMetricAvg: number | null;
  hydratedScenarioId: string | null;
  hydrating: boolean;
  start: (scenario: Scenario) => void;
  hydrate: (scenario: Scenario) => Promise<boolean>;
  dispatch: (scenario: Scenario, action: GameAction) => void;
  replayAt: (scenario: Scenario, nodeId: string) => void;
  reset: () => void;
}

function persist(
  game: GameState,
  previousBestMetricAvg: number | null,
): void {
  void saveGameSession({
    scenarioId: game.scenarioId,
    scenarioVersion: game.scenarioVersion,
    game,
    previousBestMetricAvg,
  }).catch(() => {
    // Persistence failure must never block an already-started game.
  });
}

export const useTutorialGameStore = create<TutorialGameStore>((set, get) => ({
  game: null,
  previousBestMetricAvg: null,
  hydratedScenarioId: null,
  hydrating: false,

  start: (scenario) => {
    const game = createGame(scenario, {
      simulationSeed: "tutorial-local-v1",
      presentationSeed: "tutorial-ui-v1",
    });

    set({
      game,
      previousBestMetricAvg: null,
      hydratedScenarioId: scenario.id,
      hydrating: false,
    });
    persist(game, null);
  },

  hydrate: async (scenario) => {
    set({ hydrating: true });

    try {
      const saved = await loadGameSession(scenario.id);

      if (
        saved &&
        saved.formatVersion === 1 &&
        saved.scenarioId === scenario.id &&
        saved.scenarioVersion === scenario.version &&
        saved.game.scenarioId === scenario.id &&
        saved.game.scenarioVersion === scenario.version
      ) {
        set({
          game: saved.game,
          previousBestMetricAvg: saved.previousBestMetricAvg,
          hydratedScenarioId: scenario.id,
          hydrating: false,
        });
        return true;
      }

      if (saved) {
        await clearGameSession(scenario.id);
      }

      set({
        game: null,
        previousBestMetricAvg: null,
        hydratedScenarioId: scenario.id,
        hydrating: false,
      });
      return false;
    } catch {
      set({
        game: null,
        previousBestMetricAvg: null,
        hydratedScenarioId: scenario.id,
        hydrating: false,
      });
      return false;
    }
  },

  dispatch: (scenario, action) => {
    const current = get().game;
    if (!current) {
      throw new Error("tutorial_game_not_started");
    }

    const game = act(scenario, current, action);
    const previousBestMetricAvg = get().previousBestMetricAvg;
    set({ game });
    persist(game, previousBestMetricAvg);
  },

  replayAt: (scenario, nodeId) => {
    const current = get().game;
    if (!current) {
      throw new Error("tutorial_game_not_started");
    }

    const currentAverage = metricAverage(current);
    const previousBest = get().previousBestMetricAvg;
    const previousBestMetricAvg =
      previousBest === null
        ? currentAverage
        : Math.max(previousBest, currentAverage);

    const game = replayFrom(
      scenario,
      {
        simulationSeed: current.simulationSeed,
        presentationSeed: current.presentationSeed,
      },
      current.log,
      nodeId,
    );

    set({
      game,
      previousBestMetricAvg,
    });
    persist(game, previousBestMetricAvg);
  },

  reset: () => {
    const scenarioId = get().game?.scenarioId;
    if (scenarioId) {
      void clearGameSession(scenarioId).catch(() => {
        // Best-effort cleanup only.
      });
    }

    set({
      game: null,
      previousBestMetricAvg: null,
      hydratedScenarioId: scenarioId ?? get().hydratedScenarioId,
      hydrating: false,
    });
  },
}));
