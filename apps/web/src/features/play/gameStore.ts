import {
  act,
  createGame,
  type GameAction,
  type GameState,
} from "@hero/engine";
import type { Scenario } from "@hero/schema";
import { create } from "zustand";

interface TutorialGameStore {
  game: GameState | null;
  start: (scenario: Scenario) => void;
  dispatch: (scenario: Scenario, action: GameAction) => void;
  reset: () => void;
}

export const useTutorialGameStore = create<TutorialGameStore>((set, get) => ({
  game: null,
  start: (scenario) => {
    set({
      game: createGame(scenario, {
        simulationSeed: "tutorial-local-v1",
        presentationSeed: "tutorial-ui-v1",
      }),
    });
  },
  dispatch: (scenario, action) => {
    const current = get().game;
    if (!current) {
      throw new Error("tutorial_game_not_started");
    }

    set({ game: act(scenario, current, action) });
  },
  reset: () => set({ game: null }),
}));
