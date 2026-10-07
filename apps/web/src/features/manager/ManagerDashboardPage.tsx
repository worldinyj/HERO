import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { ManagerInvitePanel } from "./ManagerInvitePanel";

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
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = getSupabase();

      const [participation, pending, aggregate] = await Promise.all([
        supabase.rpc("manager_player_rows"),
        supabase.rpc("manager_pending_invites"),
        supabase.rpc("manager_job_aggregates"),
      ]);

      const firstError = participation.error ?? pending.error ?? aggregate.error;
      if (firstError) throw firstError;

      setParticipants((participation.data ?? []) as ParticipationRow[]);
      setPendingInvites((pending.data ?? []) as PendingInviteRow[]);
      setAggregates((aggregate.data ?? []) as AggregateRow[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "발전소 참여 현황을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
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
    const { data, error: invokeError } = await supabase.functions.invoke(
      "manager-user-action",
      { body },
    );

    if (invokeError) throw invokeError;

    const result = data as Record<string, unknown> & { error?: string };
    if (result.error) throw new Error(result.error);
    return result;
  }

  async function handleCancelInvite(invitationId: string) {
    try {
      setActionPending(`invite:${invitationId}`);
      setError(null);
      setReissueResult(null);
      await invokeManagerAction({
        action: "cancel-invite",
        invitationId,
      });
      await loadDashboard();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "초대 취소에 실패했습니다.");
    } finally {
      setActionPending(null);
    }
  }

  async function handleReissueInvite(invitationId: string) {
    try {
      setActionPending(`invite:${invitationId}`);
      setError(null);
      setCopiedReissue(false);
      const result = await invokeManagerAction({
        action: "reissue-invite",
        invitationId,
      });

      setReissueResult(result as unknown as ReissueResult);
      await loadDashboard();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "새 초대 링크 생성에 실패했습니다.",
      );
    } finally {
      setActionPending(null);
    }
  }

  async function handleNicknameReset(profileId: string) {
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

      const result = data as { reset?: boolean; error?: string };
      if (!result.reset) {
        throw new Error(result.error ?? "닉네임 초기화에 실패했습니다.");
      }

      await loadDashboard();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "닉네임 초기화에 실패했습니다.",
      );
    } finally {
      setActionPending(null);
    }
  }

  async function handlePlayerActive(profileId: string, isActive: boolean) {
    try {
      setActionPending(`player:${profileId}`);
      setError(null);
      await invokeManagerAction({
        action: "set-player-active",
        profileId,
        isActive,
      });
      await loadDashboard();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "사용자 상태 변경에 실패했습니다.",
      );
    } finally {
      setActionPending(null);
    }
  }

  async function handleShareReissue() {
    if (!reissueResult) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "HERO 초대장",
          text: `${reissueResult.plantDisplayName} HERO 교육 초대장입니다.`,
          url: reissueResult.inviteUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(reissueResult.inviteUrl);
      setCopiedReissue(true);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("공유 또는 링크 복사에 실패했습니다.");
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

      <ManagerInvitePanel onChanged={() => void loadDashboard()} />

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
                        actionPending === `nickname:${row.profile_id}` ||
                        actionPending === `player:${row.profile_id}`
                      }
                      onClick={() => void handleNicknameReset(row.profile_id)}
                    >
                      닉네임 초기화
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      disabled={
                        actionPending === `player:${row.profile_id}` ||
                        actionPending === `nickname:${row.profile_id}`
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
                      disabled={actionPending === `invite:${invite.invitation_id}`}
                      onClick={() => void handleReissueInvite(invite.invitation_id)}
                    >
                      새 링크
                    </button>
                    <button
                      type="button"
                      className="text-button danger-text-button"
                      disabled={actionPending === `invite:${invite.invitation_id}`}
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
