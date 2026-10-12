import { useEffect, useState } from "react";
import { REVIEW_AREAS, type ReviewTarget } from "./scenarioReview";
import { reviewDateInSeoul, validateReviewSubmission } from "./scenarioReviewSubmission";

const LABELS = ["HF 정확성", "운전·정비 맥락", "익명화·정보 노출", "Just Culture", "실사건 회고"];
export function ScenarioReviewForm({ target, verified }: { target: ReviewTarget; verified: boolean }) {
  const [area, setArea] = useState("");
  const [decision, setDecision] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [reviewedAt, setReviewedAt] = useState(reviewDateInSeoul);
  const [evidenceRef, setEvidenceRef] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (!verified) { setConfirmed(false); setMessage(null); } }, [verified]);
  const checked = validateReviewSubmission({ schemaVersion: 1, kind: "human_review_submission", scenarioId: target.scenarioId,
    version: target.version, contentSha256: target.contentSha256,
    reviews: [{ area, decision, contentSha256: target.contentSha256, reviewedBy, reviewedAt, evidenceRef, note }] }, target);
  function changed() { setConfirmed(false); setMessage(null); }
  function download() {
    if (!verified || !confirmed || !checked.submission) return;
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([JSON.stringify(checked.submission, null, 2) + "\n"], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hero-review-${target.scenarioId}-v${target.version}-${area}-${target.contentSha256.slice(0, 12)}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setMessage("검토 결과 파일 다운로드를 요청했습니다. 담당자에게 전달해 기록 반영을 진행해주세요.");
    } catch { setMessage("파일을 만들지 못했습니다. 다시 시도해주세요."); }
    finally { if (url) { const link = url; window.setTimeout(() => URL.revokeObjectURL(link), 1000); } }
  }
  return <section className="scenario-review-form" aria-labelledby="review-form-title">
    <h4 id="review-form-title">검토 결과 작성·다운로드</h4>
    <p className="muted">확인한 내용에 대한 영역별 결과를 작성합니다. 작성 내용은 이 화면에만 유지되고, 다운로드 후 담당자의 기록 반영을 거쳐 진행 상태에 표시됩니다.</p>
    {!verified ? <p className="muted">먼저 검토 대상 내용 일치를 확인해주세요. 재확인 전까지 작성 내용은 유지되고 다운로드는 잠깁니다.</p> : null}
    <fieldset disabled={!verified}>
      <legend className="sr-only">검토 결과 입력</legend>
      <label>검토 영역<select aria-label="검토 영역" value={area} onChange={e => { changed(); setArea(e.target.value); }}><option value="">영역을 선택해주세요</option>{REVIEW_AREAS.map((value, i) => <option key={value} value={value}>{LABELS[i]}</option>)}</select></label>
      <label>검토 판정<select aria-label="검토 판정" value={decision} onChange={e => { changed(); setDecision(e.target.value); }}><option value="">판정을 선택해주세요</option><option value="pass">통과</option><option value="hold">보완 필요</option></select></label>
      <label>검토자 성명 또는 공식 역할<input value={reviewedBy} maxLength={120} autoComplete="off" onChange={e => { changed(); setReviewedBy(e.target.value); }} /></label>
      <label>검토일 (한국 날짜)<input type="date" value={reviewedAt} max={reviewDateInSeoul()} onChange={e => { changed(); setReviewedAt(e.target.value); }} /></label>
      <label>근거 문서·결재·티켓 참조<input value={evidenceRef} maxLength={500} autoComplete="off" onChange={e => { changed(); setEvidenceRef(e.target.value); }} /></label>
      <label>{decision === "hold" ? "보완할 내용 (필수)" : "검토 메모 (선택)"}<textarea value={note} maxLength={2000} onChange={e => { changed(); setNote(e.target.value); }} /></label>
      <p className="muted">근거에는 추적 가능한 참조를 사용하고 비밀번호·API 키·개인 민감정보 원문은 입력하지 마세요.</p>
      {area && decision && checked.error ? <p className="error-text" role="status">{checked.error}</p> : null}
      <label className="review-confirmation"><input type="checkbox" checked={confirmed} disabled={!checked.submission} onChange={e => { setConfirmed(e.target.checked); setMessage(null); }} /><span>이 내용을 직접 검토했고 입력한 판정과 근거를 확인했습니다.</span></label>
      <button type="button" className="primary-button" disabled={!verified || !confirmed || !checked.submission} onClick={download}>검토 결과 JSON 다운로드</button>
    </fieldset>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
