import { useState } from "react";
import { describeHtoConditions, HTO_CHOICES, type HtoChoice, type HtoConditions } from "./htoComparisonModel";

const BASELINE: HtoConditions = { clearIdentification: false, verificationSupport: false };

export function HtoConditionComparison() {
  const [conditions, setConditions] = useState<HtoConditions>({ ...BASELINE });
  const [choice, setChoice] = useState<HtoChoice | null>(null);
  const [compared, setCompared] = useState(false);

  function changeCondition(key: keyof HtoConditions, value: boolean) {
    setConditions(current => ({ ...current, [key]: value }));
    setCompared(false);
  }

  const baseline = choice ? describeHtoConditions(BASELINE, choice) : null;
  const variant = choice ? describeHtoConditions(conditions, choice) : null;
  const changed = conditions.clearIdentification || conditions.verificationSupport;

  return (
    <section className="hto-comparison" aria-label="HTO 조건 비교 연습">
      <h4>같은 판단, 다른 조건으로 살펴보기</h4>
      <p>비슷한 표시와 조작 요소가 있는 작업 위치에서 문서와 현장 모습의 차이를 발견했습니다. 아직 조작하지 않았습니다. 무엇을 하겠습니까?</p>
      <p className="notice">교육용 가상 판단 연습입니다. 아래 조건은 실제 사건의 재현이 아닌 비교를 위한 가정이며, 해설은 정성적 학습 안내입니다. 선택은 저장되지 않고 HP·순위에 반영되지 않습니다.</p>
      <fieldset className="hto-condition-controls">
        <legend>1. 비교할 조건 선택</legend>
        <label><input type="checkbox" checked={conditions.clearIdentification} onChange={event => changeCondition("clearIdentification", event.target.checked)} />기술 조건: 대상과 조작 기능을 구분하는 표시 제공</label>
        <label><input type="checkbox" checked={conditions.verificationSupport} onChange={event => changeCondition("verificationSupport", event.target.checked)} />조직 조건: 확인 시간과 별도 검증 지원 제공</label>
        <p className="muted mini-copy">표시·지원이 부족한 기준 조건과 비교합니다. 회로·도면 상태와 선택할 행동은 동일하게 유지합니다.</p>
      </fieldset>
      <fieldset className="hto-condition-controls">
        <legend>2. 두 조건에서 유지할 판단 선택</legend>
        {HTO_CHOICES.map(item => <label key={item.id}><input type="radio" name="hto-comparison-choice" checked={choice === item.id} onChange={() => { setChoice(item.id); setCompared(false); }} />{item.label}</label>)}
      </fieldset>
      <div className="hto-comparison-actions">
        <button type="button" className="primary-button" disabled={!choice || !changed} onClick={() => setCompared(true)}>같은 판단으로 조건 비교</button>
        <button type="button" className="secondary-button" onClick={() => { setConditions({ ...BASELINE }); setChoice(null); setCompared(false); }}>조건 비교 초기화</button>
      </div>
      {!changed ? <p className="muted mini-copy">기술 또는 조직 조건을 하나 이상 선택하면 비교할 수 있습니다.</p> : null}
      {compared && baseline && variant ? (
        <div className="hto-comparison-result" role="region" aria-label="HTO 조건 비교 해설" aria-live="polite">
          <p><strong>두 조건에서 같은 판단:</strong> {HTO_CHOICES.find(item => item.id === choice)?.label}</p>
          <div className="hto-comparison-grid">
            {[{ title: "기준 조건 · 표시·지원 부족 가정", result: baseline }, { title: "선택한 조건 · 개선 가정", result: variant }].map(item => <article key={item.title}>
              <h5>{item.title}</h5>
              <h6>기술이 사람의 확인에 주는 영향</h6><p>{item.result.identification}</p>
              <h6>조직이 팀의 확인에 주는 영향</h6><p>{item.result.support}</p>
              <h6>같은 판단을 이 조건에서 돌아보기</h6><p>{item.result.action}</p>
            </article>)}
          </div>
          <p className="notice">{variant.uncertainty}</p>
          <p className="muted">어떤 조건이 내 판단을 실행하기 쉽게 했나요? 개인에게 더 주의를 요구하는 것 외에 기술과 조직이 함께 마련해야 할 방벽은 무엇인가요?</p>
        </div>
      ) : null}
    </section>
  );
}
