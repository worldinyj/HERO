import { useEffect } from "react";
import { useAudio } from "../../audio/AudioContext";
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
  const { manager: audioManager } = useAudio();

  useEffect(() => {
    void audioManager.playSfx("SFX-07");
  }, [audioManager, nodeKey]);

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
