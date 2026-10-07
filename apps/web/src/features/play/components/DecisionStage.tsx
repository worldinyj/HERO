import {
  BARRIER_CARDS,
  type GameAction,
  type GameView,
} from "@hero/engine";
import type { ScenarioNode } from "@hero/schema";
import { useEffect, useMemo, useState } from "react";
import { ChoiceSheet } from "../ChoiceSheet";

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
  const [cardsOpen, setCardsOpen] = useState(false);
  const [lastUsedCard, setLastUsedCard] = useState<string | null>(null);

  const availableCards = useMemo(
    () =>
      view.cardsAvailable.filter(
        (cardId) =>
          (!node.allowedCards || node.allowedCards.includes(cardId)) &&
          Boolean(BARRIER_CARDS[cardId]),
      ),
    [node.allowedCards, view.cardsAvailable],
  );

  useEffect(() => {
    if (!lastUsedCard) return;
    const timer = window.setTimeout(() => setLastUsedCard(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lastUsedCard]);

  return (
    <article className="decision-panel">
      <p className="eyebrow">Decision</p>
      <h2>{node.prompt}</h2>

      {node.infoActions.length > 0 ? (
        <section className="decision-section" aria-labelledby={`info-${view.nodeId}`}>
          <h3 id={`info-${view.nodeId}`}>정보 확인</h3>
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
                  onClick={() =>
                    onAction({ type: "info", actionId: info.actionId })
                  }
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

      {availableCards.length > 0 || lastUsedCard ? (
        <section className="decision-section barrier-tray">
          <button
            type="button"
            className="barrier-tray-toggle"
            aria-expanded={cardsOpen}
            aria-controls={`barrier-cards-${view.nodeId}`}
            onClick={() => setCardsOpen((open) => !open)}
          >
            <span>방어막 카드</span>
            <strong>{availableCards.length}</strong>
            <small>{cardsOpen ? "접기" : "펼치기"}</small>
          </button>

          {lastUsedCard ? (
            <p className="barrier-use-feedback" role="status">
              {BARRIER_CARDS[lastUsedCard]?.label ?? lastUsedCard} 방어막을 적용했습니다.
            </p>
          ) : null}

          {cardsOpen && availableCards.length > 0 ? (
            <div
              className="card-tray card-tray--expanded"
              id={`barrier-cards-${view.nodeId}`}
            >
              {availableCards.map((cardId) => {
                const card = BARRIER_CARDS[cardId];
                if (!card) return null;

                return (
                  <button
                    key={cardId}
                    type="button"
                    className="card-button"
                    onClick={() => {
                      setLastUsedCard(cardId);
                      onAction({ type: "card", cardId });
                    }}
                  >
                    <span>{card.label}</span>
                    <small>+{card.timeCostMin}분</small>
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <ChoiceSheet
        choices={node.choices}
        selectedActionId={selectedChoice}
        onSelect={setSelectedChoice}
        onConfirm={(actionId) => {
          setSelectedChoice(null);
          onAction({ type: "choice", actionId });
        }}
      />
    </article>
  );
}
