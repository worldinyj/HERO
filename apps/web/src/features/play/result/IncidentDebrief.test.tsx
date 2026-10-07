import { createGame } from "@hero/engine";
import { ScenarioSchema } from "@hero/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { IncidentDebrief } from "./IncidentDebrief";

function fixture() {
  return ScenarioSchema.parse({
    schemaVersion: "1.0.0",
    id: "incident_debrief_render",
    version: 1,
    title: "실사건 회고 렌더 테스트",
    defaultPerspectiveRole: "worker",
    audienceJobs: ["worker"],
    estimatedMinutes: 3,
    startNode: "end",
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
    incidentDebrief: {
      caseType: "중요 설정 확인 실패",
      overview: "공식자료를 익명화·일반화한 사건 개요입니다.",
      directCauses: [
        "잘못된 설정 입력이 설비반응 변화로 직접 이어졌다.",
      ],
      rootCauses: [
        "미예정 행위의 사전 검토와 독립확인 방어막이 충분히 작동하지 않았다.",
      ],
      contributingFactors: [
        "경쟁 업무와 주의분산이 존재했다.",
      ],
      causalChain: [
        "미예정 조작",
        "입력 전 확인 미흡",
        "예상하지 못한 설비반응",
      ],
      failedBarriers: [
        "Self Check",
        "Independent Verification",
      ],
      correctiveActions: [
        "중요 설정 적용 전 재확인 단계를 추가한다.",
        "조작 후 기대반응 감시를 절차화한다.",
      ],
      lessons: [
        {
          title: "확신이 없으면 멈추고 다시 확인한다.",
          detail: "설정값의 근거와 기대반응을 확인한 뒤 진행한다.",
          toolId: "stop_when_unsure",
        },
      ],
      sources: [],
    },
    nodes: {
      end: {
        type: "ending",
        ending: "safe_complete",
        title: "완료",
        summary: "완료",
      },
    },
  });
}

describe("IncidentDebrief", () => {
  it("renders the three-level cause model, barriers, and corrective actions", () => {
    const scenario = fixture();
    const game = createGame(scenario, {
      simulationSeed: "incident-debrief-test",
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <IncidentDebrief
          scenario={scenario}
          game={game}
          replayEnabled={false}
          onReplay={() => undefined}
        />
      </MemoryRouter>,
    );

    for (const expected of [
      "직접원인",
      "근본원인 · 시스템적 학습 분석",
      "기여원인 · 기여요인",
      "사건 인과사슬",
      "약화·실패한 방어막",
      "재발방지대책 연결",
      "중요 설정 적용 전 재확인 단계를 추가한다.",
      "조작 후 기대반응 감시를 절차화한다.",
    ]) {
      expect(html).toContain(expected);
    }
  });

  it("does not render the corrective-action section when the array is omitted", () => {
    const raw = fixture();
    const scenario = ScenarioSchema.parse({
      ...raw,
      incidentDebrief: {
        ...raw.incidentDebrief,
        correctiveActions: undefined,
      },
    });
    const game = createGame(scenario, {
      simulationSeed: "incident-debrief-default-test",
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <IncidentDebrief
          scenario={scenario}
          game={game}
          replayEnabled={false}
          onReplay={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(scenario.incidentDebrief?.correctiveActions).toEqual([]);
    expect(html).not.toContain("재발방지대책 연결");
  });
});
