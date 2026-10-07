import { ScenarioSchema } from "@hero/schema";
import { describe, expect, it } from "vitest";

function fixture() {
  return {
    schemaVersion: "1.0.0",
    id: "incident_source_contract",
    version: 1,
    title: "출처 계약 테스트",
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
      caseType: "공개 사건 일반화",
      overview: "공식 공개자료의 사실관계를 일반화한 사건 개요입니다.",
      rootCauses: ["방어막 관점 교육 분석"],
      contributingFactors: ["교육용 기여조건"],
      lessons: [
        {
          title: "멈추고 확인한다.",
          detail: "불확실하면 다음 행동 전에 확인한다.",
        },
      ],
      sources: [
        {
          publisher: "공식 기관",
          label: "공식 사건 자료",
          url: "https://example.go.kr/official-event",
          publishedAt: "2026-09-04",
          usage: "출처표시 조건",
        },
      ],
    },
    nodes: {
      end: {
        type: "ending",
        ending: "safe_complete",
        title: "완료",
        summary: "완료",
      },
    },
  };
}

describe("incident debrief source attribution schema", () => {
  it("accepts public source attribution metadata", () => {
    const parsed = ScenarioSchema.parse(fixture());

    expect(parsed.incidentDebrief?.sources).toEqual([
      {
        publisher: "공식 기관",
        label: "공식 사건 자료",
        url: "https://example.go.kr/official-event",
        publishedAt: "2026-09-04",
        usage: "출처표시 조건",
      },
    ]);
  });

  it("keeps older incident debriefs backward compatible with an empty source list", () => {
    const input = fixture();
    delete (input.incidentDebrief as { sources?: unknown }).sources;

    const parsed = ScenarioSchema.parse(input);

    expect(parsed.incidentDebrief?.sources).toEqual([]);
  });

  it("rejects malformed source URLs and publication dates", () => {
    const badUrl = fixture();
    badUrl.incidentDebrief.sources[0]!.url = "not-a-url";
    expect(ScenarioSchema.safeParse(badUrl).success).toBe(false);

    const badDate = fixture();
    badDate.incidentDebrief.sources[0]!.publishedAt = "2026/09/04";
    expect(ScenarioSchema.safeParse(badDate).success).toBe(false);
  });
});
