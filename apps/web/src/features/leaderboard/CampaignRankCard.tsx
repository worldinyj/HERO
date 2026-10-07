import { useEffect, useState } from "react";
import { Link } from "react-router";
import { loadLeaderboardPageModule } from "../../app/routeModules";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";

interface MyCurrentRankRow {
  season_id: string;
  season_key: string;
  season_title: string;
  hp_point: number;
  scenario_count: number;
  overall_rank: number | null;
  overall_top_percent: number | null;
  plant_rank: number | null;
  plant_top_percent: number | null;
  job_rank: number | null;
  job_top_percent: number | null;
}

function preloadLeaderboard() {
  void loadLeaderboardPageModule();
}

export function CampaignRankCard() {
  const { profile } = useAuth();
  const [rank, setRank] = useState<MyCurrentRankRow | null>(null);
  const [loading, setLoading] = useState(profile?.role === "player");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (profile?.role !== "player" || profile.is_active !== true) {
      setRank(null);
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      setLoading(true);
      setError(false);

      try {
        const supabase = getSupabase();
        const { data, error: rpcError } = await supabase.rpc(
          "my_current_rank",
        );

        if (rpcError) throw rpcError;
        if (!active) return;

        const rows = (data ?? []) as MyCurrentRankRow[];
        setRank(rows[0] ?? null);
      } catch {
        if (active) {
          setRank(null);
          setError(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile?.is_active, profile?.role]);

  if (profile?.role !== "player") {
    return null;
  }

  if (loading) {
    return (
      <div className="campaign-rank-card campaign-rank-card--loading" role="status">
        <span>이번 시즌 내 순위를 확인하고 있습니다…</span>
      </div>
    );
  }

  if (!rank) {
    return (
      <div className="campaign-rank-card">
        <div>
          <span className="campaign-rank-label">이번 시즌</span>
          <strong>{error ? "순위를 불러오지 못했습니다" : "아직 순위가 없습니다"}</strong>
          <small>
            {error
              ? "리더보드 화면에서 다시 확인할 수 있습니다."
              : "첫 경쟁 장을 완료하면 최고 기록이 순위에 반영됩니다."}
          </small>
        </div>
        <Link
          className="campaign-rank-link"
          to="/leaderboard"
          onPointerEnter={preloadLeaderboard}
          onPointerDown={preloadLeaderboard}
          onFocus={preloadLeaderboard}
        >
          리더보드
        </Link>
      </div>
    );
  }

  const ranked =
    rank.overall_rank !== null && rank.overall_top_percent !== null;

  return (
    <div className="campaign-rank-card" aria-label="이번 시즌 내 순위">
      <div className="campaign-rank-main">
        <span className="campaign-rank-label">{rank.season_title}</span>
        {ranked ? (
          <strong>
            전체 {rank.overall_rank}위 · 상위 {rank.overall_top_percent}%
          </strong>
        ) : (
          <strong>첫 경쟁 장 완료 전</strong>
        )}
        <small>
          {rank.hp_point.toLocaleString()} HP · {rank.scenario_count}장 반영
        </small>
      </div>

      <Link
        className="campaign-rank-link"
        to="/leaderboard"
        onPointerEnter={preloadLeaderboard}
        onPointerDown={preloadLeaderboard}
        onFocus={preloadLeaderboard}
      >
        전체 순위
      </Link>

      <p className="campaign-rank-policy">
        순위는 학습 참여 지표이며 인사평가·징계와 무관합니다.
      </p>
    </div>
  );
}
