import { SceneStage } from "../SceneStage";

export function EventAlert({
  nodeKey,
  text,
  onContinue,
}: {
  nodeKey: string;
  text: string;
  onContinue: () => void;
}) {
  return (
    <div className="event-alert" role="status" aria-label="상황 변화">
      <SceneStage
        nodeKey={nodeKey}
        text={text}
        tone="event"
        onContinue={onContinue}
      />
    </div>
  );
}
