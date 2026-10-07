import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../../lib/supabase";

type Scope = "overall" | "plant" | "job" | "plant_job";

interface SeasonRow {
  id: string;
  season_key: string;
  title: string;
  status: "scheduled" | "open" | "closed";
  starts_at: string;
  ends_at: string;
}

interface CurrentRow {
  season_id: string;
  season_key: string;
  season_title: string;
  nickname: string;
  plant_display_name: string;
  job_role: string;
  hp_point: number;
  scenario_count: number;
  overall_rank: number;
  overall_top_percent: number;
  plant_rank: number;
  plant_top_percent: number;
  job_rank: number;
  job_top_percent: number;
  plant_job_rank: number;
  plant_job_top_percent: number;
}

interface SnapshotRow {
  season_id: string;
  season_key: string;
  season_title: string;
  scope_type: Scope;
  nickname: string;
  plant_display_name: string;
  job_role: string;
  hp_point: number;
  scenario_count: number;
  rank_position: number;
  top_percent: number;
}

interface DisplayRow {
  nickname: string;
  plantDisplayName: string;
  jobRole: string;
  hpPoint: number;
  scenarioCount: number;
  rank: number;
  topPercent: number;
}

const PAGE_SIZE = 40;

const SCOPE_LABEL: Record<Scope, string> = {
  overall: "전체",
  plant: "우리 발전소",
  job: "직무",
  plant_job: "발전소×직무",
};

const JOB_LABEL: Record<string, string> = {
  sro: "SRO",
  ro: "RO",
  field_operator: "현장운전원",
  supervisor: "감독",
  worker: "작업자",
};

const CURRENT_RANK_FIELD: Record<Scope, keyof CurrentRow> = {
  overall: "overall_rank",
  plant: "plant_rank",
  job: "job_rank",
  plant_job: "plant_job_rank",
};

function mapCurrentRow(row: CurrentRow, scope: Scope): DisplayRow {
  const rank =
    scope === "overall"
      ? row.overall_rank
      : scope === "plant"
        ? row.plant_rank
        : scope === "job"
          ? row.job_rank
          : row.plant_job_rank;

  const topPercent =
    scope === "overall"
      ? row.overall_top_percent
      : scope === "plant"
        ? row.plant_top_percent
        : scope === "job"
          ? row.job_top_percent
          : row.plant_job_top_percent;

  return {
    nickname: row.nickname,
    plantDisplayName: row.plant_display_name,
    jobRole: row.job_role,
    hpPoint: row.hp_point,
    scenarioCount: row.scenario_count,
    rank,
    topPercent,
  };
}

function mapSnapshotRow(row: SnapshotRow): DisplayRow {
  return {
    nickname: row.nickname,
    plantDisplayName: row.plant_display_name,
    jobRole: row.job_role,
    hpPoint: row.hp_point,
    scenarioCount: row.scenario_count,
    rank: row.rank_position,
    topPercent: row.top_percent,
  };
}

export function LeaderboardPage() {
  const { profile } = useAuth();
  const [scope, setScope] = useState<Scope>("overall");
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [seasonId, setSeasonId] = useState<string>("");
  const [myPlantName, setMyPlantName] = useState<string | null>(null);
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [myRow, setMyRow] = useState<DisplayRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestKeyRef = useRef("");

  const selectedSeason =
    seasons.find((season) => season.id === seasonId) ?? null;

  const queryKey = useMemo(
    () =>
      [
        selectedSeason?.id ?? "",
        selectedSeason?.status ?? "",
        scope,
        myPlantName ?? "",
        profile?.job_role ?? "",
        profile?.nickname ?? "",
      ].join(":"),
    [
      selectedSeason?.id,
      selectedSeason?.status,
      scope,
      myPlantName,
      profile?.job_role,
      profile?.nickname,
    ],
  );

  useEffect(() => {
    let active = true;

    async function loadBase() {
      try {
        const supabase = getSupabase();
        const seasonPromise = supabase
          .from("seasons")
          .select("id, season_key, title, status, starts_at, ends_at")
          .in("status", ["open", "closed"])
          .order("starts_at", { ascending: false })
          .limit(24);

        const plantPromise = profile?.plant_id
          ? supabase
              .from("plants")
              .select("display_name")
              .eq("id", profile.plant_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null });

        const [{ data: seasonData, error: seasonError }, plantResult] =
          await Promise.all([seasonPromise, plantPromise]);

        if (seasonError) throw seasonError;
        if (plantResult.error) throw plantResult.error;
        if (!active) return;

        const nextSeasons = (seasonData ?? []) as SeasonRow[];
        setSeasons(nextSeasons);
        setSeasonId((current) => current || nextSeasons[0]?.id || "");
        setMyPlantName(
          plantResult.data && "display_name" in plantResult.data
            ? String(plantResult.data.display_name)
            : null,
        );
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "시즌 정보를 불러오지 못했습니다.",
          );
          setLoading(false);
        }
      }
    }

    void loadBase();

    return () => {
      active = false;
    };
  }, [profile?.plant_id]);

  const fetchPage = useCallback(
    async (
      offset: number,
      requestKey: string,
    ): Promise<DisplayRow[]> => {
      if (!selectedSeason) return [];

      const supabase = getSupabase();
      const end = offset + PAGE_SIZE - 1;

      if (selectedSeason.status === "open") {
        const rankField = CURRENT_RANK_FIELD[scope];
        let query = supabase
          .from("v_leaderboard_current_public")
          .select("*")
          .eq("season_id", selectedSeason.id);

        if (scope === "plant") {
          if (!myPlantName) return [];
          query = query.eq("plant_display_name", myPlantName);
        } else if (scope === "job") {
          if (!profile?.job_role) return [];
          query = query.eq("job_role", profile.job_role);
        } else if (scope === "plant_job") {
          if (!myPlantName || !profile?.job_role) return [];
          query = query
            .eq("plant_display_name", myPlantName)
            .eq("job_role", profile.job_role);
        }

        const { data, error: viewError } = await query
          .order(String(rankField), { ascending: true })
          .order("hp_point", { ascending: false })
          .order("nickname", { ascending: true })
          .range(offset, end);

        if (viewError) throw viewError;
        if (requestKeyRef.current !== requestKey) return [];

        return ((data ?? []) as CurrentRow[]).map((row) =>
          mapCurrentRow(row, scope),
        );
      }

      let query = supabase
        .from("v_leaderboard_snapshot_public")
        .select("*")
        .eq("season_id", selectedSeason.id)
        .eq("scope_type", scope);

      if (scope === "plant") {
        if (!myPlantName) return [];
        query = query.eq("plant_display_name", myPlantName);
      } else if (scope === "job") {
        if (!profile?.job_role) return [];
        query = query.eq("job_role", profile.job_role);
      } else if (scope === "plant_job") {
        if (!myPlantName || !profile?.job_role) return [];
        query = query
          .eq("plant_display_name", myPlantName)
          .eq("job_role", profile.job_role);
      }

      const { data, error: viewError } = await query
        .order("rank_position", { ascending: true })
        .order("hp_point", { ascending: false })
        .order("nickname", { ascending: true })
        .range(offset, end);

      if (viewError) throw viewError;
      if (requestKeyRef.current !== requestKey) return [];

      return ((data ?? []) as SnapshotRow[]).map(mapSnapshotRow);
    },
    [
      selectedSeason,
      scope,
      myPlantName,
      profile?.job_role,
    ],
  );

  const fetchMyRow = useCallback(
    async (requestKey: string): Promise<DisplayRow | null> => {
      if (!selectedSeason || !profile?.nickname) return null;

      const supabase = getSupabase();

      if (selectedSeason.status === "open") {
        const { data, error: viewError } = await supabase
          .from("v_leaderboard_current_public")
          .select("*")
          .eq("season_id", selectedSeason.id)
          .eq("nickname", profile.nickname)
          .limit(1)
          .maybeSingle();

        if (viewError) throw viewError;
        if (requestKeyRef.current !== requestKey || !data) return null;

        return mapCurrentRow(data as CurrentRow, scope);
      }

      const { data, error: viewError } = await supabase
        .from("v_leaderboard_snapshot_public")
        .select("*")
        .eq("season_id", selectedSeason.id)
        .eq("scope_type", scope)
        .eq("nickname", profile.nickname)
        .limit(1)
        .maybeSingle();

      if (viewError) throw viewError;
      if (requestKeyRef.current !== requestKey || !data) return null;

      return mapSnapshotRow(data as SnapshotRow);
    },
    [selectedSeason, scope, profile?.nickname],
  );

  useEffect(() => {
    if (!selectedSeason) {
      setRows([]);
      setMyRow(null);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const requestKey = queryKey;
    requestKeyRef.current = requestKey;
    let active = true;

    setRows([]);
    setMyRow(null);
    setHasMore(false);
    setLoading(true);
    setLoadingMore(false);
    setError(null);

    void (async () => {
      try {
        const [firstPage, ownRow] = await Promise.all([
          fetchPage(0, requestKey),
          fetchMyRow(requestKey),
        ]);

        if (!active || requestKeyRef.current !== requestKey) return;

        setRows(firstPage);
        setMyRow(ownRow);
        setHasMore(firstPage.length === PAGE_SIZE);
      } catch (cause) {
        if (active && requestKeyRef.current === requestKey) {
          setError(
            cause instanceof Error
              ? cause.message
              : "리더보드를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (active && requestKeyRef.current === requestKey) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [selectedSeason, queryKey, fetchPage, fetchMyRow]);

  const loadMore = useCallback(async () => {
    if (
      loading ||
      loadingMore ||
      !hasMore ||
      !selectedSeason ||
      requestKeyRef.current !== queryKey
    ) {
      return;
    }

    const requestKey = queryKey;
    const offset = rows.length;
    setLoadingMore(true);

    try {
      const nextRows = await fetchPage(offset, requestKey);

      if (requestKeyRef.current !== requestKey) return;

      setRows((current) => {
        const existing = new Set(current.map((row) => row.nickname));
        return [
          ...current,
          ...nextRows.filter((row) => !existing.has(row.nickname)),
        ];
      });
      setHasMore(nextRows.length === PAGE_SIZE);
    } catch (cause) {
      if (requestKeyRef.current === requestKey) {
        setError(
          cause instanceof Error
            ? cause.message
            : "다음 순위를 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestKeyRef.current === requestKey) {
        setLoadingMore(false);
      }
    }
  }, [
    fetchPage,
    hasMore,
    loading,
    loadingMore,
    queryKey,
    rows.length,
    selectedSeason,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore || loading || loadingMore) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loading, loadingMore]);

  return (
    <section className="leaderboard-page" aria-labelledby="leaderboard-title">
      <div className="leaderboard-heading">
        <div>
          <p className="eyebrow">Monthly Season</p>
          <h2 id="leaderboard-title">리더보드</h2>
        </div>

        <select
          className="season-select"
          value={seasonId}
          onChange={(event) => setSeasonId(event.target.value)}
          aria-label="시즌 선택"
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.title + (season.status === "open" ? " · 진행중" : "")}
            </option>
          ))}
        </select>
      </div>

      <div className="scope-tabs" role="tablist" aria-label="리더보드 범위">
        {(Object.keys(SCOPE_LABEL) as Scope[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={scope === item}
            className={
              scope === item ? "scope-tab scope-tab--active" : "scope-tab"
            }
            onClick={() => setScope(item)}
          >
            {SCOPE_LABEL[item]}
          </button>
        ))}
      </div>

      <p className="leaderboard-policy">
        순위는 학습 참여를 위한 지표이며 인사평가·징계에 사용하지 않습니다.
      </p>

      {myRow ? (
        <div className="my-rank-card">
          <span>내 순위</span>
          <strong>{myRow.rank}위</strong>
          <span>
            상위 {myRow.topPercent}% · {myRow.hpPoint.toLocaleString()} HP
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="panel">
          <p className="muted">순위를 불러오고 있습니다…</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <h3>아직 순위가 없습니다</h3>
          <p className="muted">
            시나리오를 완료하면 이 시즌의 최고 기록이 반영됩니다.
          </p>
        </div>
      ) : (
        <>
          <ol
            className="leaderboard-list"
            aria-label={SCOPE_LABEL[scope] + " 순위"}
          >
            {rows.map((row, index) => {
              const mine = row.nickname === profile?.nickname;

              return (
                <li
                  key={row.nickname + ":" + row.rank + ":" + index}
                  className={
                    mine
                      ? "leaderboard-row leaderboard-row--mine"
                      : "leaderboard-row"
                  }
                >
                  <span className="rank-number">{row.rank}</span>
                  <div className="rank-identity">
                    <strong>{row.nickname}</strong>
                    <small>
                      {row.plantDisplayName} ·{" "}
                      {JOB_LABEL[row.jobRole] ?? row.jobRole}
                    </small>
                  </div>
                  <div className="rank-score">
                    <strong>{row.hpPoint.toLocaleString()}</strong>
                    <small>HP · {row.scenarioCount}장</small>
                  </div>
                </li>
              );
            })}
          </ol>

          <div
            ref={sentinelRef}
            className="leaderboard-sentinel"
            aria-hidden="true"
          />

          {hasMore ? (
            <button
              type="button"
              className="secondary-button leaderboard-more-button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "다음 순위 불러오는 중…" : "순위 더 보기"}
            </button>
          ) : (
            <p className="leaderboard-end muted" role="status">
              현재 범위의 순위를 모두 불러왔습니다.
            </p>
          )}
        </>
      )}
    </section>
  );
}
