import type { GameAction, GameView } from "@hero/engine";
import type { ScenarioNode } from "@hero/schema";
import { useEffect, useState } from "react";
import { useAudio } from "../../audio/AudioContext";
import { ChoiceSheet } from "../ChoiceSheet";
import { BarrierCardTray } from "./BarrierCardTray";

type DecisionNode = Extract<ScenarioNode, { type: "decision" }>;

export function DecisionStage({
  node,
  view,
  onAction,
}: {
  node: DecisionNode;
  view: GameView;
  onAction: (action: GameAction) => void;
}) {
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const { manager: audioManager } = useAudio();

  useEffect(() => {
    setSelectedChoice(null);
  }, [view.nodeId]);

  return (
    <article className="decision-panel">
      <p className="eyebrow">Decision</p>
      <h2>{node.prompt}</h2>

      {node.infoActions.length > 0 ? (
        <section
          className="decision-section"
          aria-labelledby={`info-actions-${view.nodeId}`}
        >
          <h3 id={`info-actions-${view.nodeId}`}>정보 확인</h3>

          <div className="info-grid">
            {node.infoActions.map((info) => {
              const usageId = `${view.nodeId}:${info.actionId}`;
              const used = view.usedInfoActions.includes(usageId);

              return (
                <button
                  key={info.actionId}
                  type="button"
                  className="info-button"
                  disabled={used}
                  onClick={() => {
                    setSelectedChoice(null);
                    void audioManager.playSfx("SFX-05");
                    onAction({ type: "info", actionId: info.actionId });
                  }}
                >
                  <span>{used ? "확인 완료" : info.label}</span>
                  <small>+{info.timeCostMin}분</small>
                </button>
              );
            })}
          </div>

          {node.infoActions
            .filter((info) =>
              view.usedInfoActions.includes(
                `${view.nodeId}:${info.actionId}`,
              ),
            )
            .map((info) => (
              <p key={info.actionId} className="info-reveal" role="status">
                {info.revealText}
              </p>
            ))}
        </section>
      ) : null}

      <BarrierCardTray
        availableCardIds={view.cardsAvailable}
        allowedCardIds={node.allowedCards}
        onUse={(cardId) => {
          setSelectedChoice(null);
          onAction({ type: "card", cardId });
        }}
      />

      <ChoiceSheet
        choices={node.choices}
        selectedActionId={selectedChoice}
        onSelect={setSelectedChoice}
        onConfirm={(actionId) => {
          setSelectedChoice(null);
          void audioManager.playSfx("SFX-02");
          onAction({ type: "choice", actionId });
        }}
      />
    </article>
  );
}
