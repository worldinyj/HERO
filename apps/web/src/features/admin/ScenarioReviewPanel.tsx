import { useEffect, useRef, useState } from "react";
import type { Scenario } from "@hero/schema";
import { ScenarioReviewForm } from "./ScenarioReviewForm";
import generated from "./scenarioReviewStatus.generated.json";
import { matchesReviewTarget, type ReviewArea, type ReviewTarget } from "./scenarioReview";
import { readSavedPreview } from "./scenarioPreviewValidation";
import { STATUS_LABEL, type ScenarioStatus } from "./scenarioStatus";

const target = generated as ReviewTarget;
const DETAILS: Record<ReviewArea, { title: string; description: string }> = {
  hf_accuracy: { title: "HF 정확성", description: "직접·근본·기여 원인과 방벽·재발방지대책의 연결, HU Tool 적용 맥락을 확인합니다." },
  operations_context: { title: "운전·정비 맥락", description: "작업 필요성·절차·현장 조건과 공식 사건 사실이 일치하는지 확인합니다." },
  anonymization: { title: "익명화·정보 노출", description: "인물·발전소·설비를 역추적하거나 실제 운전 설정·복구 절차를 드러내는 내용이 없는지 확인합니다." },
  just_culture: { title: "Just Culture", description: "특정 개인을 비난하지 않고 조직 조건과 방벽을 다루며, 안전 정지를 실패로 묘사하지 않는지 확인합니다." },
  incident_debrief: { title: "실사건 회고", description: "공식 사실과 HERO 교육적 해석이 구분되고 인과사슬·방벽·관련 대책이 근거와 맞는지 확인합니다." },
};
const DECISION = { pending: "검토 대기", pass: "검토 통과", hold: "보완 필요" };
type Version = { id: string; version: number; status: ScenarioStatus; slug: string; title: string };

export function ScenarioReviewPanel({ versions, editor, readVersion, onPreview }: {
  versions: Version[];
  editor: Scenario | null;
  readVersion: (id: string) => Promise<unknown>;
  onPreview: (scenario: Scenario, trigger: HTMLButtonElement) => void;
}) {
  const candidates = versions.filter(version => version.slug === target.scenarioId);
  const [selected, setSelected] = useState("");
  const [checked, setChecked] = useState<Scenario | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    revision.current += 1;
    setChecked(null); setMessage(null); setBusy(false);
    return () => { revision.current += 1; };
  }, [versions, editor, selected]);

  async function check(fromEditor: boolean) {
    const ticket = ++revision.current;
    setBusy(true); setChecked(null); setMessage(null);
    try {
      const row = candidates.find(version => version.id === selected);
      const scenario = fromEditor ? editor : row
        ? readSavedPreview(await readVersion(row.id), row.id, row.version).scenario : null;
      if (ticket !== revision.current) return;
      if (!scenario) throw new Error("review_unavailable");
      const match = await matchesReviewTarget(scenario, target);
      if (ticket !== revision.current) return;
      if (!match) { setMessage("선택한 내용은 현재 S03 검토 대상과 다릅니다. 버전 번호가 같아도 내용이 변경됐다면 별도 검토가 필요합니다."); return; }
      setChecked(scenario);
    } catch {
      if (ticket === revision.current) setMessage("검토 대상 내용을 확인하지 못했습니다. 다시 시도해주세요.");
    } finally {
      if (ticket === revision.current) setBusy(false);
    }
  }

  const passed = target.areas.filter(area => area.decision === "pass").length;
  return <section className="panel admin-section scenario-review-panel" aria-labelledby="scenario-review-title">
    <p className="eyebrow">Content review</p>
    <h3 id="scenario-review-title">S03 검토 및 승인 진행</h3>
    <p><strong>{target.title} · v{target.version}</strong></p>
    <p className="muted">현재 배포본에 반영된 검토 기록입니다. 모든 필수 영역은 같은 내용에 대한 사람 검토가 필요합니다.</p>
    <div className="scenario-review-summary">
      <span>출처·권리: {target.sourceRightsComplete ? "확인 완료" : "확인 필요"}</span>
      <strong>필수 검토 {passed}/5 통과</strong>
      <span>최종 콘텐츠 승인: {target.approved ? "기록 확인" : "대기"}</span>
    </div>
    <ol className="scenario-review-areas">
      {target.areas.map(item => <li key={item.area}>
        <div><strong>{DETAILS[item.area].title}</strong><span className="count-badge">{DECISION[item.decision]}</span></div>
        <p className="muted">{DETAILS[item.area].description}</p>
      </li>)}
    </ol>
    <h4>검토할 내용 확인</h4>
    <p className="muted">저장된 버전이나 입력한 JSON이 이 검토 대상과 일치하는지 확인한 뒤 검토용 미리보기를 열 수 있습니다.</p>
    {candidates.length ? <label>저장된 S03 버전
      <select aria-label="저장된 S03 버전" value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">버전을 선택해주세요</option>
        {candidates.map(row => <option key={row.id} value={row.id}>v{row.version} · {STATUS_LABEL[row.status]}</option>)}
      </select>
    </label> : <p className="muted">저장된 S03 버전이 없습니다. 아래 편집기에 검토할 JSON을 입력하면 내용을 확인할 수 있습니다.</p>}
    <div className="scenario-status-actions">
      <button type="button" className="secondary-button" disabled={busy || !selected || !candidates.some(row => row.id === selected)} onClick={() => void check(false)}>저장된 검토 대상 확인</button>
      <button type="button" className="secondary-button" disabled={busy || editor?.id !== target.scenarioId} onClick={() => void check(true)}>입력한 S03 내용 확인</button>
    </div>
    {busy ? <p role="status">검토 대상과 내용이 일치하는지 확인하고 있습니다…</p> : null}
    {message ? <p className="error-text" role="alert">{message}</p> : null}
    {checked ? <div className="validation-box"><p role="status">S03 v{target.version} 검토 대상과 내용이 일치합니다.</p><button type="button" className="secondary-button" onClick={event => onPreview(checked, event.currentTarget)}>S03 검토용 미리보기 열기</button></div> : null}
    <details><summary>검토 대상 식별 정보</summary><p className="muted">검토 기록을 남길 때 아래 파일 SHA-256을 사용합니다.</p><code className="scenario-review-hash">{target.contentSha256}</code></details>
    <ScenarioReviewForm target={target} verified={Boolean(checked)} />
    <h4>검토 결과 반영 순서</h4>
    <p className="muted">검토자는 영역별 통과·보완 판정과 검토자·검토일·근거 문서를 확정합니다. 담당자가 해당 내용의 검토 기록을 등록하고 배포에 반영하면 진행 상태가 갱신됩니다.</p>
    <p className="review-note">버전 상태 변경과 시즌 배정은 별도 절차입니다. 이 화면의 내용 일치 확인이나 미리보기는 최종 콘텐츠 승인으로 기록되지 않습니다.</p>
  </section>;
}
