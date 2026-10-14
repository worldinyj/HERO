import { useState } from "react";
import type { Scenario } from "@hero/schema";
import target from "./htoReviewTarget.generated.json";
import { reviewDateInSeoul } from "./scenarioReviewSubmission";
import { S02_HTO_INPUT_SHA256 } from "./s02HtoReview";

/** Separate local feedback artifact; never a human_review_submission or approval. */
export function HtoDraftFeedback({ scenario }: { scenario: Scenario }) {
  const [verdict, setVerdict] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const matchingTarget = target.scenarioId === scenario.id && target.version === scenario.version
    && target.previewSha256 === S02_HTO_INPUT_SHA256;
  const valid = ["usable", "needs_revision"].includes(verdict) && reviewer.trim().length > 0
    && reviewer.length <= 120 && note.trim().length > 0 && note.length <= 2000;
  function changed() { setConfirmed(false); setMessage(null); }
  function download() {
    if (!matchingTarget || !valid || !confirmed) return;
    let url: string | null = null;
    try {
      const packet = { schemaVersion: 1, kind: "hto_draft_feedback", ...target,
        reviewedBy: reviewer.trim(), reviewedAt: reviewDateInSeoul(), verdict, note: note.trim() };
      url = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2) + "\n"], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `hero-hto-feedback-${target.scenarioId}-v${target.version}-${target.artifactSha256.slice(0, 12)}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setMessage("HTO 시안 의견 파일 다운로드를 요청했습니다. 시나리오 본문 검토 결과와 별도로 보관해주세요.");
    } catch { setMessage("파일을 만들지 못했습니다. 다시 시도해주세요."); }
    finally { if (url) { const link = url; window.setTimeout(() => URL.revokeObjectURL(link), 1000); } }
  }
  if (!matchingTarget) return <p className="notice">HTO 의견 기록 대상이 현재 미리보기와 일치하지 않습니다. 담당자 확인이 필요합니다.</p>;
  return <section className="scenario-review-form hto-feedback-form" aria-labelledby="hto-feedback-title">
    <h4 id="hto-feedback-title">HTO 시안 의견 작성</h4>
    <p className="muted">HTO 설명·회고 질문·조건 비교 연습에 대한 의견입니다. S02 v4 본문 승인과 구분하며, 이 파일은 승인 기록으로 가져올 수 없습니다. 입력은 저장되지 않습니다.</p>
    <fieldset><legend className="sr-only">HTO 시안 의견 입력</legend>
    <label>HTO 시안 의견 판정<select aria-label="HTO 시안 의견 판정" value={verdict} onChange={event => { changed(); setVerdict(event.target.value); }}><option value="">판정을 선택해주세요</option><option value="usable">학습용 시안으로 적절</option><option value="needs_revision">보완 필요</option></select></label>
    <label>HTO 의견 작성자<input value={reviewer} maxLength={120} autoComplete="off" onChange={event => { changed(); setReviewer(event.target.value); }} /></label>
    <div><label htmlFor="hto-feedback-note">HTO 검토 의견 (필수)</label>
    <textarea id="hto-feedback-note" value={note} maxLength={2000} onChange={event => { changed(); setNote(event.target.value); }} /></div>
    <label className="review-confirmation"><input type="checkbox" disabled={!valid} checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setMessage(null); }} /><span>HTO 시안과 조건 비교를 직접 살펴보고 이 의견을 확인했습니다.</span></label>
    <button type="button" className="secondary-button" disabled={!valid || !confirmed} onClick={download}>HTO 시안 의견 JSON 다운로드</button>
    </fieldset>
    <details><summary>HTO 의견 대상 식별 정보</summary><p className="mini-copy">S02 본문 SHA</p><code className="scenario-review-hash">{target.contentSha256}</code><p className="mini-copy">별도 HTO 시안 SHA</p><code className="scenario-review-hash">{target.artifactSha256}</code></details>
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
