import { getScenarioById } from "@hero/content";
import {
  BARRIER_CARDS,
  evaluate,
  getView,
  isFinished,
} from "@hero/engine";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTutorialGameStore } from "./gameStore";

function formatClock(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function GamePage() {
  const { scenarioId = "" } = useParams();
  const scenario = getScenarioById(scenarioId);
  const game = useTutorialGameStore((state) => state.game);
  const start = useTutorialGameStore((state) => state.start);
  const dispatch = useTutorialGameStore((state) => state.dispatch);
  const reset = useTutorialGameStore((state) => state.reset);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [revealedInfo, setRevealedInfo] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!scenario) return;

    if (
      !game ||
      game.scenarioId !== scenario.id ||
      game.scenarioVersion !== scenario.version
    ) {
      start(scenario);
    }
  }, [game, scenario, start]);

  useEffect(() => {
    setSelectedChoice(null);
  }, [game?.nodeId]);

  const view = useMemo(() => {
    if (!scenario || !game) return null;
    return getView(scenario, game);
  }, [game, scenario]);

  if (!scenario) {
    return (
      <section className="panel">
        <p className="eyebrow">Scenario unavailable</p>
        <h2>시나리오를 찾을 수 없습니다</h2>
        <p className="muted">현재 웹 플레이에는 0장 튜토리얼만 연결되어 있습니다.</p>
        <Link className="text-link" to="/">캠페인으로 돌아가기</Link>
      </section>
    );
  }

  if (!game || !view) {
    return (
      <section className="panel">
        <p className="muted">튜토리얼을 준비하고 있습니다…</p>
      </section>
    );
  }

  const node = view.node;
  const finished = isFinished(scenario, game);

  if (finished && node.type === "ending") {
    const result = evaluate(scenario, game, {
      reflectionAnswered: false,
      swissCheeseViewed: false,
    });

    return (
      <section className="game-page">
        <div className="game-status">
          <span>0장 튜토리얼</span>
          <span>{formatClock(view.clockMin)}</span>
        </div>

        <article className="ending-card">
          <p className="eyebrow">Training Result</p>
          <h2>{node.title}</h2>
          <p>{node.summary}</p>

          <div className="tutorial-score">
            <div>
              <span>학습행동 평균</span>
              <strong>{Math.round(result.metricAverage)}</strong>
            </div>
            <div>
              <span>회고 전 임시 HP</span>
              <strong>{result.hpPoint}</strong>
            </div>
          </div>

          <p className="muted small-copy">
            튜토리얼 점수는 리더보드에 반영되지 않습니다. 실제 시나리오는 서버가 발급한 동일 조건 seed로 검증 후 점수를 확정합니다.
          </p>

          <div className="ending-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                reset();
                start(scenario);
              }}
            >
              다시 해보기
            </button>
            <Link className="primary-link" to="/">캠페인으로</Link>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="game-page" aria-live="polite">
      <div className="game-status">
        <span>0장 · {scenario.defaultPerspectiveRole}</span>
        <span>
          {formatClock(view.clockMin)}
          <small> · 마감 {formatClock(view.deadlineMin)}</small>
        </span>
      </div>

      {(node.type === "scene" || node.type === "event") ? (
        <article className={node.type === "event" ? "scene-box event-box" : "scene-box"}>
          <p className="eyebrow">
            {node.type === "event" ? "상황 변화" : node.speaker ?? "상황"}
          </p>
          <div className="dialogue">{node.text}</div>
          <button
            className="primary-button"
            type="button"
            onClick={() => dispatch(scenario, { type: "continue" })}
          >
            계속
          </button>
        </article>
      ) : null}

      {node.type === "decision" ? (
        <article className="decision-panel">
          <p className="eyebrow">Decision</p>
          <h2>{node.prompt}</h2>

          {node.infoActions.length > 0 ? (
            <div className="decision-section">
              <h3>정보 확인</h3>
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
                        dispatch(scenario, { type: "info", actionId: info.actionId });
                        setRevealedInfo((current) => ({
                          ...current,
                          [usageId]: info.revealText,
                        }));
                      }}
                    >
                      {used ? "확인 완료" : info.label}
                      <small>+{info.timeCostMin}분</small>
                    </button>
                  );
                })}
              </div>

              {Object.entries(revealedInfo)
                .filter(([usageId]) => usageId.startsWith(`${view.nodeId}:`))
                .map(([usageId, text]) => (
                  <p key={usageId} className="info-reveal">{text}</p>
                ))}
            </div>
          ) : null}

          {view.cardsAvailable.length > 0 ? (
            <div className="decision-section">
              <h3>방어막 카드</h3>
              <div className="card-tray">
                {view.cardsAvailable
                  .filter((cardId) => !node.allowedCards || node.allowedCards.includes(cardId))
                  .map((cardId) => {
                    const card = BARRIER_CARDS[cardId];
                    if (!card) return null;

                    return (
                      <button
                        key={cardId}
                        type="button"
                        className="card-button"
                        onClick={() => dispatch(scenario, { type: "card", cardId })}
                      >
                        <span>{card.label}</span>
                        <small>+{card.timeCostMin}분</small>
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : null}

          <div className="decision-section">
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
                    className={selected ? "choice-button choice-button--selected" : "choice-button"}
                    onClick={() => setSelectedChoice(choice.actionId)}
                  >
                    <span className="choice-letter">{String.fromCharCode(65 + index)}</span>
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
                dispatch(scenario, { type: "choice", actionId: selectedChoice });
              }}
            >
              이 행동으로 진행
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
