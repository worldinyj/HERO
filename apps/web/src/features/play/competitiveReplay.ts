import {
  act,
  createGame,
  type CreateGameOptions,
  type GameAction,
  type GameState,
} from "@hero/engine";
import type { Scenario } from "@hero/schema";

export interface StoredDecisionRow {
  action_type: "continue" | "choice" | "info" | "card";
  action_id: string | null;
}

function rowToAction(row: StoredDecisionRow): GameAction {
  switch (row.action_type) {
    case "continue":
      return { type: "continue" };
    case "choice":
      if (!row.action_id) throw new Error("stored_choice_action_id_missing");
      return { type: "choice", actionId: row.action_id };
    case "info":
      if (!row.action_id) throw new Error("stored_info_action_id_missing");
      return { type: "info", actionId: row.action_id };
    case "card":
      if (!row.action_id) throw new Error("stored_card_id_missing");
      return { type: "card", cardId: row.action_id };
  }
}

export function restoreReplayPrefix(
  scenario: Scenario,
  options: CreateGameOptions,
  sourceDecisions: StoredDecisionRow[],
  replayFromNode: string,
): GameState {
  let state = createGame(scenario, options);

  if (state.nodeId === replayFromNode) {
    return state;
  }

  for (const row of sourceDecisions) {
    state = act(scenario, state, rowToAction(row));

    if (state.nodeId === replayFromNode) {
      return state;
    }
  }

  throw new Error(`replay_target_not_reachable:${replayFromNode}`);
}
