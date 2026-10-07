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

const PLANNED_CHAPTERS = [
  {
    index: "01",
    title: "오늘 오전까지 끝내야 합니다",
    detail: "시간압박 · 단독작업 · 감독부족 · 준비중",
  },
  {
    index: "02",
    title: "아마 이 설비가 맞을 겁니다",
    detail: "설비 오인 · Self/Peer Check · 준비중",
  },
  {
    index: "03",
    title: "절차와 실제 상황이 조금 다릅니다",
    detail: "Questioning Attitude · Stop When Unsure · 준비중",
  },
] as const;

export function CompetitiveCampaignChapters() {
  const { profile } = useAuth();
  const [chapters, setChapters] = useState<CompetitiveChapter[]>([]);
  const [loading, setLoading] = useState(profile?.role === "player");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.role !== "player") {
      setChapters([]);
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabase();
        const now = new Date().toISOString();

        const { data: season, error: seasonError } = await supabase
          .from("seasons")
          .select("id")
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
  }, [profile?.role]);

  if (profile?.role !== "player") {
    return (
      <>
        {PLANNED_CHAPTERS.map((chapter) => (
          <article key={chapter.index} className="chapter-card chapter-card--locked">
            <span className="chapter-index">{chapter.index}</span>
            <div>
              <strong>{chapter.title}</strong>
              <p>{chapter.detail}</p>
            </div>
          </article>
        ))}
      </>
    );
  }

  if (loading) {
    return (
      <article className="chapter-card chapter-card--locked">
        <span className="chapter-index">··</span>
        <div>
          <strong>현재 시즌 확인 중</strong>
          <p>게시된 경쟁 시나리오를 불러오고 있습니다.</p>
        </div>
      </article>
    );
  }

  if (chapters.length > 0) {
    return (
      <>
        {chapters.map((chapter, index) => (
          <Link
            key={chapter.slug}
            className="chapter-link"
            to={`/briefing/${chapter.slug}`}
            onPointerEnter={preloadBriefingRoute}
            onPointerDown={preloadBriefingRoute}
            onFocus={preloadBriefingRoute}
          >
            <article className="chapter-card chapter-card--ready">
              <span className="chapter-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{chapter.title}</strong>
                <p>
                  경쟁 시나리오 · {chapter.perspectiveRole} 관점 · v{chapter.version}
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
    <>
      {error ? (
        <p className="error-text" role="status">
          경쟁 시나리오 조회 실패 · 준비중 장만 표시합니다.
        </p>
      ) : null}

      {PLANNED_CHAPTERS.map((chapter) => (
        <article key={chapter.index} className="chapter-card chapter-card--locked">
          <span className="chapter-index">{chapter.index}</span>
          <div>
            <strong>{chapter.title}</strong>
            <p>{chapter.detail}</p>
          </div>
        </article>
      ))}
    </>
  );
}
