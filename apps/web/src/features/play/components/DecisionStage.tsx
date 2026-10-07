import {
  BARRIER_CARDS,
  type GameAction,
  type GameView,
} from "@hero/engine";
import type { Scenario } from "@hero/schema";
import { useEffect, useMemo, useState } from "react";

export function DecisionStage({
  scenario,
  view,
  onAction,
}: {
  scenario: Scenario;
  view: GameView;
  onAction: (action: GameAction) => void;
}) {
  const node = view.node;

  if (node.type !== "decision") {
    return null;
  }

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
    setSelectedChoice(null);
  }, [view.nodeId]);

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

      <section className="decision-section">
        <h3>행동 선택</h3>
        <div className="choice-list" role="radiogroup" aria-label="행동 선택">
          {node.choices.map((choice, index) => {
            const selected = selectedChoice === choice.actionId;

            return (
              <button
                key={choice.actionId}
                type="button"
                role="radio"
                aria-checked={selected}
                className={
                  selected
                    ? "choice-button choice-button--selected"
                    : "choice-button"
                }
                onClick={() => setSelectedChoice(choice.actionId)}
              >
                <span className="choice-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span>{choice.label}</span>
                <small>+{choice.timeCostMin}분</small>
              </button>
            );
          })}
        </div>

        <button
          className="primary-button confirm-choice"
          type="button"
          disabled={!selectedChoice}
          onClick={() => {
            if (!selectedChoice) return;
            onAction({ type: "choice", actionId: selectedChoice });
          }}
        >
          {selectedChoice ? "선택한 행동으로 진행" : "행동을 먼저 선택하세요"}
        </button>
      </section>
    </article>
  );
}
