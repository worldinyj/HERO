import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "../../lib/supabase";

interface RecordRow {
  season_id: string;
  season_key: string;
  season_title: string;
  season_status: "open" | "closed" | "scheduled";
  scenario_slug: string;
  scenario_title: string;
  best_session_id: string;
  best_hp_point: number;
  best_ending: string;
  best_metrics: Record<string, number> | null;
  attempt_count: number;
  last_completed_at: string | null;
}

const METRICS = [
  ["safety", "Safety"],
  ["awareness", "Awareness"],
  ["communication", "Communication"],
  ["procedure", "Procedure"],
  ["challenge", "Challenge"],
] as const;

const ENDING_LABEL: Record<string, string> = {
  safe_complete: "무사고 완수",
  safe_stop: "안전 정지",
  near_miss: "근접오류",
  event: "사건",
};

export function MyRecordsPage() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [seasonId, setSeasonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = getSupabase();
        const { data, error: viewError } = await supabase
          .from("v_my_season_records")
          .select("*")
          .order("season_key", { ascending: false })
          .order("scenario_slug", { ascending: true });

        if (viewError) throw viewError;
        if (!active) return;

        const next = (data ?? []) as RecordRow[];
        setRecords(next);
        setSeasonId((current) => current || next[0]?.season_id || "");
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "내 기록을 불러오지 못했습니다.");
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

  const seasons = useMemo(() => {
    const map = new Map<string, { id: string; title: string; key: string; status: string }>();

    for (const row of records) {
      if (!map.has(row.season_id)) {
        map.set(row.season_id, {
          id: row.season_id,
          title: row.season_title,
          key: row.season_key,
          status: row.season_status,
        });
      }
    }

    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [records]);

  const selectedRecords = records.filter((row) => row.season_id === seasonId);

  const metricProfile = useMemo(() => {
    const result: Record<string, number> = {};

    for (const [key] of METRICS) {
      const values = selectedRecords
        .map((row) => row.best_metrics?.[key])
        .filter((value): value is number => typeof value === "number");

      result[key] =
        values.length > 0
          ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
          : 0;
    }

    return result;
  }, [selectedRecords]);

  return (
    <section className="records-page" aria-labelledby="records-title">
      <div className="records-heading">
        <div>
          <p className="eyebrow">My Learning Record</p>
          <h2 id="records-title">내 기록</h2>
        </div>

        {seasons.length > 0 ? (
          <select
            className="season-select"
            value={seasonId}
            onChange={(event) => setSeasonId(event.target.value)}
            aria-label="내 기록 시즌 선택"
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {season.title + (season.status === "open" ? " · 진행중" : "")}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <p className="leaderboard-policy">
        아래 값은 본인 학습을 위한 행동 지표이며 개인 능력·적성·인사평가 지표가 아닙니다.
      </p>

      {error ? <p className="error-text" role="alert">{error}</p> : null}

      {loading ? (
        <div className="panel"><p className="muted">기록을 불러오고 있습니다…</p></div>
      ) : selectedRecords.length === 0 ? (
        <div className="panel">
          <h3>아직 경쟁 시나리오 기록이 없습니다</h3>
          <p className="muted">0장 튜토리얼은 리더보드와 내 HP 기록에 반영되지 않습니다.</p>
        </div>
      ) : (
        <>
          <article className="panel">
            <p className="eyebrow">5 learning behaviors</p>
            <h3>학습행동 프로필</h3>
            <div className="metric-list">
              {METRICS.map(([key, label]) => (
                <div key={key} className="metric-row">
                  <span>{label}</span>
                  <div className="metric-track" aria-hidden="true">
                    <span style={{ width: String(metricProfile[key] ?? 0) + "%" }} />
                  </div>
                  <strong>{metricProfile[key] ?? 0}</strong>
                </div>
              ))}
            </div>
          </article>

          <div className="record-list">
            {selectedRecords.map((row) => (
              <article key={row.scenario_slug} className="record-card">
                <div>
                  <p className="eyebrow">{row.scenario_slug.toUpperCase()}</p>
                  <h3>{row.scenario_title}</h3>
                </div>
                <div className="record-stats">
                  <div><span>최고 HP</span><strong>{row.best_hp_point}</strong></div>
                  <div><span>최고 엔딩</span><strong>{ENDING_LABEL[row.best_ending] ?? row.best_ending}</strong></div>
                  <div><span>시도</span><strong>{row.attempt_count}회</strong></div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
