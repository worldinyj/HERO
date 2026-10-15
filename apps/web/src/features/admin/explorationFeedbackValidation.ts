import { act, createGame, type GameAction } from "@hero/engine";
import { ScenarioSchema } from "@hero/schema";
import raw from "../../../../../scenarios/data/S02_equipment_identity_v1.json" with { type: "json" };
import targets from "./scenarioReviewTargets.generated.json" with { type: "json" };
import { EXPLORATION_CARD_LABELS, EXPLORATION_QUESTIONS, type ExplorationFeedbackPacket } from "../exploration/feedbackContract";
export const MAX_EXPLORATION_FEEDBACK_BYTES = 64 * 1024;
const scenario = ScenarioSchema.parse(raw);
const source = targets.find(target => target.scenarioId === scenario.id && target.version === 4 && target.approved);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("파일 구조가 올바르지 않습니다.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).sort().join("|") !== expected.sort().join("|")) throw new Error("지원하지 않는 항목이 포함된 파일입니다.");
}
function text(value: unknown, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("의견 또는 텍스트 항목이 올바르지 않습니다.");
  return value;
}
export function parseExplorationFeedback(input: string): { packet: ExplorationFeedbackPacket | null; error: string | null } {
  try {
    if (new TextEncoder().encode(input).length > MAX_EXPLORATION_FEEDBACK_BYTES) throw new Error("64KB 이하의 체험 의견 JSON 파일을 선택해주세요.");
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { throw new Error("JSON 파일을 읽을 수 없습니다."); }
    const packet = object(parsed);
    keys(packet, ["schemaVersion", "kind", "experienceId", "experienceVersion", "scenarioId", "scenarioVersion", "sourceContentSha256", "createdAt", "scope", "notes", "actions", "judgmentBasis", "feedback"]);
    if (packet.kind !== "exploration_usability_feedback" || packet.schemaVersion !== 1 || packet.experienceId !== "s02_field_exploration" || packet.experienceVersion !== 2) throw new Error("탐색형 체험 버전 2의 의견 파일만 열 수 있습니다. 콘텐츠 승인 파일과 구분해주세요.");
    if (!source || scenario.version !== 4 || packet.scenarioId !== scenario.id || packet.scenarioVersion !== 4 || packet.sourceContentSha256 !== source.contentSha256) throw new Error("현재 승인된 S02 v4 검토 대상과 일치하지 않습니다.");
    const date = text(packet.createdAt, 40);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString() !== date) throw new Error("작성 시각이 올바르지 않습니다.");
    text(packet.scope, 200); text(packet.judgmentBasis, 1000, false);
    if (!Array.isArray(packet.feedback) || packet.feedback.length !== 3) throw new Error("세 문항의 체험 의견이 필요합니다.");
    packet.feedback.forEach((item, index) => { const feedback = object(item); keys(feedback, ["question", "response"]); if (feedback.question !== EXPLORATION_QUESTIONS[index]) throw new Error("체험 의견 문항이 일치하지 않습니다."); text(feedback.response, 1000); });
    if (!Array.isArray(packet.actions) || packet.actions.length < 2 || packet.actions.length > 7) throw new Error("완료된 두 판단의 행동 기록이 필요합니다.");
    let game = createGame(scenario, { simulationSeed: "s02-exploration-v4", presentationSeed: "s02-exploration-v4" });
    let completed = false;
    for (const item of packet.actions) {
      const row = object(item); keys(row, ["step", "nodeId", "actionType", "actionId", "label", "minutes"]);
      if (completed) throw new Error("두 번째 판단 뒤에 추가된 행동은 지원하지 않습니다.");
      while (scenario.nodes[game.nodeId]?.type === "scene") game = act(scenario, game, { type: "continue" });
      const node = scenario.nodes[game.nodeId];
      if (node?.type !== "decision" || row.nodeId !== game.nodeId || !["decision_identify", "decision_verify"].includes(game.nodeId)) throw new Error("행동 순서 또는 판단 단계가 일치하지 않습니다.");
      const id = text(row.actionId, 100);
      let action: GameAction; let label: string | undefined;
      if (row.actionType === "info") { action = { type: "info", actionId: id }; label = node.infoActions.find(info => info.actionId === id)?.label; }
      else if (row.actionType === "choice") { action = { type: "choice", actionId: id }; label = node.choices.find(choice => choice.actionId === id)?.label; }
      else if (row.actionType === "card" && node.allowedCards?.includes(id)) { action = { type: "card", cardId: id }; label = EXPLORATION_CARD_LABELS[id]; }
      else throw new Error("지원하지 않는 행동이 포함되어 있습니다.");
      if (!label || row.label !== label) throw new Error("행동 설명이 S02 v4와 일치하지 않습니다.");
      const next = act(scenario, game, action);
      const recorded = next.log[game.log.length];
      if (!recorded || row.step !== recorded.step || row.minutes !== recorded.clockAfter - recorded.clockBefore) throw new Error("행동의 순서 번호 또는 시간 비용이 일치하지 않습니다.");
      if (row.actionType === "choice" && game.nodeId === "decision_verify") completed = true;
      game = next;
    }
    if (!completed) throw new Error("두 판단을 완료한 체험 의견 파일이 아닙니다.");
    const expectedNotes = game.log.flatMap(entry => { const node = scenario.nodes[entry.nodeId]; const info = node?.type === "decision" && entry.actionType === "info" ? node.infoActions.find(info => info.actionId === entry.actionId) : null; return info ? [{ id: `${entry.nodeId}:${info.actionId}`, text: info.revealText }] : []; });
    if (!Array.isArray(packet.notes) || packet.notes.length !== expectedNotes.length) throw new Error("확인 단서가 행동 기록과 일치하지 않습니다.");
    packet.notes.forEach((item, index) => { const note = object(item); keys(note, ["id", "text"]); if (note.id !== expectedNotes[index]?.id || note.text !== expectedNotes[index]?.text) throw new Error("확인 단서가 S02 v4와 일치하지 않습니다."); });
    return { packet: packet as unknown as ExplorationFeedbackPacket, error: null };
  } catch (error) { return { packet: null, error: error instanceof Error ? error.message : "체험 의견 파일을 확인할 수 없습니다." }; }
}
