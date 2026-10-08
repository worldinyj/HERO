import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { getSupabase } from "../../lib/supabase";
import { InviteCreationOutcomeUnknownError, isDefiniteInviteRejection } from "../manager/inviteCreationErrors";
import { readIssuedInviteLink } from "../manager/inviteResponse";
import { isValidAdminOrgLists } from "./adminOrgResponse";

interface PlantRow {
  id: string;
  code: string;
  name: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

interface ManagerRow {
  id: string;
  plant_id: string | null;
  real_name: string;
  nickname: string;
  is_active: boolean;
  plants:
    | { display_name: string; code: string }
    | Array<{ display_name: string; code: string }>
    | null;
}

interface InviteResult {
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
  plantDisplayName: string;
}

interface PendingManagerInviteRow {
  id: string;
  plant_id: string;
  invitee_name: string;
  expires_at: string;
  created_at: string;
  plants:
    | { display_name: string; code: string }
    | Array<{ display_name: string; code: string }>
    | null;
}

function invitePlantLabel(row: PendingManagerInviteRow): string {
  const plant = Array.isArray(row.plants) ? row.plants[0] : row.plants;
  return plant ? `${plant.display_name} · ${plant.code}` : "발전소";
}

function normalizePlantCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "")
    .slice(0, 20);
}

function managerPlantLabel(row: ManagerRow): string {
  const plant = Array.isArray(row.plants) ? row.plants[0] : row.plants;
  return plant ? `${plant.display_name} · ${plant.code}` : "발전소 미지정";
}

export function AdminOrgPage() {
  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [pendingManagerInvites, setPendingManagerInvites] = useState<PendingManagerInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [plantCode, setPlantCode] = useState("");
  const [plantName, setPlantName] = useState("");
  const [plantDisplayName, setPlantDisplayName] = useState("");
  const [creatingPlant, setCreatingPlant] = useState(false);

  const [invitePlantId, setInvitePlantId] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [createOutcomeUnknown, setCreateOutcomeUnknown] = useState(false);
  const [reissueUnknownIds, setReissueUnknownIds] = useState<string[]>([]);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [managerInviteActionPending, setManagerInviteActionPending] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabase();

      const now = new Date().toISOString();
      const [plantResult, managerResult, inviteResult] = await Promise.all([
        supabase
          .from("plants")
          .select("id, code, name, display_name, is_active, created_at")
          .order("display_name", { ascending: true }),
        supabase
          .from("profiles")
          .select("id, plant_id, real_name, nickname, is_active, plants(display_name, code)")
          .eq("role", "plant_manager")
          .order("real_name", { ascending: true }),
        supabase
          .from("invitations")
          .select("id, plant_id, invitee_name, expires_at, created_at, plants(display_name, code)")
          .eq("target_role", "plant_manager")
          .is("accepted_at", null)
          .is("canceled_at", null)
          .gt("expires_at", now)
          .order("created_at", { ascending: false }),
      ]);

      if (plantResult.error) throw plantResult.error;
      if (managerResult.error) throw managerResult.error;
      if (inviteResult.error) throw inviteResult.error;
      if (!isValidAdminOrgLists(plantResult.data, managerResult.data, inviteResult.data)) {
        throw new Error("admin_org_result_invalid");
      }

      setPlants(plantResult.data as PlantRow[]);
      setManagers(managerResult.data as unknown as ManagerRow[]);
      setPendingManagerInvites(inviteResult.data as unknown as PendingManagerInviteRow[]);

      if (!invitePlantId) {
        const firstActive = plantResult.data.find((plant) => plant.is_active);
        if (firstActive) setInvitePlantId(firstActive.id);
      }
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "관리자 조직 정보를 불러오지 못했습니다.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const managerCountByPlant = useMemo(() => {
    const counts = new Map<string, number>();
    for (const manager of managers) {
      if (!manager.plant_id || !manager.is_active) continue;
      counts.set(manager.plant_id, (counts.get(manager.plant_id) ?? 0) + 1);
    }
    return counts;
  }, [managers]);

  async function handleCreatePlant() {
    const code = normalizePlantCode(plantCode);
    const name = plantName.trim();
    const displayName = plantDisplayName.trim();

    if (!code || !name || !displayName) {
      setError("발전소 코드·정식명·표시명을 모두 입력해주세요.");
      return;
    }

    try {
      setCreatingPlant(true);
      setError(null);
      const supabase = getSupabase();
      const { error: insertError } = await supabase.from("plants").insert({
        code,
        name,
        display_name: displayName,
        is_active: true,
      });

      if (insertError) throw insertError;

      setPlantCode("");
      setPlantName("");
      setPlantDisplayName("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "발전소를 생성하지 못했습니다.",
      );
    } finally {
      setCreatingPlant(false);
    }
  }

  async function handleTogglePlant(plant: PlantRow) {
    try {
      setError(null);
      const supabase = getSupabase();
      const { error: updateError } = await supabase
        .from("plants")
        .update({ is_active: !plant.is_active })
        .eq("id", plant.id);

      if (updateError) throw updateError;
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "발전소 상태를 변경하지 못했습니다.",
      );
    }
  }

  async function handleCreateManagerInvite() {
    if (creatingInvite || createOutcomeUnknown) return;
    // An issued URL exists only in this component: preserve it until the
    // operator explicitly confirms it has been copied/saved.
    if (inviteResult) {
      setError("기존 담당자 초대 링크를 먼저 보관하고 '새 초대 작성'을 눌러주세요.");
      return;
    }
    if (!invitePlantId || !inviteeName.trim()) {
      setError("발전소와 담당자 이름을 입력해주세요.");
      return;
    }

    try {
      setCreatingInvite(true);
      setError(null);
      setCopied(false);

      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "create-invite",
        {
          body: {
            plantId: invitePlantId,
            targetRole: "plant_manager",
            inviteeName: inviteeName.trim(),
          },
        },
      );

      if (invokeError) {
        if (!isDefiniteInviteRejection(invokeError)) {
          throw new InviteCreationOutcomeUnknownError();
        }
        throw invokeError;
      }

      const result = readIssuedInviteLink(data);
      if (!result) {
        // HTTP 2xx with an invalid one-time link may follow a committed INSERT.
        throw new InviteCreationOutcomeUnknownError();
      }

      setInviteResult(result);
      setInviteeName("");
      await load();
    } catch (cause) {
      if (cause instanceof InviteCreationOutcomeUnknownError) {
        setCreateOutcomeUnknown(true);
        setError(
          "담당자 초대가 생성되었을 수도 있습니다. 새로 발급하기 전에 수락 대기 목록을 확인하고 중복 초대를 정리해주세요.",
        );
      } else {
        setError(
          cause instanceof Error ? cause.message : "담당자 초대를 생성하지 못했습니다.",
        );
      }
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleManagerInviteAction(
    invitationId: string,
    action: "cancel-invite" | "reissue-invite",
  ) {
    if (managerInviteActionPending) return;
    if (action === "reissue-invite") {
      if (reissueUnknownIds.includes(invitationId)) {
        setError("이 초대의 이전 재발급 결과를 확인할 수 없습니다. 수락 대기 목록을 먼저 대조해주세요.");
        return;
      }
      if (inviteResult) {
        setError("앞서 표시한 일회용 링크를 보관하고 '새 초대 작성'을 눌러주세요.");
        return;
      }
    }
    try {
      setManagerInviteActionPending(`${action}:${invitationId}`);
      setError(null);
      setCopied(false);

      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "manager-user-action",
        { body: { action, invitationId } },
      );

      if (invokeError) {
        if (action === "reissue-invite" && !isDefiniteInviteRejection(invokeError)) {
          throw new InviteCreationOutcomeUnknownError();
        }
        throw invokeError;
      }

      const result = data as (Partial<InviteResult> & { error?: string }) | null;
      // A successful status without a valid body may follow a committed
      // token rotation. Do not treat it as safely retryable.
      if (!result || typeof result !== "object") {
        if (action === "reissue-invite") {
          throw new InviteCreationOutcomeUnknownError();
        }
        throw new Error("초대 처리 응답을 확인하지 못했습니다.");
      }
      if (result.error) {
        if (action === "reissue-invite") {
          throw new InviteCreationOutcomeUnknownError();
        }
        throw new Error(result.error);
      }

      if (action === "reissue-invite") {
        if (
          !result.invitationId ||
          !result.inviteUrl ||
          !result.expiresAt ||
          !result.plantDisplayName
        ) {
          throw new InviteCreationOutcomeUnknownError();
        }

        setInviteResult(result as InviteResult);
      } else {
        // Canceling another invite must not erase a different copied-once
        // token currently on-screen.
        setInviteResult((current) =>
          current?.invitationId === invitationId ? null : current,
        );
      }

      await load();
    } catch (cause) {
      if (cause instanceof InviteCreationOutcomeUnknownError) {
        setReissueUnknownIds((current) =>
          current.includes(invitationId) ? current : [...current, invitationId],
        );
        setError("재발급 응답을 확인할 수 없습니다. 기존 링크가 취소되고 새 초대가 생성되었을 수 있습니다. 수락 대기 목록을 다시 확인해주세요.");
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : action === "reissue-invite"
              ? "담당자 초대 링크 재발급에 실패했습니다."
              : "담당자 초대를 취소하지 못했습니다.",
        );
      }
    } finally {
      setManagerInviteActionPending(null);
    }
  }

  async function handleCopyInvite() {
    if (!inviteResult?.inviteUrl) return;

    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("클립보드 복사에 실패했습니다. 링크를 직접 선택해 복사해주세요.");
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">관리자 조직 정보를 불러오고 있습니다…</p>
      </section>
    );
  }

  return (
    <section className="admin-page" aria-labelledby="admin-title">
      <header className="panel admin-header">
        <nav className="admin-subnav" aria-label="관리자 메뉴">
          <Link className="admin-subnav-link admin-subnav-link--active" to="/admin">
            조직
          </Link>
          <Link className="admin-subnav-link" to="/admin/scenarios">
            시나리오
          </Link>
        </nav>
        <p className="eyebrow">Super Admin</p>
        <h2 id="admin-title">조직 관리</h2>
        <p className="muted">
          발전소를 생성하고 각 발전소의 교육담당자 초대 링크를 발급합니다.
        </p>
      </header>

      {error ? (
        <section className="panel">
          <p className="error-text" role="alert">{error}</p>
        </section>
      ) : null}

      <section className="panel admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Plants</p>
            <h3>발전소</h3>
          </div>
          <span className="count-badge">{plants.length}</span>
        </div>

        <div className="admin-form-grid">
          <label>
            <span>코드</span>
            <input
              value={plantCode}
              onChange={(event) => setPlantCode(normalizePlantCode(event.target.value))}
              placeholder="예: HANUL"
              maxLength={20}
            />
          </label>
          <label>
            <span>정식명</span>
            <input
              value={plantName}
              onChange={(event) => setPlantName(event.target.value)}
              placeholder="예: 한울원자력본부"
            />
          </label>
          <label>
            <span>표시명</span>
            <input
              value={plantDisplayName}
              onChange={(event) => setPlantDisplayName(event.target.value)}
              placeholder="예: 한울"
            />
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={creatingPlant}
            onClick={handleCreatePlant}
          >
            {creatingPlant ? "생성 중…" : "발전소 생성"}
          </button>
        </div>

        <div className="admin-list">
          {plants.map((plant) => (
            <article key={plant.id} className="admin-row">
              <div>
                <strong>{plant.display_name}</strong>
                <span>{plant.name} · {plant.code}</span>
              </div>
              <div className="admin-row-actions">
                <span className={plant.is_active ? "status-pill status-pill--active" : "status-pill"}>
                  {plant.is_active ? "운영중" : "중지"}
                </span>
                <span className="muted mini-copy">
                  담당자 {managerCountByPlant.get(plant.id) ?? 0}명
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => void handleTogglePlant(plant)}
                >
                  {plant.is_active ? "운영 중지" : "다시 활성화"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Plant Manager</p>
            <h3>담당자 초대</h3>
          </div>
          <span className="count-badge">{managers.filter((row) => row.is_active).length}</span>
        </div>

        <div className="admin-form-grid">
          <label>
            <span>발전소</span>
            <select
              value={invitePlantId}
              onChange={(event) => setInvitePlantId(event.target.value)}
            >
              <option value="">선택</option>
              {plants.filter((plant) => plant.is_active).map((plant) => (
                <option key={plant.id} value={plant.id}>
                  {plant.display_name} · {plant.code}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>담당자 이름</span>
            <input
              value={inviteeName}
              onChange={(event) => setInviteeName(event.target.value)}
              placeholder="예: 홍길동"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            disabled={creatingInvite || createOutcomeUnknown || Boolean(inviteResult) || !invitePlantId}
            onClick={handleCreateManagerInvite}
          >
            {creatingInvite ? "초대 생성 중…" : "담당자 초대 링크 생성"}
          </button>
        </div>

        {createOutcomeUnknown ? (
          <div className="invite-result-box" role="alert">
            <strong>초대 생성 결과 확인 필요</strong>
            <p className="muted">서버에서 담당자 초대가 이미 생성되었을 수 있습니다. 아래 수락 대기 목록을 확인하고 필요한 항목을 정리한 뒤 새 요청을 시작해주세요.</p>
            <button
              type="button"
              className="secondary-button"
              disabled={creatingInvite}
              onClick={() => setCreateOutcomeUnknown(false)}
            >
              초대 목록 대조 완료 · 새 요청 허용
            </button>
          </div>
        ) : null}

        {inviteResult ? (
          <div className="invite-result-box">
            <strong>{inviteResult.plantDisplayName} 담당자 초대 링크</strong>
            <p className="muted mini-copy">
              보안을 위해 초대 토큰 원문은 서버에 저장하지 않습니다. 이 링크는 지금 복사해 전달해주세요.
            </p>
            <code>{inviteResult.inviteUrl}</code>
            <button type="button" className="secondary-button" onClick={handleCopyInvite}>
              {copied ? "복사 완료" : "링크 복사"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setInviteResult(null);
                setCopied(false);
                setError(null);
              }}
            >
              링크 보관 완료 · 새 초대 작성
            </button>
          </div>
        ) : null}

        {pendingManagerInvites.length > 0 ? (
          <div className="admin-list" aria-label="수락 대기 중인 담당자 초대">
            <p className="muted mini-copy">
              수락 대기 {pendingManagerInvites.length}건 · 기존 링크 원문은 보안상 다시 표시할 수 없습니다.
            </p>
            {pendingManagerInvites.map((invite) => (
              <article key={invite.id} className="admin-row">
                <div>
                  <strong>{invite.invitee_name}</strong>
                  <span>{invitePlantLabel(invite)}</span>
                </div>
                <div className="admin-row-actions">
                  <span className="status-pill">수락 대기</span>
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    disabled={managerInviteActionPending !== null || reissueUnknownIds.includes(invite.id) || Boolean(inviteResult)}
                    onClick={() => void handleManagerInviteAction(invite.id, "reissue-invite")}
                  >
                    {managerInviteActionPending === `reissue-invite:${invite.id}`
                      ? "재발급 중…"
                      : "링크 재발급"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={managerInviteActionPending !== null}
                    onClick={() => void handleManagerInviteAction(invite.id, "cancel-invite")}
                  >
                    {managerInviteActionPending === `cancel-invite:${invite.id}`
                      ? "취소 중…"
                      : "초대 취소"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="admin-list">
          {managers.length === 0 ? (
            <p className="muted">등록된 발전소담당자가 없습니다.</p>
          ) : (
            managers.map((manager) => (
              <article key={manager.id} className="admin-row">
                <div>
                  <strong>{manager.real_name}</strong>
                  <span>{manager.nickname} · {managerPlantLabel(manager)}</span>
                </div>
                <span className={manager.is_active ? "status-pill status-pill--active" : "status-pill"}>
                  {manager.is_active ? "활성" : "비활성"}
                </span>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
