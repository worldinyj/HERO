import type { GameLogEntry, GameState } from "@hero/engine";
import type { Scenario } from "@hero/schema";

function actionLabel(
  scenario: Scenario,
  entry: GameLogEntry,
): string {
  const node = scenario.nodes[entry.nodeId];

  if (entry.actionType === "hazard_check") {
    return entry.breached
      ? "여러 방어막의 약화가 겹친 지점"
      : "방어막이 기능한 확인 지점";
  }

  if (!node || node.type !== "decision") {
    return entry.actionType === "continue" ? "상황 진행" : entry.actionType;
  }

  if (entry.actionType === "choice") {
    return (
      node.choices.find((choice) => choice.actionId === entry.actionId)?.label ??
      "행동 선택"
    );
  }

  if (entry.actionType === "info") {
    return (
      node.infoActions.find((info) => info.actionId === entry.actionId)?.label ??
      "정보 확인"
    );
  }

  if (entry.actionType === "card") {
    return `HU Tool 사용 · ${entry.actionId ?? "card"}`;
  }

  return "상황 진행";
}

function minuteLabel(totalMinutes: number): string {
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function SwissCheeseTimeline({
  scenario,
  game,
  onContinue,
  onReplay,
  replayEnabled = true,
}: {
  scenario: Scenario;
  game: GameState;
  onContinue: () => void;
  onReplay?: (nodeId: string) => void;
  replayEnabled?: boolean;
}) {
  const entries = game.log.filter(
    (entry) =>
      entry.actionType === "choice" ||
      entry.actionType === "card" ||
      entry.actionType === "info" ||
      entry.actionType === "hazard_check",
  );

  return (
    <article className="review-card">
      <p className="eyebrow">Swiss Cheese Timeline</p>
      <h2>방어막은 한 번에 무너지지 않습니다</h2>
      <p className="muted">
        선택·정보확인·HU Tool과 숨은 위험 판정을 시간 순서대로 겹쳐 봅니다.
      </p>

      <ol className="swiss-timeline">
        {entries.map((entry) => {
          const replayable = replayEnabled && Boolean(onReplay) && entry.actionType === "choice";

          return (
            <li
              key={entry.step}
              className={
                entry.actionType === "hazard_check"
                  ? entry.breached
                    ? "timeline-entry timeline-entry--breach"
                    : "timeline-entry timeline-entry--pass"
                  : "timeline-entry"
              }
            >
              <div className="timeline-time">
                {minuteLabel(entry.clockAfter)}
              </div>
              <div className="timeline-body">
                <strong>{actionLabel(scenario, entry)}</strong>

                {entry.actionType === "hazard_check" ? (
                  entry.breached ? (
                    <>
                      <span>방어막 구멍이 같은 경로에서 겹쳤습니다.</span>
                      <div className="barrier-chip-list">
                        {(entry.weakBarriers ?? []).length > 0 ? (
                          (entry.weakBarriers ?? []).map((barrier) => (
                            <span key={barrier} className="barrier-chip">
                              {barrier}
                            </span>
                          ))
                        ) : (
                          <span className="barrier-chip">복합 조건</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <span>위험 조건이 있었지만 방어막이 결과를 바꾸었습니다.</span>
                  )
                ) : (
                  <span>
                    위험지수 변화는 학습용 상대지표이며 실제 HRA/HEP가 아닙니다.
                  </span>
                )}

                {replayable ? (
                  <button
                    type="button"
                    className="text-button timeline-replay"
                    onClick={() => onReplay?.(entry.nodeId)}
                  >
                    이 지점부터 리플레이
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="review-note">
        이 화면은 특정 개인의 오류를 지목하지 않습니다. 절차·감독·정보·소통·작업
        조건과 같은 여러 방어막의 조합을 학습하기 위한 화면입니다.
      </p>

      <button type="button" className="primary-button" onClick={onContinue}>
        HP 리뷰 보기
      </button>
    </article>
  );
}
