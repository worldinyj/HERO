import type { Scenario } from "@hero/schema";

export type DiffKind = "added" | "removed" | "changed";
export interface ScenarioDifference {
  path: string[];
  kind: DiffKind;
  before: unknown;
  after: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function actionMap(value: unknown[]): Map<string, unknown> | null {
  const result = new Map<string, unknown>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.actionId !== "string" || result.has(entry.actionId)) return null;
    result.set(entry.actionId, entry);
  }
  return result;
}

/** Compare validated snapshots. Object insertion order is not a content change. */
export function diffScenarios(before: Scenario, after: Scenario): ScenarioDifference[] {
  if (before.id !== after.id) throw new Error("different_scenarios");
  const differences: ScenarioDifference[] = [];
  function visit(left: unknown, right: unknown, path: string[]) {
    if (left === right) return;
    if (left === undefined || right === undefined) {
      differences.push({ path, kind: left === undefined ? "added" : "removed", before: left, after: right });
      return;
    }
    if (isRecord(left) && isRecord(right)) {
      for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        if (path.length === 0 && key === "version") continue;
        visit(Object.hasOwn(left, key) ? left[key] : undefined, Object.hasOwn(right, key) ? right[key] : undefined, [...path, key]);
      }
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      // Actions retain their identity when authors insert or reorder choices.
      const actions = path.length === 3 && path[0] === "nodes" && ["choices", "infoActions"].includes(path[2]!);
      const leftMap = actions ? actionMap(left) : null;
      const rightMap = actions ? actionMap(right) : null;
      if (leftMap && rightMap) {
        const leftOrder = [...leftMap.keys()];
        const rightOrder = [...rightMap.keys()];
        if (JSON.stringify(leftOrder) !== JSON.stringify(rightOrder)) {
          differences.push({ path: [...path, "$order"], kind: "changed", before: leftOrder, after: rightOrder });
        }
        for (const id of [...new Set([...leftMap.keys(), ...rightMap.keys()])].sort()) visit(leftMap.get(id), rightMap.get(id), [...path, id]);
      } else {
        for (let index = 0; index < Math.max(left.length, right.length); index += 1) visit(left[index], right[index], [...path, String(index)]);
      }
      return;
    }
    differences.push({ path, kind: "changed", before: left, after: right });
  }
  visit(before, after, []);
  return differences;
}

export const DIFF_GROUPS = ["기본 설정", "초기 상태", "장면·선택지", "실사건 회고"] as const;
export function diffGroup(path: string[]): typeof DIFF_GROUPS[number] {
  return path[0] === "nodes" ? "장면·선택지" : path[0] === "initialState" ? "초기 상태" : path[0] === "incidentDebrief" ? "실사건 회고" : "기본 설정";
}

/** JSON Pointer escaping preserves node IDs containing dots, slashes or tildes. */
export function diffPath(path: string[]): string {
  return "/" + path.map(part => part.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");
}

export function diffLabel(path: string[]): string {
  const fields: Record<string, string> = {
    title: "제목", text: "장면 문구", speaker: "발화자", prompt: "선택 질문", label: "행동 문구",
    next: "다음 장면", passNext: "통과 후 장면", breachNext: "위험 발생 후 장면", startNode: "시작 장면",
    timeCostMin: "소요 시간(분)", revealText: "확인 정보", threshold: "위험 판정 기준", jitter: "위험 변동 폭",
    clockMin: "시작 시각(분)", deadlineMin: "마감 시각(분)", baseHazard: "초기 위험", estimatedMinutes: "예상 플레이 시간(분)",
    type: "장면 유형", ending: "엔딩 유형", summary: "엔딩 요약", background: "배경", audioCue: "오디오",
    defaultPerspectiveRole: "기본 관점", audienceJobs: "대상 직무", cards: "방벽 카드", allowedCards: "사용 가능한 카드",
    incidentDebrief: "실사건 회고", overview: "사건 개요", directCauses: "직접 원인", rootCauses: "근본 원인", contributingFactors: "기여 요인",
    causalChain: "인과관계", failedBarriers: "약해진 방벽", correctiveActions: "재발 방지 대책", lessons: "교훈", sources: "출처",
    "$order": "행동 작성 순서",
  };
  const key = path.at(-1) ?? "";
  const parent = path.at(-2) ?? "";
  const contexts: Record<string, string> = { barrierDelta: "방벽 효과", metricsDelta: "학습 지표 효과", psfMultipliers: "위험 요인 효과", flags: "상태 표시", barriers: "초기 방벽", psf: "초기 위험 요인", metrics: "초기 학습 지표" };
  if (Object.hasOwn(contexts, parent)) return `${contexts[parent]} · ${key}`;
  if (Object.hasOwn(fields, key)) return fields[key]!;
  if (path[0] === "nodes" && path.length === 2) return `장면 · ${key}`;
  if (parent === "choices" || parent === "infoActions") return `행동 · ${key}`;
  return key;
}

export function diffValue(value: unknown): string {
  if (value === undefined) return "없음";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "없음";
}
