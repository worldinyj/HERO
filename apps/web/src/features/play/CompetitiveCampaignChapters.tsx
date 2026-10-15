import { useEffect, useState } from "react";
import { Link } from "react-router";
import { preloadBriefingRoute } from "../../app/routeModules";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";

interface CompetitiveChapter {
  slug: string;
  title: string;
  version: number;
  perspectiveRole: string;
}

const ROLE_LABEL: Record<string, string> = {
  sro: "SRO", ro: "RO", field_operator: "현장운전원", supervisor: "감독자", worker: "작업자",
};

export function CompetitiveCampaignChapters() {
  const { profile } = useAuth();
  const [chapters, setChapters] = useState<CompetitiveChapter[]>([]);
  const [loading, setLoading] = useState(profile?.role === "player");
  const [error, setError] = useState<string | null>(null);
  const [seasonTitle, setSeasonTitle] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (profile?.role !== "player" || profile.is_active !== true) {
      setChapters([]);
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);
      setChapters([]);
      setSeasonTitle(null);

      try {
        const supabase = getSupabase();
        const now = new Date().toISOString();

        const { data: season, error: seasonError } = await supabase
          .from("seasons")
          .select("id, title")
          .eq("status", "open")
          .lte("starts_at", now)
          .gt("ends_at", now)
          .order("starts_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (seasonError) throw seasonError;
        if (!season) {
          if (active) setChapters([]);
          return;
        }
        if (active) setSeasonTitle(season.title || "현재 시즌");

        const { data: bindings, error: bindingError } = await supabase
          .from("season_scenarios")
          .select("scenario_version_id")
          .eq("season_id", season.id)
          .eq("is_active", true);

        if (bindingError) throw bindingError;

        const versionIds = (bindings ?? []).map(
          (item) => String(item.scenario_version_id),
        );

        if (versionIds.length === 0) {
          if (active) setChapters([]);
          return;
        }

        const { data: versions, error: versionError } = await supabase
          .from("scenario_versions")
          .select("id, scenario_id, version, default_perspective_role")
          .in("id", versionIds)
          .eq("status", "published");

        if (versionError) throw versionError;

        const scenarioIds = (versions ?? []).map(
          (item) => String(item.scenario_id),
        );

        if (scenarioIds.length === 0) {
          if (active) setChapters([]);
          return;
        }

        const { data: scenarios, error: scenarioError } = await supabase
          .from("scenarios")
          .select("id, slug, title")
          .in("id", scenarioIds)
          .eq("is_active", true)
          .eq("is_competitive", true);

        if (scenarioError) throw scenarioError;

        const versionByScenario = new Map(
          (versions ?? []).map((item) => [
            String(item.scenario_id),
            {
              version: Number(item.version),
              perspectiveRole: String(item.default_perspective_role),
            },
          ]),
        );

        const next = (scenarios ?? [])
          .map((item) => {
            const version = versionByScenario.get(String(item.id));
            if (!version) return null;

            return {
              slug: String(item.slug),
              title: String(item.title),
              version: version.version,
              perspectiveRole: version.perspectiveRole,
            } satisfies CompetitiveChapter;
          })
          .filter((item): item is CompetitiveChapter => item !== null)
          .sort((a, b) => a.slug.localeCompare(b.slug));

        if (active) setChapters(next);
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : "경쟁 시나리오를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [profile?.id, profile?.is_active, profile?.role, attempt]);

  if (profile?.role !== "player") {
    return (
      <article className="notice">
        <h3>교육 운영 계정 안내</h3>
        <p>경쟁 플레이와 순위 참여는 참여자 계정에서 이용할 수 있습니다. 이 계정에서는 튜토리얼과 탐색형 체험을 이용할 수 있습니다.</p>
        <Link className="text-link" to={profile?.role === "admin" ? "/admin/overview" : "/manager"}>
          {profile?.role === "admin" ? "운영 현황 확인" : "사업소 교육 관리"}
        </Link>
      </article>
    );
  }

  if (loading) {
    return (
      <article className="chapter-card" role="status">
        <span className="chapter-index">··</span>
        <div>
          <strong>현재 시즌 확인 중</strong>
          <p>게시된 경쟁 시나리오를 불러오고 있습니다.</p>
        </div>
      </article>
    );
  }

  if (error) {
    return <article className="notice">
      <p className="error-text" role="alert">경쟁 시나리오를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해주세요.</p>
      <button className="secondary-button" type="button" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}>경쟁 시나리오 다시 확인</button>
    </article>;
  }

  if (chapters.length > 0) {
    return (
      <>
        <p className="muted">{seasonTitle} · 경쟁 플레이</p>
        {chapters.map((chapter) => (
          <Link
            key={chapter.slug}
            className="chapter-link"
            to={`/briefing/${chapter.slug}`}
            aria-label={`${chapter.title} · ${ROLE_LABEL[chapter.perspectiveRole] ?? "참여자"} 관점 · v${chapter.version}`}
            onPointerEnter={preloadBriefingRoute}
            onPointerDown={preloadBriefingRoute}
            onFocus={preloadBriefingRoute}
          >
            <article className="chapter-card chapter-card--ready">
              <span className="chapter-index">
                경쟁
              </span>
              <div>
                <strong>{chapter.title}</strong>
                <p>
                  {ROLE_LABEL[chapter.perspectiveRole] ?? "참여자"} 관점 · v{chapter.version}
                </p>
              </div>
              <span className="chapter-action" aria-hidden="true">▶</span>
            </article>
          </Link>
        ))}
      </>
    );
  }

  return (
    <article className="notice">
      <h3>{seasonTitle ? "현재 시즌에 플레이할 수 있는 경쟁 시나리오가 없습니다" : "현재 진행 중인 경쟁 시즌이 없습니다"}</h3>
      {seasonTitle ? <p>{seasonTitle}</p> : null}
      <p>튜토리얼과 탐색형 체험은 위에서 계속 이용할 수 있습니다.</p>
    </article>
  );
}
