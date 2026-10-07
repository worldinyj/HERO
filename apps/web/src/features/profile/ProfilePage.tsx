import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";

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
  const [data, setData] = useState<MyRecordSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const strongestMetric = useMemo(() => {
    if (!data) return null;

    return METRIC_LABELS.reduce((best, entry) =>
      Number(data.metrics[entry[0]]) > Number(data.metrics[best[0]])
        ? entry
        : best,
    );
  }, [data]);

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
      </header>

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
