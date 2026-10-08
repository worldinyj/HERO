import { useCallback, useEffect, useMemo, useState } from "react";
import { shareHeroInvite } from "../../lib/kakaoShare";
import { getSupabase } from "../../lib/supabase";
import { ManagerInvitePanel } from "./ManagerInvitePanel";
import { InviteCreationOutcomeUnknownError, isDefiniteInviteRejection } from "./inviteCreationErrors";
import { isValidManagerDashboardLists } from "./managerDashboardResponse";
import { readReissuedInviteLink } from "./inviteResponse";

type JobRole = "sro" | "ro" | "field_operator" | "supervisor" | "worker";

interface ParticipationRow {
  profile_id: string;
  real_name: string;
  nickname: string;
  job_role: JobRole | null;
  team_name: string | null;
  is_active: boolean;
  completed_scenarios: number;
  last_activity_at: string | null;
}

interface PendingInviteRow {
  invitation_id: string;
  invitee_name: string;
  job_role: JobRole | null;
  team_name: string | null;
  expires_at: string;
  created_at: string;
}

interface AggregateRow {
  job_role: JobRole;
  participant_count: number;
  completed_user_count: number;
  completed_session_count: number;
}

interface ReissueResult {
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
  plantDisplayName: string;
}

const JOB_LABEL: Record<JobRole, string> = {
  sro: "SRO",
  ro: "RO",
  field_operator: "현장운전원",
  supervisor: "감독",
  worker: "작업자",
};

function formatDateTime(value: string | null): string {
  if (!value) return "활동 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ManagerDashboardPage() {
  const [participants, setParticipants] = useState<ParticipationRow[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [reissueResult, setReissueResult] = useState<ReissueResult | null>(null);
  const [copiedReissue, setCopiedReissue] = useState(false);
  const [uncertainReissues, setUncertainReissues] = useState<string[]>([]);
  const [uncertainCancellations, setUncertainCancellations] = useState<string[]>([]);
  const [invitationReconciliationReady, setInvitationReconciliationReady] = useState(false);
  const [uncertainPlayerIds, setUncertainPlayerIds] = useState<string[]>([]);
  const [uncertainNicknameIds, setUncertainNicknameIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (background = false) => {
    try {
      if (!background) setLoading(true);
      setError(null);
      const supabase = getSupabase();

      const [participation, pending, aggregate] = await Promise.all([
        supabase.rpc("manager_player_rows"),
        supabase.rpc("manager_pending_invites"),
        supabase.rpc("manager_job_aggregates"),
      ]);

      const firstError = participation.error ?? pending.error ?? aggregate.error;
      if (firstError) throw firstError;

      // A null/malformed RPC response cannot prove invitation, status or
      // nickname outcomes. Keep the reconciliation lock in that case.
      if (!isValidManagerDashboardLists(participation.data, pending.data, aggregate.data)) {
        throw new Error("manager_dashboard_result_invalid");
      }

      setParticipants(participation.data as ParticipationRow[]);
      setPendingInvites(pending.data as PendingInviteRow[]);
      setAggregates(aggregate.data as AggregateRow[]);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "발전소 참여 현황을 불러오지 못했습니다.",
      );
      return false;
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const activeParticipants = participants.filter((row) => row.is_active);
    const completedUsers = activeParticipants.filter(
      (row) => Number(row.completed_scenarios) > 0,
    ).length;
    const completedScenarios = activeParticipants.reduce(
      (sum, row) => sum + Number(row.completed_scenarios),
      0,
    );

    return {
      accepted: participants.length,
      active: activeParticipants.length,
      pending: pendingInvites.length,
      completedUsers,
      completedScenarios,
    };
  }, [participants, pendingInvites]);

  async function invokeManagerAction(body: Record<string, unknown>) {
    const supabase = getSupabase();
    const reissue = body.action === "reissue-invite";
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manager-user-action", { body },
    );
    if (invokeError) {
      if (reissue && !isDefiniteInviteRejection(invokeError)) {
        throw new InviteCreationOutcomeUnknownError();
      }
      throw invokeError;
    }
    const result = data as (Record<string, unknown> & { error?: string }) | null;
    if (!result || typeof result !== "object" || result.error) {
      if (reissue) throw new InviteCreationOutcomeUnknownError();
      throw new Error(result?.error ?? "초대 처리 응답이 불확실합니다. 목록을 확인해주세요.");
    }
    return result;
  }

  async function handleCancelInvite(invitationId: string) {
    if (
      actionPending ||
      uncertainCancellations.includes(invitationId) ||
      uncertainReissues.includes(invitationId)
    ) {
      setError("취소·재발급 결과를 명단과 대조한 후 다시 요청해주세요.");
      return;
    }
    if (reissueResult?.invitationId === invitationId) {
      setError("표시된 일회용 링크를 보관한 후 취소해주세요.");
      return;
    }
    try {
      setActionPending(`invite:${invitationId}`);
      setError(null);
      const result = await invokeManagerAction({ action: "cancel-invite", invitationId });
      if (result.canceled !== true || result.invitationId !== invitationId) {
        throw new Error("cancel_result_unknown");
      }
      if (!(await loadDashboard(true))) {
        setInvitationReconciliationReady(false);
        setUncertainCancellations((old) =>
          old.includes(invitationId) ? old : [...old, invitationId]
        );
        setError("초대 취소는 완료되었지만 명단을 다시 읽지 못했습니다. 재조회 후 상태를 확인해주세요.");
      }
    } catch (cause) {
      if (isDefiniteInviteRejection(cause)) {
        setError("초대 취소 요청이 거절되었습니다. 새로고침 후 초대 상태를 확인해주세요.");
      } else {
        // A timeout/5xx can occur after the transaction commits. A second
        // cancel must be blocked until the server-side roster is reloaded.
        setInvitationReconciliationReady(false);
        setUncertainCancellations((old) =>
          old.includes(invitationId) ? old : [...old, invitationId]
        );
        await loadDashboard(true);
        setError("초대 취소 결과가 불확실합니다. 명단을 다시 확인한 뒤 재시도 잠금을 해제해주세요.");
      }
    } finally {
      setActionPending(null);
    }
  }

  async function reconcileInvitationOutcomes() {
    if (actionPending) return;
    setActionPending("invite-reconcile");
    setInvitationReconciliationReady(false);
    try {
      if (await loadDashboard(true)) {
        setInvitationReconciliationReady(true);
        setError("갱신된 초대 명단에서 취소·재발급 결과를 확인하고 잠금을 해제해주세요.");
      } else {
        setError("초대 명단 재조회에 실패했습니다. 결과 확인 전에는 잠금을 유지합니다.");
      }
    } finally {
      setActionPending(null);
    }
  }

  function confirmInvitationReconciliation() {
    if (!invitationReconciliationReady || actionPending) return;
    // The operator explicitly reviewed the freshly fetched roster.
    // Lost one-time token URLs cannot be reconstructed from this roster.
    setUncertainCancellations([]);
    setUncertainReissues([]);
    setInvitationReconciliationReady(false);
    setError(null);
  }

  async function handleReissueInvite(invitationId: string) {
    if (actionPending) return;
    if (
      reissueResult ||
      uncertainReissues.includes(invitationId) ||
      uncertainCancellations.includes(invitationId)
    ) {
      setError("이전 재발급 결과와 일회용 링크를 먼저 확인해주세요.");
      return;
    }
    try {
      setActionPending(`invite:${invitationId}`);
      setError(null);
      const result = await invokeManagerAction({ action: "reissue-invite", invitationId });
      const replacement = readReissuedInviteLink(result, invitationId);
      if (!replacement) {
        // A response with the wrong original invitation can never prove a
        // token rotation succeeded for the requested target.
        throw new InviteCreationOutcomeUnknownError();
      }
      setCopiedReissue(false);
      setReissueResult(replacement);
      await loadDashboard(true);
    } catch (cause) {
      if (cause instanceof InviteCreationOutcomeUnknownError) {
        setInvitationReconciliationReady(false);
        setUncertainReissues((old) => old.includes(invitationId) ? old : [...old, invitationId]);
        setError("재발급 결과가 불확실합니다. 서버에서 생성됐을 수 있으므로 초대 목록을 대조하기 전에는 재시도하지 마세요.");
      } else {
        setError(cause instanceof Error ? cause.message : "새 초대 링크 발급에 실패했습니다.");
      }
    } finally {
      setActionPending(null);
    }
  }

  async function handleNicknameReset(profileId: string) {
    if (actionPending || uncertainNicknameIds.includes(profileId)) {
      setError("이전 닉네임 초기화 결과를 명단에서 먼저 확인해주세요.");
      return;
    }

    try {
      setActionPending(`nickname:${profileId}`);
      setError(null);
      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "nickname-action",
        {
          body: {
            action: "force-reset",
            profileId,
          },
        },
      );
      if (invokeError) throw invokeError;

      const result = data as {
        reset?: boolean;
        profileId?: string;
        nickname?: string;
        resetRequired?: boolean;
      } | null;
      if (
        result?.reset !== true ||
        result.profileId !== profileId ||
        typeof result.nickname !== "string" ||
        result.resetRequired !== true
      ) {
        throw new Error("nickname_reset_outcome_unknown");
      }

      if (!(await loadDashboard(true))) {
        setUncertainNicknameIds((old) =>
          old.includes(profileId) ? old : [...old, profileId]
        );
        setError("초기화는 완료되었지만 명단 재조회에 실패했습니다. 확인 후 잠금을 해제해주세요.");
      }
    } catch (cause) {
      if (isDefiniteInviteRejection(cause)) {
        setError(cause instanceof Error ? cause.message : "닉네임 초기화가 거절되었습니다.");
      } else {
        // A lost response may follow a committed reset. Do not blindly issue
        // a second nickname because the first can never be reconstructed.
        setUncertainNicknameIds((old) =>
          old.includes(profileId) ? old : [...old, profileId]
        );
        await loadDashboard(true);
        setError("초기화 응답을 확인할 수 없습니다. 명단의 닉네임을 대조한 뒤 재시도 잠금을 해제해주세요.");
      }
    } finally {
      setActionPending(null);
    }
  }

  async function reconcileNicknameReset() {
    if (actionPending) return;
    setActionPending("nickname-reconcile");
    try {
      if (await loadDashboard(true)) {
        setUncertainNicknameIds([]);
        setError(null);
      } else {
        setError("명단 조회에 실패했습니다. 닉네임 상태를 확인할 수 없습니다.");
      }
    } finally {
      setActionPending(null);
    }
  }

  async function handlePlayerActive(profileId: string, isActive: boolean) {
    if (actionPending || uncertainPlayerIds.includes(profileId)) {
      setError("이전 상태 변경 결과를 명단에서 확인한 뒤 다시 요청해주세요.");
      return;
    }

    try {
      setActionPending(`player:${profileId}`);
      setError(null);
      const result = await invokeManagerAction({
        action: "set-player-active",
        profileId,
        isActive,
      });

      if (
        result.profileId !== profileId ||
        result.isActive !== isActive ||
        typeof result.changed !== "boolean"
      ) {
        throw new Error("player_status_result_unknown");
      }

      if (!(await loadDashboard(true))) {
        setUncertainPlayerIds((old) => old.includes(profileId) ? old : [...old, profileId]);
        setError("상태 변경은 완료되었지만 명단을 다시 읽지 못했습니다. 명단 확인 후 잠금을 해제해주세요.");
      }
    } catch (cause) {
      if (isDefiniteInviteRejection(cause)) {
        setError(cause instanceof Error ? cause.message : "사용자 상태 변경이 거절되었습니다.");
      } else {
        // The request may have committed despite the lost HTTP response.
        setUncertainPlayerIds((old) => old.includes(profileId) ? old : [...old, profileId]);
        await loadDashboard(true);
        setError("상태 변경 응답을 확인할 수 없습니다. 명단에서 실제 활성 상태를 확인한 뒤 잠금을 해제해주세요.");
      }
    } finally {
      setActionPending(null);
    }
  }

  async function reconcilePlayerStatus() {
    if (actionPending) return;
    setActionPending("player-reconcile");
    try {
      if (await loadDashboard(true)) {
        setUncertainPlayerIds([]);
        setError(null);
      } else {
        setError("명단 조회에 실패했습니다. 다시 확인한 후 잠금을 해제해주세요.");
      }
    } finally {
      setActionPending(null);
    }
  }

  async function handleShareReissue() {
    if (!reissueResult) return;

    try {
      const method = await shareHeroInvite({
        inviteUrl: reissueResult.inviteUrl,
        plantDisplayName: reissueResult.plantDisplayName,
      });

      if (method === "clipboard") {
        setCopiedReissue(true);
      }
    } catch {
      setError("카카오톡 공유 또는 링크 복사에 실패했습니다.");
    }
  }

  async function handleCopyReissue() {
    if (!reissueResult) return;

    try {
      await navigator.clipboard.writeText(reissueResult.inviteUrl);
      setCopiedReissue(true);
    } catch {
      setError("새 초대 링크 복사에 실패했습니다.");
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">발전소 참여 현황을 불러오고 있습니다…</p>
      </section>
    );
  }

  return (
    <section className="manager-page" aria-labelledby="manager-title">
      <header className="panel manager-header">
        <p className="eyebrow">Plant Manager</p>
        <h2 id="manager-title">발전소 참여 현황</h2>
        <p className="muted">
          개인 HP·선택·엔딩·5대 학습행동 지표는 담당자 화면에 표시하지 않습니다.
        </p>
      </header>

      {error ? (
        <section className="panel">
          <p className="error-text" role="alert">{error}</p>
        </section>
      ) : null}

      <div className="manager-summary" aria-label="참여 요약">
        <article>
          <span>등록 인원</span>
          <strong>{summary.accepted}</strong>
        </article>
        <article>
          <span>활성 인원</span>
          <strong>{summary.active}</strong>
        </article>
        <article>
          <span>대기 초대</span>
          <strong>{summary.pending}</strong>
        </article>
        <article>
          <span>1장 이상 완료</span>
          <strong>{summary.completedUsers}</strong>
        </article>
      </div>

      <ManagerInvitePanel onChanged={() => loadDashboard(true)} />

      <section className="panel manager-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Participation</p>
            <h3>사용자 관리</h3>
          </div>
          <span className="privacy-badge">점수 비노출</span>
        </div>

        <p className="muted mini-copy">
          완료 장 수와 최근 활동만 확인합니다. 개인 HP·선택·엔딩은 표시하지 않습니다.
        </p>
        {uncertainNicknameIds.length > 0 ? (
          <div className="invite-result-box" role="alert">
            <strong>닉네임 강제 초기화 결과 확인 필요</strong>
            <p className="muted">
              서버에서 이미 닉네임이 변경됐을 수 있습니다. 명단을 다시 읽어 변경된
              닉네임을 대조한 후 추가 요청을 진행해주세요.
            </p>
            <button
              type="button"
              className="secondary-button compact-button"
              disabled={actionPending !== null}
              onClick={() => void reconcileNicknameReset()}
            >
              닉네임 명단 재조회 · 잠금 해제
            </button>
          </div>
        ) : null}
        {uncertainPlayerIds.length > 0 ? (
          <div className="invite-result-box" role="alert">
            <strong>Player 상태 변경 결과 확인 필요</strong>
            <p className="muted">
              응답이 끊긴 작업은 서버에서 이미 완료됐을 수 있습니다. 표시된 명단을 재조회한 뒤
              상태를 확인하고 다음 변경을 진행해주세요.
            </p>
            <button
              type="button"
              className="secondary-button compact-button"
              disabled={actionPending !== null}
              onClick={() => void reconcilePlayerStatus()}
            >
              명단 다시 조회 · 잠금 해제
            </button>
          </div>
        ) : null}

        {participants.length === 0 ? (
          <p className="muted">아직 초대를 수락한 사용자가 없습니다.</p>
        ) : (
          <div className="manager-list">
            {participants.map((row) => (
              <article
                key={row.profile_id}
                className={row.is_active ? "manager-row" : "manager-row manager-row--inactive"}
              >
                <div>
                  <div className="manager-name-line">
                    <strong>{row.real_name}</strong>
                    <span className={row.is_active ? "status-pill status-pill--active" : "status-pill"}>
                      {row.is_active ? "활성" : "비활성"}
                    </span>
                  </div>
                  <span>
                    {row.nickname} · {row.job_role ? JOB_LABEL[row.job_role] : "직무 미지정"}
                    {row.team_name ? ` · ${row.team_name}` : ""}
                  </span>
                </div>

                <div className="manager-row-meta">
                  <strong>{Number(row.completed_scenarios)}장 완료</strong>
                  <span>{formatDateTime(row.last_activity_at)}</span>
                  <div className="inline-actions manager-inline-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={
                        actionPending !== null ||
                        uncertainNicknameIds.includes(row.profile_id)
                      }
                      onClick={() => void handleNicknameReset(row.profile_id)}
                    >
                      닉네임 초기화
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={
                        actionPending !== null ||
                        uncertainPlayerIds.includes(row.profile_id)
                      }
                      onClick={() =>
                        void handlePlayerActive(row.profile_id, !row.is_active)
                      }
                    >
                      {row.is_active ? "비활성화" : "재활성화"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel manager-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Pending</p>
            <h3>수락 대기 초대</h3>
          </div>
          <span className="count-badge">{pendingInvites.length}</span>
        </div>

        {reissueResult ? (
          <div className="invite-result-box">
            <strong>새 링크가 발급됐습니다</strong>
            <code>{reissueResult.inviteUrl}</code>
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => void handleShareReissue()}
              >
                공유
              </button>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => void handleCopyReissue()}
              >
                {copiedReissue ? "복사 완료" : "링크 복사"}
              </button>
              <button type="button" className="text-button" onClick={() => {
                setReissueResult(null);
                setCopiedReissue(false);
                setError(null);
              }}>링크 보관 완료 · 다음 발급 허용</button>
            </div>
          </div>
        ) : null}

        {uncertainReissues.length > 0 || uncertainCancellations.length > 0 ? (
          <div className="invite-result-box" role="alert">
            <strong>초대 취소·재발급 결과 확인 필요</strong>
            <p className="muted">
              처리된 초대가 이미 취소되거나 새로 발급되었을 수 있습니다.
              서버의 수락 대기 명단을 다시 조회하고 실제 결과를 대조한 뒤
              재시도 잠금을 해제해주세요. 발급한 일회용 링크는 서버에서 다시 조회할 수 없습니다.
            </p>
            <div className="inline-actions">
              <button
                type="button"
                className="secondary-button compact-button"
                disabled={actionPending !== null}
                onClick={() => void reconcileInvitationOutcomes()}
              >
                1. 초대 명단 다시 조회
              </button>
              <button
                type="button"
                className="text-button"
                disabled={actionPending !== null || !invitationReconciliationReady}
                onClick={() => confirmInvitationReconciliation()}
              >
                2. 결과 확인 완료 · 잠금 해제
              </button>
            </div>
          </div>
        ) : null}

        {pendingInvites.length === 0 ? (
          <p className="muted">현재 수락 대기 중인 초대가 없습니다.</p>
        ) : (
          <div className="manager-list">
            {pendingInvites.map((invite) => (
              <article key={invite.invitation_id} className="manager-row">
                <div>
                  <strong>{invite.invitee_name}</strong>
                  <span>
                    {invite.job_role ? JOB_LABEL[invite.job_role] : "직무 미지정"}
                    {invite.team_name ? ` · ${invite.team_name}` : ""}
                  </span>
                </div>
                <div className="manager-row-meta">
                  <span>만료 {formatDateTime(invite.expires_at)}</span>
                  <div className="inline-actions manager-inline-actions">
                    <button
                      type="button"
                      className="text-button"
                      disabled={
                        actionPending !== null ||
                        Boolean(reissueResult) ||
                        uncertainReissues.includes(invite.invitation_id) ||
                        uncertainCancellations.includes(invite.invitation_id)
                      }
                      onClick={() => void handleReissueInvite(invite.invitation_id)}
                    >
                      새 링크
                    </button>
                    <button
                      type="button"
                      className="text-button danger-text-button"
                      disabled={
                        actionPending !== null ||
                        reissueResult?.invitationId === invite.invitation_id ||
                        uncertainReissues.includes(invite.invitation_id) ||
                        uncertainCancellations.includes(invite.invitation_id)
                      }
                      onClick={() => void handleCancelInvite(invite.invitation_id)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel manager-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Aggregate</p>
            <h3>직무별 익명 집계</h3>
          </div>
          <span className="privacy-badge">n≥5만 표시</span>
        </div>

        {aggregates.length === 0 ? (
          <p className="muted">
            직무별 활성 인원이 5명 이상일 때만 집계가 표시됩니다.
          </p>
        ) : (
          <div className="aggregate-grid">
            {aggregates.map((row) => (
              <article key={row.job_role} className="aggregate-card">
                <strong>{JOB_LABEL[row.job_role]}</strong>
                <dl>
                  <div>
                    <dt>참여 인원</dt>
                    <dd>{Number(row.participant_count)}</dd>
                  </div>
                  <div>
                    <dt>완료 경험</dt>
                    <dd>{Number(row.completed_user_count)}</dd>
                  </div>
                  <div>
                    <dt>완료 세션</dt>
                    <dd>{Number(row.completed_session_count)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
