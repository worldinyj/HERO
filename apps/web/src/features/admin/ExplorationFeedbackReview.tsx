import { useEffect, useRef, useState } from "react";
import { MAX_EXPLORATION_FEEDBACK_BYTES, parseExplorationFeedback } from "./explorationFeedbackValidation";
import type { ExplorationFeedbackPacket } from "../exploration/feedbackContract";

/** Local file review only. No API, approval mutation or storage. */
export function ExplorationFeedbackReview() {
  const [packet, setPacket] = useState<ExplorationFeedbackPacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const revision = useRef(0);
  useEffect(() => () => { revision.current += 1; }, []);
  function clear() { revision.current += 1; setPacket(null); setError(null); setReading(false); }
  async function read(file?: File) {
    clear(); if (!file) return;
    if (file.size > MAX_EXPLORATION_FEEDBACK_BYTES) { setError("64KB 이하의 체험 의견 JSON 파일을 선택해주세요."); return; }
    const current = revision.current; setReading(true);
    try { const result = parseExplorationFeedback(await file.text()); if (revision.current !== current) return; setPacket(result.packet); setError(result.error); }
    catch { if (revision.current === current) setError("파일을 읽지 못했습니다. 다시 선택해주세요."); }
    finally { if (revision.current === current) setReading(false); }
  }
  return <section className="review-card" aria-labelledby="exploration-file-review-title">
    <h3 id="exploration-file-review-title">체험 의견 파일 검토</h3>
    <p>참여자가 전달한 의견 JSON 파일을 이 기기에서 읽습니다. 서버에 업로드하거나 승인·학습기록으로 반영하지 않습니다.</p>
    <label htmlFor="exploration-review-file">체험 의견 JSON 파일 선택</label>
    <input id="exploration-review-file" type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void read(file); }} />
    <button type="button" className="text-button" onClick={clear}>검토 파일 닫기</button>
    {reading ? <p role="status">파일과 행동 기록을 확인하고 있습니다…</p> : null}
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {packet ? <div className="exploration-file-result">
      <p className="notice">S02 v4 대상·파일 구조·행동 순서·시간 비용 일치 확인. 파일은 작성자의 자체 기록이며 실제 참여 여부나 의견의 진위를 인증한 결과는 아닙니다.</p>
      <p>탐색형 체험 v{packet.experienceVersion} · 작성 {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }).format(new Date(packet.createdAt))} (한국 시간)</p>
      <h4>확인한 단서</h4>{packet.notes.length ? <ul>{packet.notes.map(note => <li key={note.id}>{note.text}</li>)}</ul> : <p>추가 정보 확인으로 확보한 단서 없음</p>}
      <h4>확인·방벽·판단 순서</h4><ol>{packet.actions.map(row => <li key={row.step}>{row.label} · {row.minutes}분</li>)}</ol>
      <h4>판단 근거와 남은 불확실성</h4><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{packet.judgmentBasis || "작성하지 않음"}</p>
      {packet.feedback.map(row => <div key={row.question}><h4>{row.question}</h4><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.response}</p></div>)}
      <details><summary>검토 대상 식별 정보</summary><p style={{ overflowWrap: "anywhere" }}>S02 v4 · {packet.sourceContentSha256}</p></details>
    </div> : null}
  </section>;
}
