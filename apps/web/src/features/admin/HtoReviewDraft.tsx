import type { Scenario } from "@hero/schema";
import { useEffect, useState } from "react";
import { HTO_CONNECTIONS, matchesS02HtoInput } from "./s02HtoReview";
import { HtoConditionComparison } from "./HtoConditionComparison";
import { HtoDraftFeedback } from "./HtoDraftFeedback";

/** Admin-only teaching proposal. No persistence, submissions or score changes. */
export function HtoReviewDraft({ scenario }: { scenario: Scenario }) {
  const [match, setMatch] = useState<boolean | null>(null);
  const [connection, setConnection] = useState(0);
  useEffect(() => {
    let active = true;
    setMatch(null);
    setConnection(0);
    void matchesS02HtoInput(scenario).then(value => {
      if (active) setMatch(value);
    }).catch(() => { if (active) setMatch(false); });
    return () => { active = false; };
  }, [scenario]);

  if (scenario.id !== "s02_equipment_identity" || scenario.version !== 4) return null;
  if (match === null) return <p className="muted mini-copy" role="status">HTO 회고 시안의 대상 내용을 확인하고 있습니다…</p>;
  if (!match) return <p className="notice">이 내용에는 S02 v4 HTO 시안을 연결할 수 없습니다. 시안의 대상 콘텐츠와 일치하지 않거나 확인에 실패했습니다.</p>;

  const current = HTO_CONNECTIONS[connection] ?? HTO_CONNECTIONS[0];
  return (
    <details className="review-card hto-review-draft">
      <summary>HTO 회고 시안 · 사람·기술·조직 함께 보기</summary>
      <p className="notice">관리자 검토용 시안입니다. S02 v4 본문과 별도로 작성했으며 콘텐츠 승인·게시를 의미하지 않습니다. 입력은 저장되지 않고 HP·순위에 반영되지 않습니다.</p>
      <h4>어떤 조건이 서로 영향을 주었나요?</h4>
      <p>사람의 판단, 기술의 표시·설계, 조직의 지원을 연결해 봅니다. 같은 조건에서 방벽이 작동하도록 만든 점과 개선할 점을 함께 살펴보세요.</p>
      <div className="hto-factor-grid">
        <section><h5>사람 H</h5><p>공식 기록: 조작부 식별 오인</p><p>회고: 당시 무엇을 보고 어떤 기능이라고 이해했을까요?</p></section>
        <section><h5>기술 T</h5><p>공식 기록: 패널 정보 부족과 잘못된 회로 구성</p><p>회고: 표시·배치·회로 기능이 올바른 확인을 도왔을까요?</p></section>
        <section><h5>조직 O</h5><p>공식 기록: 도면 개정 오류와 공급사의 미검출</p><p>회고: 변경·검증·공급자 관리에서 어떤 방벽을 강화할 수 있을까요?</p></section>
      </div>
      <div className="hto-connections" role="group" aria-label="HTO 상호작용 살펴보기">
        {HTO_CONNECTIONS.map((item, index) => <button key={item.id} type="button" className="secondary-button" aria-pressed={connection === index} onClick={() => setConnection(index)}>{item.title}</button>)}
      </div>
      <section className="hto-connection" aria-live="polite" aria-atomic="true">
        <h5>{current.title}</h5><p>{current.text}</p><p><strong>함께 강화할 방벽</strong><br />{current.barrier}</p>
      </section>
      <fieldset className="hto-questions">
        <legend>다음에는 무엇을 바꿀 수 있을까요?</legend>
        {[
          ["human", "개인·팀의 행동", "어떤 근거를 더 확인하고 누구와 공유할 수 있을까요?"],
          ["technology", "표시·설계·기술", "어떤 표시나 확인 기능이 혼동을 줄일 수 있을까요?"],
          ["organization", "조직의 지원", "확인 시간·절차·검증 역할에서 무엇을 지원해야 할까요?"],
        ].map(([id, label, prompt]) => <label key={id}><strong>{label}</strong><span>{prompt}</span><textarea rows={2} maxLength={1000} aria-label={`HTO 회고 · ${label}`} placeholder="생각을 적어보세요. 입력은 저장되지 않습니다." /></label>)}
      </fieldset>
      <HtoConditionComparison />
      <HtoDraftFeedback scenario={scenario} />
      <p className="muted mini-copy">HTO 분류와 연결은 HERO의 교육용 해석입니다. IAEA의 인증·공식 사건분류 또는 개인·사업소 안전문화 평가를 의미하지 않습니다.</p>
      <p className="mini-copy"><a href="https://www-pub.iaea.org/MTCD/Publications/PDF/TE-1846web.pdf" target="_blank" rel="noopener noreferrer">개념 근거: IAEA-TECDOC-1846 §2.6</a> · 사건 사실은 S02 공식 출처를 참조합니다.</p>
    </details>
  );
}
