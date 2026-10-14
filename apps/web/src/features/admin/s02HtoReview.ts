import type { Scenario } from "@hero/schema";

// Hash of recursively key-sorted ScenarioSchema.parse(S02 v4), not the
// source-file approval hash. JSONB transport may change object key order.
export const S02_HTO_INPUT_SHA256 = "eba3dfb4ec719e79777c8796e0c639ab6529f2d2559e8a9d989694c27ccbc54c";

export async function matchesS02HtoInput(scenario: Scenario): Promise<boolean> {
  if (scenario.id !== "s02_equipment_identity" || scenario.version !== 4) return false;
  const content = JSON.stringify(scenario, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("") === S02_HTO_INPUT_SHA256;
}

export const HTO_CONNECTIONS = [
  {
    id: "human_technology",
    title: "사람 ↔ 기술",
    text: "공식 기록의 조작부 식별 오인과 패널 정보 부족을 함께 봅니다. HERO의 해석은 작업자의 주의만 요구하기보다 표시·배치가 대상과 기능을 구분하도록 도왔는지 살피는 것입니다.",
    barrier: "개인: 조작 전 대상·기능 확인 / 기술: 구분 가능한 표시와 조작부 배치",
  },
  {
    id: "technology_organization",
    title: "기술 ↔ 조직",
    text: "공식 기록에는 제작사의 도면 개정 오류를 공급사가 확인하지 못해 잘못된 회로 구성이 남았다고 되어 있습니다. HERO에서는 도면 변경·검증·공급자 관리가 기술 방벽의 신뢰성을 어떻게 지탱하는지 연결해 봅니다.",
    barrier: "기술: 의도한 회로 기능 검증 / 조직: 도면 변경과 공급품 품질 확인",
  },
  {
    id: "organization_human",
    title: "조직 ↔ 사람",
    text: "HERO가 추가한 시간압박과 문서·현장 상태의 불확실성을 살펴봅니다. 확인할 시간, 도움을 요청할 경로, 멈춤을 지원하는 조건을 어떻게 마련할지 생각합니다. 실제 사건에서 중지 권한이나 동료확인이 없었다는 판정은 아닙니다.",
    barrier: "개인·팀: 불확실성 공유 / 조직: 확인 시간·지원 경로·중지 후 재검토",
  },
] as const;
