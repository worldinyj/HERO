import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../../lib/supabase";

interface ParticipationRow {
  profile_id: string;
  real_name: string;
  nickname: string;
  job_role: string | null;
  team_name: string | null;
  is_active: boolean;
  completed_scenario_count: number;
  last_activity_at: string | null;
}

interface AggregateRow {
  job_role: string | null;
  participant_count: number;
  completed_user_count: number;
  completion_rate_percent: number;
  completed_scenario_total: number;
}

const JOB_LABEL: Record<string, string> = {
  sro: "SRO",
  ro: "RO",
  field_operator: "현장운전원",
  supervisor: "감독",
  worker: "작업자",
};

const JOB_OPTIONS = [
  ["sro", "SRO"],
  ["ro", "RO"],
  ["field_operator", "현장운전원"],
  ["supervisor", "감독"],
  ["worker", "작업자"],
] as const;

export function ManagerPage() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<ParticipationRow[]>([]);
  const [aggregates, setAggregates] = useState<AggregateRow[]>([]);
  const [inviteeName, setInviteeName] = useState("");
  const [jobRole, setJobRole] = useState("worker");
  const [teamName, setTeamName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pendingInvite, setPendingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [participationResult, aggregateResult] = await Promise.all([
      supabase
        .from("v_manager_participation")
        .select("*")
        .order("real_name", { ascending: true }),
      supabase
        .from("v_manager_participation_aggregate")
        .select("*")
        .order("job_role", { ascending: true }),
    ]);

    if (participationResult.error) throw participationResult.error;
    if (aggregateResult.error) throw aggregateResult.error;

    setRows((participationResult.data ?? []) as ParticipationRow[]);
    setAggregates((aggregateResult.data ?? []) as AggregateRow[]);
  }, []);

  useEffect(() => {
    void load().catch((cause) => {
      setError(cause instanceof Error ? cause.message : "참여현황을 불러오지 못했습니다.");
    });
  }, [load]);

  async function createInvite() {
    if (!profile?.plant_id || !inviteeName.trim()) return;

    try {
      setPendingInvite(true);
      setError(null);
      setInviteUrl(null);
      setCopied(false);

      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke(
        "create-invite",
        {
          body: {
            plantId: profile.plant_id,
            targetRole: "player",
            inviteeName: inviteeName.trim(),
            jobRole,
            teamName: teamName.trim() || undefined,
          },
        },
      );

      if (invokeError) throw invokeError;

      const result = data as { inviteUrl?: string; error?: string };
      if (!result.inviteUrl) {
        throw new Error(result.error ?? "초대 링크를 생성하지 못했습니다.");
      }

      setInviteUrl(result.inviteUrl);
      setInviteeName("");
      setTeamName("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "초대 링크를 생성하지 못했습니다.");
    } finally {
      setPendingInvite(false);
    }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
  }

  async function shareInvite() {
    if (!inviteUrl) return;

    if (navigator.share) {
      await navigator.share({
        title: "HERO 초대장",
        text: "HERO 학습 게임 초대 링크입니다.",
        url: inviteUrl,
      });
      return;
    }

    await copyInvite();
  }

  const activeCount = rows.filter((row) => row.is_active).length;
  const completedCount = rows.filter(
    (row) => row.completed_scenario_count > 0,
  ).length;

  return (
    <section className="manager-page" aria-labelledby="manager-title">
      <div>
        <p className="eyebrow">Plant Manager</p>
        <h2 id="manager-title">발전소 참여현황</h2>
        <p className="muted">
          개인 점수·엔딩·선택·5대 지표는 담당자 화면에 표시되지 않습니다.
        </p>
      </div>

      <div className="manager-summary">
        <article>
          <span>활성 사용자</span>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <span>1장 이상 완료</span>
          <strong>{completedCount}</strong>
        </article>
      </div>

      <article className="panel manager-invite">
        <div>
          <p className="eyebrow">Invite</p>
          <h3>사용자 초대</h3>
        </div>

        <label>
          <span>이름</span>
          <input
            value={inviteeName}
            onChange={(event) => setInviteeName(event.target.value)}
            placeholder="홍길동"
          />
        </label>

        <label>
          <span>직무</span>
          <select value={jobRole} onChange={(event) => setJobRole(event.target.value)}>
            {JOB_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>팀 · 부서(선택)</span>
          <input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value)}
            placeholder="운영1팀"
          />
        </label>

        <button
          type="button"
          className="primary-button"
          disabled={pendingInvite || !inviteeName.trim()}
          onClick={createInvite}
        >
          {pendingInvite ? "생성 중…" : "초대 링크 생성"}
        </button>

        {inviteUrl ? (
          <div className="invite-result">
            <p>1회용 · 7일 유효 초대 링크가 생성되었습니다.</p>
            <div className="invite-result-actions">
              <button type="button" className="secondary-button" onClick={copyInvite}>
                {copied ? "복사됨" : "링크 복사"}
              </button>
              <button type="button" className="primary-button" onClick={shareInvite}>
                카카오톡/공유
              </button>
            </div>
          </div>
        ) : null}
      </article>

      {aggregates.length > 0 ? (
        <article className="panel">
          <p className="eyebrow">Anonymous aggregate · n≥5</p>
          <h3>직무별 참여 집계</h3>
          <div className="aggregate-grid">
            {aggregates.map((item) => (
              <div key={item.job_role ?? "unknown"} className="aggregate-card">
                <strong>{item.job_role ? JOB_LABEL[item.job_role] ?? item.job_role : "미지정"}</strong>
                <span>{item.completed_user_count}/{item.participant_count}명 참여</span>
                <span>{item.completion_rate_percent}% · 완료 {item.completed_scenario_total}장</span>
              </div>
            ))}
          </div>
        </article>
      ) : (
        <p className="muted small-copy">
          직무별 집계는 해당 그룹이 5명 이상일 때만 표시됩니다.
        </p>
      )}

      {error ? <p className="error-text" role="alert">{error}</p> : null}

      <article className="panel">
        <p className="eyebrow">Participation only</p>
        <h3>사용자 현황</h3>
        <div className="participant-list">
          {rows.map((row) => (
            <div key={row.profile_id} className="participant-row">
              <div>
                <strong>{row.real_name}</strong>
                <small>
                  {row.nickname} · {row.job_role ? JOB_LABEL[row.job_role] ?? row.job_role : "직무 미지정"}
                  {row.team_name ? " · " + row.team_name : ""}
                </small>
              </div>
              <div className="participant-progress">
                <strong>{row.completed_scenario_count}장</strong>
                <small>
                  {row.last_activity_at
                    ? new Date(row.last_activity_at).toLocaleDateString("ko-KR")
                    : "활동 없음"}
                </small>
              </div>
            </div>
          ))}
          {rows.length === 0 ? <p className="muted">등록된 사용자가 없습니다.</p> : null}
        </div>
      </article>
    </section>
  );
}
