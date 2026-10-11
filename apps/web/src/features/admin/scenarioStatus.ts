export type ScenarioStatus = "draft" | "review" | "approved" | "published" | "archived";

export const STATUS_LABEL: Record<ScenarioStatus, string> = {
  draft: "초안", review: "검토", approved: "승인", published: "배포", archived: "보관",
};

export const STATUS_IMPACT: Record<ScenarioStatus, string> = {
  draft: "초안으로 되돌립니다. 내용을 검토한 뒤 승인 절차를 다시 진행해주세요.",
  review: "검토 대상으로 표시합니다. 미리보기에서 장면 연결과 실사건 회고를 확인해주세요.",
  approved: "승인 상태로 기록됩니다. 필요한 내용·출처·이용조건·익명화 검토를 완료했는지 확인해주세요. 아직 플레이용으로 배포되지는 않습니다.",
  published: "이 버전을 배포 상태로 변경하고 같은 시나리오의 기존 배포 버전은 보관합니다. 새 경쟁 플레이에는 활성 시즌의 버전 연결도 필요합니다. 시작된 플레이는 시작 당시 버전을 유지합니다.",
  archived: "이 버전을 보관합니다. 배포 중인 버전이라면 새 플레이의 대상에서 제외됩니다. 이미 시작된 플레이의 버전은 바뀌지 않습니다.",
};

export function confirmedStatusResponse(value: unknown, id: string, status: ScenarioStatus, expectedVersion: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (row.updated !== true || Object.hasOwn(row, "error") || !row.version || typeof row.version !== "object" || Array.isArray(row.version)) return false;
  const version = row.version as Record<string, unknown>;
  return version.id === id && version.status === status && version.version === expectedVersion;
}

export async function scenarioErrorMessage(cause: unknown): Promise<string> {
  let code = cause instanceof Error ? cause.message : "";
  if (cause && typeof cause === "object" && "context" in cause && cause.context instanceof Response) {
    try {
      const data: unknown = await cause.context.clone().json();
      if (data && typeof data === "object" && "error" in data && typeof data.error === "string") code = data.error;
    } catch { /* Keep the safe fallback for malformed server responses. */ }
  }
  if (code === "invalid_status_transition" || code.startsWith("invalid_status_transition:")) return "현재 상태에서는 변경할 수 없습니다. 취소 후 목록을 새로고침해 현재 상태를 확인해주세요.";
  const messages: Record<string, string> = {
    scenario_status_conflict: "다른 관리자가 상태를 변경했습니다. 취소 후 목록을 새로고침해 현재 상태를 확인해주세요.",
    scenario_content_conflict: "저장된 내용이 변경되었습니다. 취소 후 목록을 새로고침하고 내용을 다시 확인해주세요.",
    scenario_incident_debrief_required: "경쟁 시나리오를 배포하려면 익명화된 실사건 회고를 먼저 작성해야 합니다.",
    scenario_content_invalid: "저장된 시나리오 내용이 현재 스키마와 맞지 않습니다. 새 버전으로 다시 업로드해주세요.",
    scenario_version_not_found: "해당 버전을 찾을 수 없습니다. 취소 후 목록을 새로고침해주세요.",
    scenario_version_already_exists: "같은 시나리오의 버전 번호가 이미 있습니다. 새 버전 번호로 업로드해주세요.",
    admin_required: "관리자 권한이 필요합니다. 현재 로그인 계정을 확인해주세요.",
    unauthorized: "로그인 상태를 확인하지 못했습니다. 다시 로그인해주세요.",
    rate_limited: "요청이 많습니다. 잠시 후 다시 시도해주세요.",
  };
  return (Object.hasOwn(messages, code) ? messages[code] : undefined) ?? "처리 결과를 확인하지 못했습니다. 취소 후 목록을 새로고침해 반영 여부를 확인한 뒤 다시 시도해주세요.";
}
