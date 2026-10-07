import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getSupabase } from "../../lib/supabase";
import { AudioSettings } from "../audio/AudioSettings";
import { useAuth } from "../auth/AuthContext";

interface LearningMetrics {
  safety: number;
  awareness: number;
  communication: number;
  procedure: number;
  challenge: number;
  completed_sessions: number;
}

interface ProfileSummary {
  nickname?: string;
  real_name?: string;
  job_role?: string | null;
  role?: string;
  team_name?: string | null;
}

interface ScenarioRecord {
  scenario_slug: string;
  title: string;
  best_hp: number;
  play_count: number;
  last_completed_at: string;
}

interface SeasonRecord {
  season_key: string;
  title: string;
  hp_point: number;
  scenario_count: number;
  status: "scheduled" | "open" | "closed";
  starts_at: string;
  ends_at: string;
}

interface CurrentSeason {
  season_key: string;
  season_title: string;
  hp_point: number;
  scenario_count: number;
  overall_rank: number;
  overall_top_percent: number;
  plant_rank: number;
  job_rank: number;
}

interface MyRecordSummary {
  profile: ProfileSummary;
  metrics: LearningMetrics;
  scenario_records: ScenarioRecord[];
  season_history: SeasonRecord[];
  current_season: CurrentSeason | null;
}

interface NicknameStatus {
  canChange: boolean;
  resetRequired: boolean;
  changedThisSeason: boolean;
  seasonKey: string | null;
  seasonTitle?: string | null;
  nickname?: string;
  reason?: string | null;
}

const NICKNAME_ERROR_LABEL: Record<string, string> = {
  nickname_length: "닉네임은 2~12자로 입력해주세요.",
  nickname_characters: "닉네임은 한글·영문·숫자만 사용할 수 있습니다.",
  nickname_forbidden: "사용할 수 없는 단어가 포함되어 있습니다.",
  nickname_taken: "이미 사용 중인 닉네임입니다.",
  nickname_change_limit_reached: "이번 시즌의 닉네임 변경 기회를 이미 사용했습니다.",
  no_open_season: "현재 열린 시즌이 없어 닉네임을 변경할 수 없습니다.",
};

const METRIC_LABELS: Array<[keyof Omit<LearningMetrics, "completed_sessions">, string]> = [
  ["safety", "Safety"],
  ["awareness", "Awareness"],
  ["communication", "Communication"],
  ["procedure", "Procedure"],
  ["challenge", "Challenge"],
];

const JOB_LABEL: Record<string, string> = {
  sro: "SRO",
  ro: "RO",
  field_operator: "현장운전원",
  supervisor: "감독",
  worker: "작업자",
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function ProfilePage() {
  const { profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<MyRecordSummary | null>(null);
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus | null>(null);
  const [newNickname, setNewNickname] = useState("");
  const [nicknameCheck, setNicknameCheck] = useState<{
    checking: boolean;
    available: boolean;
    error: string | null;
  } | null>(null);
  const [nicknamePending, setNicknamePending] = useState(false);
  const [nicknameMessage, setNicknameMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signOutPending, setSignOutPending] = useState(false);

  const loadNicknameStatus = useCallback(async () => {
    if (profile?.role !== "player") {
      setNicknameStatus(null);
      return;
    }

    const supabase = getSupabase();
    const { data: result, error: invokeError } = await supabase.functions.invoke(
      "nickname-action",
      { body: { action: "status" } },
    );

    if (invokeError) throw invokeError;
    setNicknameStatus(result as NicknameStatus);
  }, [profile?.role]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const supabase = getSupabase();
        const { data: result, error: rpcError } = await supabase.rpc(
          "my_record_summary",
        );

        if (rpcError) throw rpcError;
        if (active) setData(result as MyRecordSummary);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "내 기록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadNicknameStatus().catch((cause) => {
      setNicknameMessage(
        cause instanceof Error
          ? cause.message
          : "닉네임 정책을 불러오지 못했습니다.",
      );
    });
  }, [loadNicknameStatus]);

  useEffect(() => {
    if (profile?.role !== "player") {
      setNicknameCheck(null);
      return;
    }

    const value = newNickname.trim();
    if (Array.from(value).length < 2) {
      setNicknameCheck(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setNicknameCheck({ checking: true, available: false, error: null });
          const supabase = getSupabase();
          const { data: result, error: invokeError } = await supabase.functions.invoke(
            "nickname-action",
            { body: { action: "check", nickname: value } },
          );

          if (invokeError) throw invokeError;
          if (!active) return;

          const response = result as {
            available?: boolean;
            error?: string | null;
          };

          setNicknameCheck({
            checking: false,
            available: response.available === true,
            error: response.error ?? null,
          });
        } catch {
          if (active) {
            setNicknameCheck({
              checking: false,
              available: false,
              error: "nickname_check_failed",
            });
          }
        }
      })();
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [newNickname, profile?.role]);

  const strongestMetric = useMemo(() => {
    if (!data) return null;

    return METRIC_LABELS.reduce((best, entry) =>
      Number(data.metrics[entry[0]]) > Number(data.metrics[best[0]])
        ? entry
        : best,
    );
  }, [data]);

  async function handleSignOut() {
    try {
      setSignOutPending(true);
      await signOut();
      navigate("/login", { replace: true });
    } finally {
      setSignOutPending(false);
    }
  }

  async function handleNicknameChange() {
    if (!newNickname.trim() || nicknameCheck?.available !== true) return;

    try {
      setNicknamePending(true);
      setNicknameMessage(null);
      const supabase = getSupabase();
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "nickname-action",
        {
          body: {
            action: "change-self",
            nickname: newNickname.trim(),
          },
        },
      );

      if (invokeError) throw invokeError;

      const response = result as {
        changed?: boolean;
        nickname?: string;
        error?: string;
      };

      if (response.error) {
        throw new Error(
          NICKNAME_ERROR_LABEL[response.error] ?? response.error,
        );
      }

      const nextNickname = response.nickname;
      if (nextNickname) {
        setData((current) =>
          current
            ? {
                ...current,
                profile: {
                  ...current.profile,
                  nickname: nextNickname,
                },
              }
            : current,
        );
      }

      setNewNickname("");
      setNicknameCheck(null);
      setNicknameMessage(
        response.changed === false
          ? "현재 닉네임과 같습니다."
          : "닉네임이 변경되었습니다.",
      );
      await refreshProfile();
      await loadNicknameStatus();
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : "닉네임 변경에 실패했습니다.";
      setNicknameMessage(NICKNAME_ERROR_LABEL[raw] ?? raw);
    } finally {
      setNicknamePending(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">내 학습 기록을 불러오고 있습니다…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="panel">
        <p className="eyebrow">My Record</p>
        <h2>내 기록을 불러오지 못했습니다</h2>
        <p className="error-text">{error ?? "데이터가 없습니다."}</p>
      </section>
    );
  }

  const hasSessions = Number(data.metrics.completed_sessions) > 0;

  return (
    <section className="profile-page" aria-labelledby="profile-title">
      <header className="panel profile-header">
        <p className="eyebrow">My HERO</p>
        <h2 id="profile-title">{data.profile.nickname ?? "HERO 사용자"}</h2>
        <p className="muted">
          {data.profile.job_role
            ? JOB_LABEL[data.profile.job_role] ?? data.profile.job_role
            : "직무 미지정"}
          {data.profile.team_name ? ` · ${data.profile.team_name}` : ""}
        </p>
        <p className="notice">
          아래 수치는 학습 과정의 행동 경향을 돌아보기 위한 개인용 지표입니다.
          개인 능력·적성·인사평가 지표가 아닙니다.
        </p>
        <button
          type="button"
          className="secondary-button"
          disabled={signOutPending}
          onClick={() => void handleSignOut()}
        >
          {signOutPending ? "로그아웃 중…" : "로그아웃"}
        </button>
      </header>

      {data.profile.role === "player" ? (
        <section className="panel profile-section nickname-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Nickname</p>
              <h3>리더보드 닉네임</h3>
            </div>
            <span className="count-badge">
              {nicknameStatus?.resetRequired
                ? "재설정 필요"
                : nicknameStatus?.canChange
                  ? "변경 가능"
                  : "변경 완료"}
            </span>
          </div>

          {nicknameStatus?.resetRequired ? (
            <p className="validation-box validation-box--error">
              담당자에 의해 닉네임이 초기화되었습니다. 새 닉네임을 설정해주세요.
              이 재설정은 시즌 1회 변경 제한과 별도로 허용됩니다.
            </p>
          ) : (
            <p className="muted mini-copy">
              활성 시즌당 1회 변경할 수 있습니다.
              {nicknameStatus?.seasonTitle ? ` 현재: ${nicknameStatus.seasonTitle}` : ""}
            </p>
          )}

          <div className="nickname-form">
            <label>
              <span>새 닉네임</span>
              <input
                value={newNickname}
                onChange={(event) => setNewNickname(event.target.value)}
                minLength={2}
                maxLength={12}
                placeholder="2~12자 · 한글/영문/숫자"
                disabled={nicknameStatus?.canChange === false}
              />
            </label>
            <span
              className={
                nicknameCheck?.available
                  ? "nickname-check nickname-check--ok"
                  : "nickname-check"
              }
            >
              {nicknameCheck?.checking
                ? "사용 가능 여부 확인 중…"
                : nicknameCheck?.available
                  ? "사용 가능한 닉네임입니다."
                  : nicknameCheck?.error
                    ? NICKNAME_ERROR_LABEL[nicknameCheck.error] ??
                      "닉네임을 확인해주세요."
                    : nicknameStatus?.canChange === false
                      ? "이번 시즌 변경 기회를 이미 사용했습니다."
                      : "리더보드에는 이 닉네임만 공개됩니다."}
            </span>
            <button
              type="button"
              className="primary-button"
              disabled={
                nicknamePending ||
                nicknameStatus?.canChange !== true ||
                nicknameCheck?.available !== true
              }
              onClick={() => void handleNicknameChange()}
            >
              {nicknamePending ? "변경 중…" : "닉네임 변경"}
            </button>
          </div>

          {nicknameMessage ? (
            <p className="notice" role="status">{nicknameMessage}</p>
          ) : null}
        </section>
      ) : null}

      <AudioSettings />

      {data.current_season ? (
        <section className="profile-season-card" aria-label="현재 시즌">
          <div>
            <span>{data.current_season.season_title}</span>
            <strong>{Number(data.current_season.hp_point).toLocaleString()} HP</strong>
          </div>
          <div className="profile-rank">
            <strong>#{Number(data.current_season.overall_rank)}</strong>
            <span>상위 {Number(data.current_season.overall_top_percent)}%</span>
          </div>
        </section>
      ) : null}

      <section className="panel profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Learning Behavior</p>
            <h3>5대 학습행동 지표</h3>
          </div>
          <span className="count-badge">{Number(data.metrics.completed_sessions)}회</span>
        </div>

        {!hasSessions ? (
          <p className="muted">
            경쟁 시나리오를 완료하면 학습행동 프로필이 여기에 표시됩니다.
          </p>
        ) : (
          <>
            <div className="metric-bars">
              {METRIC_LABELS.map(([key, label]) => {
                const value = Math.max(0, Math.min(100, Number(data.metrics[key])));
                return (
                  <div key={key} className="metric-row">
                    <div className="metric-label">
                      <span>{label}</span>
                      <strong>{Math.round(value)}</strong>
                    </div>
                    <div
                      className="metric-track"
                      role="progressbar"
                      aria-label={label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(value)}
                    >
                      <span style={{ width: `${value}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {strongestMetric ? (
              <p className="profile-insight">
                이번 기록에서 상대적으로 가장 자주 나타난 학습행동은
                <strong> {strongestMetric[1]}</strong>입니다. 다른 지표와 함께
                균형 있게 돌아보세요.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="panel profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Best Records</p>
            <h3>장별 최고 기록</h3>
          </div>
        </div>

        {data.scenario_records.length === 0 ? (
          <p className="muted">아직 완료한 경쟁 시나리오가 없습니다.</p>
        ) : (
          <div className="record-list">
            {data.scenario_records.map((record) => (
              <article key={record.scenario_slug} className="record-row">
                <div>
                  <strong>{record.title}</strong>
                  <span>
                    {Number(record.play_count)}회 완료 · 최근 {formatDate(record.last_completed_at)}
                  </span>
                </div>
                <strong>{Number(record.best_hp)} HP</strong>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel profile-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Season History</p>
            <h3>시즌 이력</h3>
          </div>
        </div>

        {data.season_history.length === 0 ? (
          <p className="muted">시즌 기록이 아직 없습니다.</p>
        ) : (
          <div className="record-list">
            {data.season_history.map((season) => (
              <article key={season.season_key} className="record-row">
                <div>
                  <strong>{season.title}</strong>
                  <span>{Number(season.scenario_count)}개 시나리오</span>
                </div>
                <strong>{Number(season.hp_point).toLocaleString()} HP</strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
