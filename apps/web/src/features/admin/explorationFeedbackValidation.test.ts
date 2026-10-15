import { describe, expect, it } from "vitest";
import { parseExplorationFeedback } from "./explorationFeedbackValidation";
import { EXPLORATION_QUESTIONS } from "../exploration/feedbackContract";
import targets from "./scenarioReviewTargets.generated.json";

export function feedbackFixture() {
  return {
    schemaVersion: 1, kind: "exploration_usability_feedback", experienceId: "s02_field_exploration", experienceVersion: 2,
    scenarioId: "s02_equipment_identity", scenarioVersion: 4, sourceContentSha256: targets.find(target => target.scenarioId === "s02_equipment_identity")!.contentSha256,
    createdAt: "2026-10-15T01:00:00.000Z", scope: "의견 검토 테스트", notes: [],
    actions: [
      { step: 1, nodeId: "decision_identify", actionType: "choice", actionId: "compare_work_document", label: "작업 문서와 현장 상태를 한 항목씩 대조한다.", minutes: 3 },
      { step: 3, nodeId: "decision_verify", actionType: "choice", actionId: "request_independent_check", label: "다른 근거와 사람을 이용해 독립확인을 요청한다.", minutes: 4 },
    ],
    judgmentBasis: "상태가 불확실해 추가 확인 요청", feedback: EXPLORATION_QUESTIONS.map(question => ({ question: String(question), response: "검증용 의견" })),
  };
}

describe("exploration feedback review integrity", () => {
  it("replays a complete two-decision record without inventing information checks", () => {
    const result = parseExplorationFeedback(JSON.stringify(feedbackFixture()));
    expect(result.error).toBeNull(); expect(result.packet?.notes).toEqual([]);
  });
  it.each([
    ["wrong source", (packet: ReturnType<typeof feedbackFixture>) => { packet.sourceContentSha256 = "0".repeat(64); }],
    ["changed time", (packet: ReturnType<typeof feedbackFixture>) => { packet.actions[0]!.minutes = 0; }],
    ["reversed actions", (packet: ReturnType<typeof feedbackFixture>) => { packet.actions.reverse(); }],
    ["incomplete experience", (packet: ReturnType<typeof feedbackFixture>) => { packet.actions.pop(); }],
    ["extra action after completion", (packet: ReturnType<typeof feedbackFixture>) => { packet.actions.push({ ...packet.actions[1]! }); }],
    ["changed action label", (packet: ReturnType<typeof feedbackFixture>) => { packet.actions[0]!.label = "안전하게 확인 완료"; }],
    ["invented note", (packet: ReturnType<typeof feedbackFixture>) => { (packet.notes as unknown[]).push({ id: "decision_identify:observe_status_layout", text: "확인 완료" }); }],
    ["changed question", (packet: ReturnType<typeof feedbackFixture>) => { packet.feedback[0]!.question = "콘텐츠 승인합니까?"; }],
    ["blank opinion", (packet: ReturnType<typeof feedbackFixture>) => { packet.feedback[1]!.response = " "; }],
    ["invalid date", (packet: ReturnType<typeof feedbackFixture>) => { packet.createdAt = "2026-02-31T01:00:00.000Z"; }],
  ])("rejects %s", (_, mutate) => { const packet = feedbackFixture(); mutate(packet); expect(parseExplorationFeedback(JSON.stringify(packet)).packet).toBeNull(); });
  it("rejects approval packets, hidden engine values and oversized files", () => {
    expect(parseExplorationFeedback(JSON.stringify({ ...feedbackFixture(), kind: "human_review_submission" })).packet).toBeNull();
    expect(parseExplorationFeedback(JSON.stringify({ ...feedbackFixture(), hp: 200 })).packet).toBeNull();
    expect(parseExplorationFeedback(" ".repeat(65537)).error).toContain("64KB");
  });
});
