import type { GameAction, GameView } from "@hero/engine";
import { SceneStage } from "../SceneStage";
import { DecisionStage } from "./DecisionStage";
import { EventAlert } from "./EventAlert";

export function PlayNodeStage({
  view,
  onAction,
}: {
  view: GameView;
  onAction: (action: GameAction) => void;
}) {
  const node = view.node;

  if (node.type === "scene") {
    return (
      <SceneStage
        nodeKey={view.nodeId}
        speaker={node.speaker}
        text={node.text}
        tone="scene"
        onContinue={() => onAction({ type: "continue" })}
      />
    );
  }

  if (node.type === "event") {
    return (
      <EventAlert
        nodeKey={view.nodeId}
        text={node.text}
        onContinue={() => onAction({ type: "continue" })}
      />
    );
  }

  if (node.type === "decision") {
    return (
      <DecisionStage
        key={view.nodeId}
        node={node}
        view={view}
        onAction={onAction}
      />
    );
  }

  return null;
}
