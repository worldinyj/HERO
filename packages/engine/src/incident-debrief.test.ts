import {
  ScenarioSchema,
  validateScenarioGraph,
  type Scenario,
} from "@hero/schema";
import { describe, expect, it } from "vitest";

function scenario(includeDebrief: boolean): Scenario {
  return ScenarioSchema.parse({
    schemaVersion: "1.0.0",
    id: "s01_test",
    version: 1,
    title: "실사건 공개 테스트",
    defaultPerspectiveRole: "worker",
    audienceJobs: ["worker"],
    estimatedMinutes: 5,
    startNode: "intro",
    cards: [],
    initialState: {
      clockMin: 0,
      deadlineMin: 60,
      baseHazard: 0,
      psf: {},
      barriers: {},
      metrics: {
        safety: 50,
        awareness: 50,
        communication: 50,
        procedure: 50,
        challenge: 50,
      },
    },
    ...(includeDebrief
      ? {
          incidentDebrief: {
            caseType: "작업 대상 식별 오류",
            overview:
              "작업 준비와 식별 확인이 충분히 연결되지 않은 상태에서 작업이 진행되어 방어막이 약화된 사건을 일반화해 재구성했습니다.",
            directCauses: [
              "작업 대상 또는 조작부를 잘못 식별한 상태에서 조작이 이루어졌다.",
            ],
            rootCauses: [
              "작업 전 식별 확인 절차와 현장 조건의 연결이 충분하지 않았다.",
              "감독·상호확인 방어막이 실제 작업 시점에 효과적으로 작동하지 않았다.",
            ],
            causalChain: [
              "식별 불확실성 → 잘못된 조작 → 예상하지 못한 설비반응",
            ],
            failedBarriers: [
              "Self Check",
              "Peer Check",
            ],
            contributingFactors: [
              "시간압박",
              "유사한 설비 표식",
              "동료확인 미활용",
            ],
            lessons: [
              {
                title: "확신이 없으면 멈추고 다시 식별한다.",
                detail:
                  "작업 대상 식별이 불명확하면 진행보다 확인을 우선하고 동료확인을 활용한다.",
                toolId: "stop_when_unsure",
              },
            ],
          },
        }
      : {}),
    nodes: {
      intro: {
        type: "scene",
        text: "시작",
        next: "decision",
      },
      decision: {
        type: "decision",
        prompt: "어떻게 하시겠습니까?",
        choices: [
          { actionId: "a", label: "A", next: "end", timeCostMin: 1 },
          { actionId: "b", label: "B", next: "end", timeCostMin: 1 },
          { actionId: "c", label: "C", next: "end", timeCostMin: 1 },
        ],
        infoActions: [],
      },
      end: {
        type: "ending",
        ending: "safe_complete",
        title: "완료",
        summary: "완료",
      },
    },
  });
}

describe("incident debrief schema contract", () => {
  it("accepts anonymized public learning metadata", () => {
    const parsed = scenario(true);

    expect(parsed.incidentDebrief?.directCauses).toHaveLength(1);
    expect(parsed.incidentDebrief?.rootCauses).toHaveLength(2);
    expect(parsed.incidentDebrief?.causalChain).toHaveLength(1);
    expect(parsed.incidentDebrief?.failedBarriers).toHaveLength(2);
    expect(
      validateScenarioGraph(parsed).some(
        (issue) => issue.code === "missing_incident_debrief",
      ),
    ).toBe(false);
  });

  it("warns when a competitive scenario has no incident debrief", () => {
    const parsed = scenario(false);

    expect(
      validateScenarioGraph(parsed).some(
        (issue) =>
          issue.code === "missing_incident_debrief" &&
          issue.severity === "warning",
      ),
    ).toBe(true);
  });
});
