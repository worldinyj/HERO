import { BARRIER_CARDS, type GameState } from "@hero/engine";
import type { Scenario } from "@hero/schema";
import { Link } from "react-router";

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

export function IncidentDebrief({
  scenario,
  game,
  replayEnabled,
  onReplay,
}: {
  scenario: Scenario;
  game: GameState;
  replayEnabled: boolean;
  onReplay: (nodeId: string) => void;
}) {
  const debrief = scenario.incidentDebrief;
  if (!debrief) return null;

  const decisions = replayNodes(scenario, game);

  return (
    <article className="review-card incident-debrief">
      <header className="incident-heading">
        <div>
          <p className="eyebrow">Real Event Learning</p>
          <h2>실사건에서 다시 보기</h2>
        </div>
        <span className="incident-type">{debrief.caseType}</span>
      </header>

      <p className="incident-anonymization">
        이 시나리오는 실제 원전 사건을 교육 목적에 맞게 재구성했습니다. 발전소명,
        호기, 고유 설비 Tag, 세부 운전값, 개인 식별정보는 익명화·일반화하여
        표시하지 않습니다.
      </p>

      <section className="incident-section">
        <h3>사건 개요</h3>
        <p>{debrief.overview}</p>
      </section>

      <section className="incident-section">
        <h3>근본원인</h3>
        <ul className="incident-list">
          {debrief.rootCauses.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="muted mini-copy">
          “작업자 실수” 하나로 원인을 끝내지 않고 절차·감독·설계·조직조건과
          방어막의 상호작용을 함께 봅니다.
        </p>
      </section>

      <section className="incident-section">
        <h3>기여요인</h3>
        <ul className="incident-list incident-list--factors">
          {debrief.contributingFactors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="incident-section">
        <h3>핵심 교훈 · HU Tool</h3>
        <div className="incident-lessons">
          {debrief.lessons.map((lesson) => {
            const tool = lesson.toolId ? BARRIER_CARDS[lesson.toolId] : null;

            return (
              <article key={`${lesson.title}:${lesson.toolId ?? "lesson"}`}>
                <div>
                  <strong>{lesson.title}</strong>
                  {tool ? <span>{tool.label}</span> : null}
                </div>
                <p>{lesson.detail}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="incident-section">
        <h3>다르게 해보기</h3>
        {replayEnabled && decisions.length > 0 ? (
          <div className="replay-list">
            {decisions.map((decision) => (
              <button
                key={decision.nodeId}
                type="button"
                className="secondary-button replay-button"
                onClick={() => onReplay(decision.nodeId)}
              >
                <span>{decision.prompt}</span>
                <small>이 지점부터 리플레이</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted mini-copy">
            서버 검증이 완료되고 온라인 상태일 때 결정 지점 리플레이를 시작할 수
            있습니다.
          </p>
        )}
      </section>

      <p className="review-note">
        실사건 정보는 개인의 잘잘못을 판정하기 위한 것이 아니라, 같은 조건에서
        방어막을 더 일찍 세울 수 있는 방법을 학습하기 위한 자료입니다.
      </p>

      <div className="ending-actions">
        <Link className="primary-link" to="/">캠페인으로</Link>
      </div>
    </article>
  );
}
