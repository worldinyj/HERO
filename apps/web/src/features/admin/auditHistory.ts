export const AUDIT_PAGE_SIZE = 50;
// Metadata may contain private payloads. This view reads only event identifiers.
export const AUDIT_COLUMNS = "id,actor_user_id,plant_id,action,entity_type,entity_id,created_at";

export const AUDIT_ACTIONS: Record<string, string> = {
  "plant.created": "조직 생성",
  "plant.active_changed": "조직 운영 상태 변경",
  "invitation.created": "초대 생성",
  "invitation.accepted": "초대 수락",
  "invitation.reissued": "초대 재발급",
  "invitation.canceled": "초대 취소",
  "invitation.canceled_for_reissue": "재발급으로 이전 초대 취소",
  "player.deactivated": "사용자 비활성화",
  "player.reactivated": "사용자 재활성화",
  "nickname.changed": "닉네임 변경",
  "nickname.force_reset": "닉네임 강제 초기화",
  "scenario.version_uploaded": "시나리오 버전 등록",
  "scenario.status_changed": "시나리오 상태 변경",
  "season.scenario_binding_changed": "시즌 시나리오 연결 변경",
  "season.closed": "시즌 마감",
  "season.opened": "시즌 시작",
  "play_session.completed": "학습 세션 완료",
  "admin.bootstrap_initial": "최초 관리자 등록",
};

export interface AuditRow {
  id: number;
  actor_user_id: string | null;
  plant_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

export interface AuditFilters { action: string; from: string; to: string }
export const EMPTY_AUDIT_FILTERS: AuditFilters = { action: "", from: "", to: "" };

export function auditDateBounds(filters: AuditFilters): { from: string | undefined; to: string | undefined } {
  function date(value: string): Date | undefined {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new Error("날짜를 확인해주세요.");
    const result = new Date(`${value}T00:00:00+09:00`);
    if (!Number.isFinite(result.getTime()) || new Date(result.getTime() + 9 * 3600_000).toISOString().slice(0, 10) !== value) {
      throw new Error("날짜를 확인해주세요.");
    }
    return result;
  }
  const from = date(filters.from);
  const to = date(filters.to);
  if (from && to && from > to) throw new Error("종료일은 시작일 이후로 선택해주세요.");
  return { from: from?.toISOString(), to: to ? new Date(to.getTime() + 86400_000).toISOString() : undefined };
}

export function readAuditRows(value: unknown): AuditRow[] {
  if (!Array.isArray(value) || value.length > AUDIT_PAGE_SIZE + 1) throw new Error("audit_response_invalid");
  let previous = Infinity;
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("audit_response_invalid");
    const r = row as Record<string, unknown>;
    if (!Number.isSafeInteger(r.id) || Number(r.id) <= 0 || Number(r.id) >= previous ||
      typeof r.action !== "string" || !r.action || typeof r.entity_type !== "string" || !r.entity_type ||
      typeof r.created_at !== "string" || !Number.isFinite(Date.parse(r.created_at)) ||
      ![r.actor_user_id, r.plant_id, r.entity_id].every(v => v === null || typeof v === "string")) {
      throw new Error("audit_response_invalid");
    }
    previous = Number(r.id);
    // Explicitly project, even if a server response unexpectedly includes metadata.
    return { id: Number(r.id), actor_user_id: r.actor_user_id as string | null,
      plant_id: r.plant_id as string | null, action: r.action, entity_type: r.entity_type,
      entity_id: r.entity_id as string | null, created_at: r.created_at };
  });
}

export function auditTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}
