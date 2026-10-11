import { NarrationControl } from "../../audio/NarrationControl";
import type { GameAction, GameView } from "@hero/engine";
import { SceneStage } from "../SceneStage";
import { DecisionStage } from "./DecisionStage";
import { EventAlert } from "./EventAlert";

export function PlayNodeStage({
  scenarioId, scenarioVersion,
  view,
  onAction,
}: {
  scenarioId: string;
  scenarioVersion: number;
  view: GameView;
  onAction: (action: GameAction) => void;
}) {
  const node = view.node;

  if (node.type === "scene") {
    return (
      <>
      <NarrationControl request={{ scenarioId, scenarioVersion, nodeId: view.nodeId, field: "text", text: node.text }} />
      <SceneStage
        nodeKey={view.nodeId}
        speaker={node.speaker}
        text={node.text}
        tone="scene"
        onContinue={() => onAction({ type: "continue" })}
      />
      </>
    );
  }

  if (node.type === "event") {
    return (
      <>
      <NarrationControl request={{ scenarioId, scenarioVersion, nodeId: view.nodeId, field: "text", text: node.text }} />
      <EventAlert
        nodeKey={view.nodeId}
        text={node.text}
        onContinue={() => onAction({ type: "continue" })}
      />
      </>
    );
  }

  if (node.type === "decision") {
    return (
      <DecisionStage
        key={view.nodeId}
        scenarioId={scenarioId} scenarioVersion={scenarioVersion}
        node={node}
        view={view}
        onAction={onAction}
      />
    );
  }

  return null;
}
