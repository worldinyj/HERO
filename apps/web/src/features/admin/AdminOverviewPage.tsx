import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { CompanionHeading } from "../../components/CompanionHeading";
import { getSupabase } from "../../lib/supabase";
import { ReadRequestGate } from "../../lib/readRequestGate";
import { exactCount, isScenarioPlayable, operationalScenarioState, type OperationsCounts } from "./operationsOverview";
import { readSeasonOverview, type SeasonOverview } from "./seasonScenario";

const dateTime = (value: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium",
}).format(new Date(value));

export function AdminOverviewPage() {
  const gate = useRef(new ReadRequestGate());
  const [counts, setCounts] = useState<OperationsCounts | null>(null);
  const [season, setSeason] = useState<SeasonOverview | null>(null);
  const [countError, setCountError] = useState(false);
  const [seasonError, setSeasonError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  async function load() {
    const ticket = gate.current.begin();
    setLoading(true); setLoadedAt(null); setCounts(null); setSeason(null); setCountError(false); setSeasonError(false);
    let supabase: ReturnType<typeof getSupabase>;
    try { supabase = getSupabase(); }
    catch { setCountError(true); setSeasonError(true); setLoading(false); return; }
    const readCounts = async (): Promise<OperationsCounts> => {
      const results = await Promise.all([
        supabase.from("plants").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "plant_manager"),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "player"),
        supabase.from("play_sessions").select("id", { count: "exact", head: true }).eq("status", "completed"),
      ]);
      return { activePlants: exactCount(results[0]), managers: exactCount(results[1]),
        players: exactCount(results[2]), completedSessions: exactCount(results[3]) };
    };
    const readSeason = async () => {
      const result = await supabase.functions.invoke("admin-scenario", { body: { action: "season-overview" } });
      if (result.error) throw result.error;
      return readSeasonOverview(result.data);
    };
    const [countsResult, seasonResult] = await Promise.allSettled([readCounts(), readSeason()]);
    if (!gate.current.isCurrent(ticket)) return;
    const denied = seasonResult.status === "rejected" && seasonResult.reason?.context instanceof Response &&
      [401, 403].includes(seasonResult.reason.context.status);
    if (countsResult.status === "fulfilled" && !denied) setCounts(countsResult.value); else setCountError(true);
    if (seasonResult.status === "fulfilled") setSeason(seasonResult.value); else setSeasonError(true);
    setLoadedAt(new Date().toISOString()); setLoading(false);
  }
  useEffect(() => { void load(); return () => gate.current.invalidate(); }, []);

  const playable = season?.scenarios.filter(isScenarioPlayable) ?? [];
  return <section className="admin-page" aria-labelledby="operations-title">
    <header className="panel admin-header">
      <nav className="admin-subnav" aria-label="관리자 메뉴">
        <Link className="admin-subnav-link admin-subnav-link--active" aria-current="page" to="/admin/overview">운영 현황</Link>
        <Link className="admin-subnav-link" to="/admin">조직</Link>
        <Link className="admin-subnav-link" to="/admin/scenarios">시나리오</Link>
        <Link className="admin-subnav-link" to="/admin/audit">감사 이력</Link>
      </nav>
      <CompanionHeading eyebrow="Operations Overview" title="운영 현황" titleId="operations-title" />
      <p className="muted">등록 현황과 이번 시즌의 경쟁 플레이 연결 상태를 확인합니다.</p>
      <button className="secondary-button" type="button" disabled={loading} onClick={() => void load()}>현황 새로고침</button>
      <p role="status" className="muted">{loading ? "운영 현황을 불러오고 있습니다…" :
        `${countError || seasonError ? "일부 조회 실패 · " : ""}마지막 조회: ${loadedAt ? dateTime(loadedAt) : "미확인"} (한국 시간)`}</p>
    </header>
    <section className="panel" aria-labelledby="registration-title">
      <h3 id="registration-title">등록·학습 현황</h3>
      {countError ? <p className="error-text" role="alert">등록·학습 현황을 불러오지 못했습니다. 새로고침으로 다시 확인해주세요.</p> : null}
      {counts ? <dl className="operations-metrics">
        <div><dt>운영 중인 조직</dt><dd>{counts.activePlants.toLocaleString("ko-KR")}개</dd></div>
        <div><dt>등록 담당자</dt><dd>{counts.managers.toLocaleString("ko-KR")}명</dd></div>
        <div><dt>등록 사용자</dt><dd>{counts.players.toLocaleString("ko-KR")}명</dd></div>
        <div><dt>누적 완료 세션</dt><dd>{counts.completedSessions.toLocaleString("ko-KR")}건</dd></div>
      </dl> : null}
      <p className="muted mini-copy">담당자·사용자는 활성·비활성 계정을 모두 포함합니다. 완료 세션은 서버에 완료로 저장된 기록이며 재플레이도 포함합니다. 튜토리얼의 로컬 플레이는 포함하지 않습니다. 각 집계는 조회 시점에 따라 갱신됩니다.</p>
      <Link className="admin-subnav-link" to="/admin">조직·담당자 초대 관리</Link>
    </section>
    <section className="panel" aria-labelledby="season-overview-title">
      <h3 id="season-overview-title">현재 시즌</h3>
      {seasonError ? <p className="error-text" role="alert">현재 시즌을 불러오지 못했습니다. 새로고침으로 다시 확인해주세요.</p> : null}
      {season ? season.season ? <>
        <strong>{season.season.title} · {season.season.seasonKey}</strong>
        <p className="muted">{dateTime(season.season.startsAt)} ~ {dateTime(season.season.endsAt)} (한국 시간)</p>
        <p>경쟁 플레이 연결: <strong>{playable.length}개</strong> / 조회 대상 {season.scenarios.length}개</p>
        {!playable.length ? <p className="notice">현재 연결 상태로 새 경쟁 플레이를 시작할 수 있는 시나리오가 없습니다. 시나리오 관리에서 배포 버전과 시즌 연결을 확인해주세요.</p> : null}
        <div className="admin-list">{season.scenarios.map(row => <article key={row.id} className="operations-scenario">
          <strong>{row.title}</strong><p className="muted">{row.slug} · 배포 버전 {row.publishedVersion ? `v${row.publishedVersion}` : "없음"}</p>
          <p>{operationalScenarioState(row)}</p>
        </article>)}</div>
      </> : <p>현재 운영 중인 시즌이 없습니다.</p> : null}
      <Link className="admin-subnav-link" to="/admin/scenarios">시나리오·시즌 연결 관리</Link>
    </section>
    <section className="panel"><h3>변경 기록</h3><p className="muted">초대·계정·조직·시나리오 변경 이력은 감사 이력에서 확인합니다.</p>
      <Link className="admin-subnav-link" to="/admin/audit">감사 이력 확인</Link>
    </section>
  </section>;
}
