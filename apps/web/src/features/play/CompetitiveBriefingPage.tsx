import { BARRIER_CARDS } from "@hero/engine";
import { ScenarioSchema, type JobRole, type Scenario } from "@hero/schema";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  loadCompetitiveSession,
  type StoredCompetitiveSession,
} from "../../lib/competitivePersistence";
import { getSupabase } from "../../lib/supabase";
import { useAuth } from "../auth/AuthContext";

const JOB_LABEL: Record<JobRole, string> = {
  sro: "SRO",
  ro: "RO",
  field_operator: "현장운전원",
  supervisor: "감독",
  worker: "작업자",
};

interface BriefingData {
  scenario: Scenario;
  seasonKey: string;
  seasonTitle: string;
  version: number;
  resumeAvailable: boolean;
}

function situationPreview(scenario: Scenario): string {
  const start = scenario.nodes[scenario.startNode];

  if (!start) {
    return "시나리오 시작 후 상황을 확인합니다.";
  }

  if (start.type === "scene" || start.type === "event") {
    const text = start.text.trim();
    return text.length <= 180 ? text : `${text.slice(0, 177)}…`;
  }

  return "현장 상황과 주어진 정보를 확인한 뒤 첫 판단을 시작합니다.";
}

function allJobsAvailable(scenario: Scenario): boolean {
  return new Set(scenario.audienceJobs).size === 5;
}

async function loadServerBriefing(
  scenarioId: string,
): Promise<BriefingData | null> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: season, error: seasonError } = await supabase
    .from("seasons")
    .select("id, season_key, title")
    .eq("status", "open")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (seasonError) throw seasonError;
  if (!season) return null;

  const { data: scenarioRow, error: scenarioError } = await supabase
    .from("scenarios")
    .select("id, slug, title")
    .eq("slug", scenarioId)
    .eq("is_active", true)
    .eq("is_competitive", true)
    .maybeSingle();

  if (scenarioError) throw scenarioError;
  if (!scenarioRow) return null;

  const { data: bindings, error: bindingError } = await supabase
    .from("season_scenarios")
    .select("scenario_version_id")
    .eq("season_id", season.id)
    .eq("is_active", true);

  if (bindingError) throw bindingError;
  const versionIds = (bindings ?? []).map((row) =>
    String(row.scenario_version_id),
  );

  if (versionIds.length === 0) return null;

  const { data: version, error: versionError } = await supabase
    .from("scenario_versions")
    .select("id, version, content")
    .eq("scenario_id", scenarioRow.id)
    .eq("status", "published")
    .in("id", versionIds)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) throw versionError;
  if (!version) return null;

  const parsed = ScenarioSchema.safeParse(version.content);
  if (!parsed.success) {
    throw new Error("server_scenario_schema_invalid");
  }

  if (parsed.data.id !== scenarioId || parsed.data.version !== Number(version.version)) {
    throw new Error("server_scenario_identity_mismatch");
  }

  return {
    scenario: parsed.data,
    seasonKey: String(season.season_key),
    seasonTitle: String(season.title),
    version: Number(version.version),
    resumeAvailable: false,
  };
}

function fromSavedSession(saved: StoredCompetitiveSession): BriefingData {
  return {
    scenario: saved.scenario,
    seasonKey: saved.server.seasonKey,
    seasonTitle: saved.server.seasonKey,
    version: saved.scenarioVersion,
    resumeAvailable: true,
  };
}

export function CompetitiveBriefingPage({
  scenarioId,
}: {
  scenarioId: string;
}) {
  const { profile, session } = useAuth();
  const userId = session?.user.id ?? null;
  const navigate = useNavigate();
  const [data, setData] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!userId || profile?.role !== "player") {
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const saved = await loadCompetitiveSession(userId, scenarioId);

        if (!online) {
          if (active) {
            setData(saved ? fromSavedSession(saved) : null);
          }
          return;
        }

        const server = await loadServerBriefing(scenarioId);

        if (!active) return;

        if (server) {
          setData({
            ...server,
            resumeAvailable:
              saved?.server.scenarioVersionId !== undefined &&
              saved.scenarioVersion === server.version,
          });
          return;
        }

        setData(saved ? fromSavedSession(saved) : null);
      } catch (cause) {
        if (!active) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "chapter_briefing_load_failed",
        );

        const saved = await loadCompetitiveSession(userId, scenarioId);
        if (active) {
          setData(saved ? fromSavedSession(saved) : null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [online, profile?.role, scenarioId, userId]);

  const cards = useMemo(() => {
    if (!data) return [];

    return data.scenario.cards
      .map((id) => BARRIER_CARDS[id])
      .filter((card): card is NonNullable<typeof card> => card !== undefined);
  }, [data]);

  if (profile?.role !== "player") {
    return (
      <section className="briefing-page">
        <header className="briefing-backbar">
          <Link to="/">← 캠페인</Link>
        </header>
        <article className="panel">
          <p className="eyebrow">Chapter Briefing</p>
          <h2>사용자 플레이 전용 장입니다</h2>
          <p className="muted">
            발전소담당자와 관리자는 경쟁 시나리오를 플레이하지 않습니다.
          </p>
        </article>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="briefing-page">
        <header className="briefing-backbar">
          <Link to="/">← 캠페인</Link>
        </header>
        <article className="panel">
          <p className="eyebrow">Chapter Briefing</p>
          <h2>장 정보를 확인하고 있습니다</h2>
          <p className="muted">현재 시즌에 배정된 시나리오 버전을 확인합니다.</p>
        </article>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="briefing-page">
        <header className="briefing-backbar">
          <Link to="/">← 캠페인</Link>
        </header>
        <article className="panel">
          <p className="eyebrow">{online ? "Unavailable" : "Offline"}</p>
          <h2>
            {online
              ? "현재 시즌에 열려 있는 장이 아닙니다"
              : "새 경쟁 세션은 온라인 연결이 필요합니다"}
          </h2>
          <p className="muted">
            {online
              ? "관리자가 게시하고 현재 시즌에 배정한 시나리오만 시작할 수 있습니다."
              : "이미 시작해 저장된 세션이 있다면 오프라인에서도 이어갈 수 있습니다."}
          </p>
          {error ? <p className="error-text">{error}</p> : null}
        </article>
      </section>
    );
  }

  const { scenario } = data;
  const perspective = JOB_LABEL[scenario.defaultPerspectiveRole];
  const audienceText = allJobsAvailable(scenario)
    ? "모든 직무 플레이 가능"
    : scenario.audienceJobs.map((job) => JOB_LABEL[job]).join(" · ");
  const canStart = online || data.resumeAvailable;

  return (
    <section className="briefing-page" aria-labelledby="briefing-title">
      <header className="briefing-backbar">
        <Link to="/">← 캠페인</Link>
        <span>{data.seasonTitle}</span>
      </header>

      {!online ? (
        <div className="offline-banner" role="status">
          오프라인 · 새 세션은 시작할 수 없고 저장된 세션만 이어갈 수 있습니다.
        </div>
      ) : null}

      <article className="briefing-card">
        <p className="eyebrow">Chapter Briefing · v{data.version}</p>
        <h2 id="briefing-title">「{scenario.title}」</h2>

        <div className="briefing-meta" aria-label="장 기본 정보">
          <span>이번 장의 관점: <strong>{perspective}</strong></span>
          <span>⏱ 약 {scenario.estimatedMinutes}분</span>
          <span>{audienceText}</span>
        </div>

        <section className="briefing-section">
          <h3>상황</h3>
          <p>{situationPreview(scenario)}</p>
        </section>

        <section className="briefing-section">
          <h3>지급 방어막 카드</h3>
          {cards.length > 0 ? (
            <div className="briefing-card-list">
              {cards.map((card) => (
                <span key={card.id} className="briefing-card-chip">
                  {card.label}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted mini-copy">
              이 장에서는 별도 방어막 카드가 지급되지 않습니다.
            </p>
          )}
        </section>

        <p className="briefing-guardrail">
          플레이 전에는 내부 위험지수·PSF·정답으로 보일 수 있는 주제 태그를
          공개하지 않습니다. 상황을 읽고 필요한 정보를 직접 확인해보세요.
        </p>

        <button
          type="button"
          className="primary-button briefing-start"
          disabled={!canStart}
          onClick={() => navigate(`/play/${scenarioId}`)}
        >
          {data.resumeAvailable ? "이어하기" : "출발"}
        </button>

        {!canStart ? (
          <p className="muted mini-copy">
            연결이 복구되면 새 경쟁 세션을 시작할 수 있습니다.
          </p>
        ) : null}
      </article>
    </section>
  );
}
