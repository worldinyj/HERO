import { useState } from "react";
import targets from "../admin/scenarioReviewTargets.generated.json";

const source = targets.find(target => target.scenarioId === "s02_equipment_identity" && target.version === 4 && target.approved);
if (!source) throw new Error("exploration_feedback_requires_approved_s02_v4");
const questions = [
  "현장에서 직접 조사한다는 느낌이 들었나요?",
  "발견한 정보 때문에 처음 생각을 바꿨나요?",
  "다른 순서나 방법으로 다시 확인해 보고 싶나요?",
];
export interface ExplorationHistoryItem {
  step: number;
  nodeId: string;
  actionType: "info" | "card" | "choice";
  actionId: string;
  label: string;
  minutes: number;
}

/** Only deliberate file download. No account identifiers, hidden engine values or submission API. */
export function ExplorationFeedback({ notes, history }: {
  notes: Array<{ id: string; text: string }>;
  history: ExplorationHistoryItem[];
}) {
  const [responses, setResponses] = useState(["", "", ""]);
  const [basis, setBasis] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const ready = responses.every(response => response.trim().length > 0);
  function download() {
    if (!ready || !source) return;
    const packet = {
      schemaVersion: 1,
      kind: "exploration_usability_feedback",
      experienceId: "s02_field_exploration",
      experienceVersion: 2,
      scenarioId: source.scenarioId,
      scenarioVersion: source.version,
      sourceContentSha256: source.contentSha256,
      createdAt: new Date().toISOString(),
      scope: "식별·확인 두 판단의 사용성 의견. 콘텐츠 승인·경쟁 플레이 결과가 아님.",
      notes: notes.map(note => ({ id: note.id, text: note.text })),
      actions: history.map(item => ({ step: item.step, nodeId: item.nodeId, actionType: item.actionType, actionId: item.actionId, label: item.label, minutes: item.minutes })),
      judgmentBasis: basis.trim(),
      feedback: questions.map((question, index) => ({ question, response: responses[index]!.trim() })),
    };
    const blob = new Blob([JSON.stringify(packet, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `HERO-S02-exploration-feedback-${packet.createdAt.replace(/[:.]/g, "-")}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(true);
  }
  return <section className="exploration-feedback" aria-labelledby="exploration-feedback-title">
    <h3 id="exploration-feedback-title">체험을 돌아보기</h3>
    <p className="muted">의견은 서버로 전송되지 않습니다. 세 문항을 작성하면 판단 기록과 함께 파일로 내려받아 검토자에게 직접 전달할 수 있습니다. 새로고침하거나 다시 시작하면 입력이 초기화됩니다.</p>
    <label htmlFor="exploration-judgment-basis">어떤 근거와 불확실성으로 판단했나요? (선택)</label>
    <textarea id="exploration-judgment-basis" maxLength={1000} value={basis} onChange={event => { setBasis(event.target.value); setDownloaded(false); }} />
    {questions.map((question, index) => <div className="exploration-feedback-field" key={question}>
      <label htmlFor={`exploration-feedback-${index}`}>{question}</label>
      <textarea id={`exploration-feedback-${index}`} maxLength={1000} value={responses[index]} onChange={event => { setResponses(current => current.map((value, at) => at === index ? event.target.value : value)); setDownloaded(false); }} />
    </div>)}
    <details><summary>내려받는 파일에 포함되는 내용</summary><p>S02 v4의 검토 대상 식별 정보, 확인한 단서, 확인·방벽·판단 행동과 시간 비용, 입력한 판단 근거와 체험 의견이 포함됩니다. 계정·이름·사업소·HP·위험 수치는 자동으로 포함하지 않습니다. 이 파일은 콘텐츠 승인 기록과 별도입니다.</p></details>
    <button type="button" className="secondary-button" disabled={!ready} onClick={download}>체험 의견과 판단 기록 내려받기</button>
    {!ready ? <p className="muted mini-copy">세 문항에 의견을 작성해주세요.</p> : null}
    {downloaded ? <p role="status">다운로드를 요청했습니다. 받은 파일은 직접 공유해주세요.</p> : null}
  </section>;
}
