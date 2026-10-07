import type {
  Evaluation,
  GameState,
  MetricKey,
} from "@hero/engine";
import type { Scenario } from "@hero/schema";
import { Link } from "react-router";

const METRIC_LABEL: Record<MetricKey, string> = {
  safety: "Safety",
  awareness: "Awareness",
  communication: "Communication",
  procedure: "Procedure",
  challenge: "Challenge",
};

const ENDING_LABEL = {
  safe_complete: "안전 완료",
  safe_stop: "안전 정지",
  near_miss: "근접오류",
  event: "사건",
} as const;

function decisionLabel(
  scenario: Scenario,
  actionId: string | null,
): string | null {
  if (!actionId) return null;

  for (const node of Object.values(scenario.nodes)) {
    if (node.type !== "decision") continue;
    const choice = node.choices.find((item) => item.actionId === actionId);
    if (choice) return choice.label;
  }

  return actionId;
}

function replayNodes(
  scenario: Scenario,
  game: GameState,
): Array<{ nodeId: string; prompt: string }> {
  const seen = new Set<string>();
  const nodes: Array<{ nodeId: string; prompt: string }> = [];

  for (const entry of game.log) {
    if (entry.actionType !== "choice" || seen.has(entry.nodeId)) continue;
    const node = scenario.nodes[entry.nodeId];
    if (!node || node.type !== "decision") continue;

    seen.add(entry.nodeId);
    nodes.push({ nodeId: entry.nodeId, prompt: node.prompt });
  }

  return nodes;
}

export function HpReview({
  scenario,
  game,
  evaluation,
  onReplay,
  onRestart,
}: {
  scenario: Scenario;
  game: GameState;
  evaluation: Evaluation;
  onReplay: (nodeId: string) => void;
  onRestart: () => void;
}) {
  const keyDecision = decisionLabel(
    scenario,
    evaluation.keyDecisionActionId,
  );
  const decisions = replayNodes(scenario, game);

  return (
    <article className="review-card hp-review">
      <div className="hp-review-heading">
        <div>
          <p className="eyebrow">HP Review</p>
          <h2>{evaluation.hpPoint} HP</h2>
          <p className="muted">
            {ENDING_LABEL[evaluation.ending]} · score rule{" "}
            {evaluation.scoreRuleVersion}
          </p>
        </div>
        <span className="hp-max">/ 310</span>
      </div>

      <p className="notice">
        HP와 5대 지표는 학습 과정의 행동을 돌아보기 위한 지표입니다. 개인의
        능력·적성·인사평가 지표가 아닙니다.
      </p>

      <section className="review-section">
        <h3>5대 학습행동</h3>
        <div className="metric-bars">
          {(Object.entries(evaluation.metrics) as Array<[MetricKey, number]>).map(
            ([key, value]) => (
              <div key={key} className="metric-row">
                <div className="metric-label">
                  <span>{METRIC_LABEL[key]}</span>
                  <strong>{Math.round(value)}</strong>
                </div>
                <div
                  className="metric-track"
                  role="progressbar"
                  aria-label={METRIC_LABEL[key]}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(value)}
                >
                  <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                </div>
              </div>
            ),
          )}
        </div>
      </section>

      <section className="review-section">
        <h3>HP 획득 내역</h3>
        <dl className="score-breakdown">
          <div><dt>완주</dt><dd>+{evaluation.breakdown.completion}</dd></div>
          <div><dt>결과</dt><dd>+{evaluation.breakdown.ending}</dd></div>
          <div><dt>학습행동</dt><dd>+{evaluation.breakdown.learningMetrics}</dd></div>
          <div><dt>인과 회고</dt><dd>+{evaluation.breakdown.causalReflection}</dd></div>
          <div><dt>리플레이 개선</dt><dd>+{evaluation.breakdown.replayImprovement}</dd></div>
        </dl>
      </section>

      {keyDecision ? (
        <section className="review-section">
          <h3>결과에 크게 작용한 결정</h3>
          <p className="key-decision">{keyDecision}</p>
          <p className="muted mini-copy">
            “좋은 사람/나쁜 사람”을 판정하는 의미가 아니라 이 플레이에서 위험
            상태를 크게 변화시킨 결정 지점을 뜻합니다.
          </p>
        </section>
      ) : null}

      <section className="review-section">
        <h3>다르게 해보기</h3>
        <div className="replay-list">
          {decisions.map((decision) => (
            <button
              key={decision.nodeId}
              type="button"
              className="secondary-button replay-button"
              onClick={() => onReplay(decision.nodeId)}
            >
              <span>{decision.prompt}</span>
              <small>이 지점부터</small>
            </button>
          ))}
        </div>
      </section>

      <p className="muted small-copy">
        0장 튜토리얼 기록은 리더보드에 반영되지 않습니다. 경쟁 시나리오는 서버가
        동일 seed와 행동 로그를 재실행해 점수를 확정합니다.
      </p>

      <div className="ending-actions">
        <button type="button" className="secondary-button" onClick={onRestart}>
          처음부터 다시
        </button>
        <Link className="primary-link" to="/">캠페인으로</Link>
      </div>
    </article>
  );
}
