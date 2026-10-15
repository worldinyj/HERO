export const EXPLORATION_QUESTIONS = [
  "현장에서 직접 조사한다는 느낌이 들었나요?",
  "발견한 정보 때문에 처음 생각을 바꿨나요?",
  "다른 순서나 방법으로 다시 확인해 보고 싶나요?",
] as const;
export const EXPLORATION_CARD_LABELS: Record<string, string> = {
  self_check_star: "멈추고 자기확인하기 · STAR",
  independent_verification: "별도 근거로 독립확인 요청하기",
  stop_when_unsure: "작업 중지 후 확인 요청하기",
};
export interface ExplorationHistoryItem {
  step: number;
  nodeId: string;
  actionType: "info" | "card" | "choice";
  actionId: string;
  label: string;
  minutes: number;
}
export interface ExplorationFeedbackPacket {
  schemaVersion: 1; kind: "exploration_usability_feedback";
  experienceId: "s02_field_exploration"; experienceVersion: 2;
  scenarioId: "s02_equipment_identity"; scenarioVersion: 4;
  sourceContentSha256: string; createdAt: string; scope: string;
  notes: Array<{ id: string; text: string }>;
  actions: ExplorationHistoryItem[];
  judgmentBasis: string;
  feedback: Array<{ question: string; response: string }>;
}
