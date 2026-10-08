import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { getSupabase } from "../../lib/supabase";
import { ReadRequestGate } from "../../lib/readRequestGate";
import { InviteCreationOutcomeUnknownError, isDefiniteInviteRejection } from "../manager/inviteCreationErrors";
import { readIssuedInviteLink, readReissuedInviteLink, readCanceledInviteResult } from "../manager/inviteResponse";
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
  const rosterGate = useRef(new ReadRequestGate());
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
  const [cancelUnknownIds, setCancelUnknownIds] = useState<string[]>([]);
  const [adminRosterReady, setAdminRosterReady] = useState(false);
  const [adminRosterPending, setAdminRosterPending] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [managerInviteActionPending, setManagerInviteActionPending] = useState<string | null>(null);

  async function load(): Promise<boolean> {
    const revision = rosterGate.current.begin();
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

      // A later refresh supersedes this snapshot, including on success.
      if (!rosterGate.current.isCurrent(revision)) return false;
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
        const firstActive = (plantResult.data ?? []).find((plant) => plant.is_active);
        if (firstActive) setInvitePlantId(firstActive.id);
      }
      return true;
    } catch (cause) {
      if (rosterGate.current.isCurrent(revision)) {
        setError(
          cause instanceof Error ? cause.message : "관리자 조직 정보를 불러오지 못했습니다.",
        );
      }
      return false;
    } finally {
      if (rosterGate.current.isCurrent(revision)) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => rosterGate.current.invalidate();
    // Mount-scoped read; mutations start independent revisions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function reconcileAdminInvites() {
    if (creatingInvite || managerInviteActionPending || adminRosterPending) return;
    setAdminRosterPending(true);
    setAdminRosterReady(false);
    try {
      if (await load()) {
        setAdminRosterReady(true);
        setError("새로 불러온 수락 대기 초대를 확인하고 필요한 중복 초대를 정리한 뒤 잠금을 해제해주세요.");
      } else {
        setError("관리자 초대 명단을 다시 읽지 못했습니다. 잠금 상태를 유지합니다.");
      }
    } finally {
      setAdminRosterPending(false);
    }
  }

  function confirmAdminInvites() {
    if (!adminRosterReady || creatingInvite || managerInviteActionPending || adminRosterPending) return;
    setCreateOutcomeUnknown(false);
    setReissueUnknownIds([]);
    setCancelUnknownIds([]);
    setAdminRosterReady(false);
    setError(null);
  }

  async function handleCreateManagerInvite() {
    if (
      creatingInvite || createOutcomeUnknown || adminRosterPending ||
      reissueUnknownIds.length > 0 || cancelUnknownIds.length > 0
    ) return;
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
        setAdminRosterReady(false);
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
    if (managerInviteActionPending || creatingInvite || adminRosterPending) return;
    if (
      createOutcomeUnknown ||
      reissueUnknownIds.includes(invitationId) ||
      cancelUnknownIds.includes(invitationId)
    ) {
      setError("이전 초대 발급·재발급·취소 결과를 명단에서 먼저 확인해주세요.");
      return;
    }
    if (inviteResult?.invitationId === invitationId) {
      setError("표시된 일회용 링크를 먼저 보관하고 다음 작업을 진행해주세요.");
      return;
    }
    if (action === "reissue-invite" && inviteResult) {
      setError("기존 일회용 링크를 보관하고 '새 초대 작성'을 눌러주세요.");
      return;
    }

    try {
      setManagerInviteActionPending(`${action}:${invitationId}`);
      setError(null);

      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "manager-user-action",
        { body: { action, invitationId } },
      );
      if (invokeError) {
        if (!isDefiniteInviteRejection(invokeError)) {
          throw new InviteCreationOutcomeUnknownError();
        }
        throw invokeError;
      }

      if (action === "reissue-invite") {
        const result = readReissuedInviteLink(data, invitationId);
        if (!result) throw new InviteCreationOutcomeUnknownError();
        setCopied(false);
        setInviteResult(result);
      } else {
        if (!readCanceledInviteResult(data, invitationId)) {
          throw new InviteCreationOutcomeUnknownError();
        }
        // Preserve unrelated one-time URLs even after cancellation.
      }

      if (!(await load())) {
        setAdminRosterReady(false);
        if (action === "reissue-invite") {
          setReissueUnknownIds((current) =>
            current.includes(invitationId) ? current : [...current, invitationId]
          );
        } else {
          setCancelUnknownIds((current) =>
            current.includes(invitationId) ? current : [...current, invitationId]
          );
        }
        setError("초대 작업은 완료되었지만 명단을 다시 읽지 못했습니다. 확인 후 잠금을 해제해주세요.");
      }
    } catch (cause) {
      if (cause instanceof InviteCreationOutcomeUnknownError) {
        setAdminRosterReady(false);
        if (action === "reissue-invite") {
          setReissueUnknownIds((current) =>
            current.includes(invitationId) ? current : [...current, invitationId]
          );
        } else {
          setCancelUnknownIds((current) =>
            current.includes(invitationId) ? current : [...current, invitationId]
          );
        }
        setError("초대 취소·재발급의 서버 반영 여부가 불확실합니다. 명단을 재조회하고 대조하기 전에는 재시도하지 마세요.");
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "담당자 초대 처리가 거절되었습니다.",
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
            disabled={
              creatingInvite || createOutcomeUnknown || Boolean(inviteResult) ||
              !invitePlantId || adminRosterPending ||
              reissueUnknownIds.length > 0 || cancelUnknownIds.length > 0
            }
            onClick={handleCreateManagerInvite}
          >
            {creatingInvite ? "초대 생성 중…" : "담당자 초대 링크 생성"}
          </button>
        </div>

        {createOutcomeUnknown || reissueUnknownIds.length > 0 || cancelUnknownIds.length > 0 ? (
          <div className="invite-result-box" role="alert">
            <strong>담당자 초대 처리 결과 확인 필요</strong>
            <p className="muted">
              초대 생성·취소·재발급이 서버에서 이미 처리되었을 수 있습니다.
              수락 대기 명단을 실제로 다시 읽고 대조한 뒤 명시적으로 잠금을 해제해주세요.
              분실한 일회용 토큰은 서버에서 복구할 수 없습니다.
            </p>
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={creatingInvite || managerInviteActionPending !== null || adminRosterPending}
                onClick={() => void reconcileAdminInvites()}
              >
                1. 담당자 초대 명단 다시 조회
              </button>
              <button
                type="button"
                className="text-button"
                disabled={!adminRosterReady || creatingInvite || managerInviteActionPending !== null || adminRosterPending}
                onClick={() => confirmAdminInvites()}
              >
                2. 결과 확인 완료 · 잠금 해제
              </button>
            </div>
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
                    disabled={
                      managerInviteActionPending !== null || creatingInvite || adminRosterPending ||
                      createOutcomeUnknown || reissueUnknownIds.includes(invite.id) ||
                      cancelUnknownIds.includes(invite.id) || Boolean(inviteResult)
                    }
                    onClick={() => void handleManagerInviteAction(invite.id, "reissue-invite")}
                  >
                    {managerInviteActionPending === `reissue-invite:${invite.id}`
                      ? "재발급 중…"
                      : "링크 재발급"}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={
                      managerInviteActionPending !== null || creatingInvite || adminRosterPending ||
                      createOutcomeUnknown || reissueUnknownIds.includes(invite.id) ||
                      cancelUnknownIds.includes(invite.id) ||
                      inviteResult?.invitationId === invite.id
                    }
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
