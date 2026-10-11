import { useEffect, useRef, useState } from "react";
import { confirmedSeasonBinding, readSeasonOverview, seasonBindingError, seasonBindingState, type SeasonOverview, type SeasonScenario } from "./seasonScenario";
import { STATUS_LABEL } from "./scenarioStatus";

type Invoke = (body: Record<string, unknown>) => Promise<unknown>;
type Change = { season: NonNullable<SeasonOverview["season"]>; row: SeasonScenario; target: string | null };
function BindingDialog({ change, pending, error, onCancel, onConfirm }: { change: Change; pending: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); cancel.current?.focus(); return () => dialog.current?.close(); }, []);
  return <dialog ref={dialog} className="scenario-status-dialog panel" aria-labelledby="season-binding-confirm-title" aria-describedby="season-binding-impact" aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }} onKeyDown={event => {
      if (event.key !== "Tab") return;
      if (pending) event.preventDefault();
      else if (event.shiftKey && document.activeElement === cancel.current) { event.preventDefault(); confirm.current?.focus(); }
      else if (!event.shiftKey && document.activeElement === confirm.current) { event.preventDefault(); cancel.current?.focus(); }
    }}>
    <h3 id="season-binding-confirm-title">시즌 연결 변경 확인</h3>
    <p><strong>{change.season.title} · {change.season.seasonKey}</strong></p>
    <p>{change.row.title} · {change.target ? `v${change.row.publishedVersion}` : "연결 해제"}</p>
    <p>현재 연결: {change.row.bindings.filter(b => b.isActive).map(b => `v${b.version}`).join(", ") || "없음"}</p>
    <p id="season-binding-impact">{change.target ? "현재 배포 버전을 이 시즌에 연결하고 같은 시나리오의 다른 연결은 해제합니다. 이후 새 경쟁 플레이에 적용됩니다." : "이 시즌에서 해당 시나리오의 연결을 해제합니다. 이후 새 경쟁 플레이를 시작할 수 없습니다."} 이미 시작한 플레이와 학습기록·HP·순위는 변경하지 않습니다.</p>
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {pending ? <p role="status">변경 결과를 확인하고 있습니다…</p> : null}
    <div className="scenario-status-actions">
      <button ref={cancel} type="button" className="secondary-button" disabled={pending} onClick={onCancel}>취소</button>
      <button ref={confirm} type="button" className="primary-button" disabled={pending} onClick={onConfirm}>{pending ? "변경 중…" : change.target ? "이 버전 연결" : "연결 해제 확인"}</button>
    </div>
  </dialog>;
}
export function SeasonScenarioPanel({ invoke, refreshKey, disabled, onBusy }: { invoke: Invoke; refreshKey: unknown; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [overview, setOverview] = useState<SeasonOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [pending, setPending] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const revision = useRef(0);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onBusy(false); }; }, [onBusy]);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // invoke is a parent closure; refreshKey is the explicit list-reload signal.
  const request = useRef(invoke); request.current = invoke;
  async function load() {
    const current = ++revision.current;
    setLoading(true); setOverview(null); setError(null);
    try {
      const result = readSeasonOverview(await request.current({ action: "season-overview" }));
      if (current === revision.current) setOverview(result);
    } catch { if (current === revision.current) setError("시즌 연결을 불러오지 못했습니다. 새로고침해주세요."); }
    finally { if (current === revision.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { revision.current += 1; }; }, [refreshKey]);
  function close() {
    if (lock.current) return;
    setChange(null); setChangeError(null);
    window.requestAnimationFrame(() => trigger.current?.isConnected && !trigger.current.disabled ? trigger.current.focus() : heading.current?.focus());
  }
  async function apply() {
    if (!change || lock.current) return;
    const snapshot = change;
    lock.current = true; setPending(true); onBusy(true); setChangeError(null); setNotice(null);
    try {
      const result = await request.current({ action: "set-season-scenario", seasonId: snapshot.season.id, scenarioId: snapshot.row.id, versionId: snapshot.target, expectedRevision: snapshot.row.revision });
      if (!alive.current) return;
      if (!confirmedSeasonBinding(result, snapshot.season.id, snapshot.row.id, snapshot.target)) throw Error("unconfirmed_season_binding");
      lock.current = false; close();
      setNotice("시즌 연결 변경이 저장되었습니다.");
      await load();
    } catch (cause) { const message = await seasonBindingError(cause); if (alive.current) setChangeError(message); }
    finally { lock.current = false; if (alive.current) { setPending(false); onBusy(false); } }
  }
  const season = overview?.season;
  const dates = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return <section className="panel admin-section season-scenario-panel" aria-labelledby="season-binding-title">
    <p className="eyebrow">Active season</p><h3 ref={heading} id="season-binding-title" tabIndex={-1}>활성 시즌 시나리오 연결</h3>
    <p className="muted">배포 상태와 시즌 연결이 모두 충족되어야 새 경쟁 플레이를 시작할 수 있습니다. 연결 변경은 이미 시작한 플레이와 기록에 영향을 주지 않습니다.</p>
    <button type="button" className="text-button" disabled={loading || pending || disabled} onClick={() => { setNotice(null); void load(); }}>시즌 연결 새로고침</button>
    {notice ? <p role="status">{notice}</p> : null}
    {loading ? <p role="status">시즌 연결을 불러오고 있습니다…</p> : error ? <p className="error-text" role="alert">{error}</p> : !season ? <p className="muted">현재 열린 시즌이 없습니다. 시즌이 열리면 연결을 관리할 수 있습니다.</p> : <>
      <p><strong>{season.title}</strong> · {season.seasonKey}</p><p className="muted">{dates(season.startsAt)} ~ {dates(season.endsAt)} (한국 시간)</p>
      {!overview?.scenarios.length ? <p className="muted">연결할 경쟁 시나리오가 없습니다. 초안을 검토·승인·배포한 뒤 연결해주세요.</p> : <div className="scenario-version-list">{overview.scenarios.map(row => {
        const active = row.bindings.filter(b => b.isActive);
        const eligible = row.isActive && row.isCompetitive && !!row.publishedVersionId;
        const applied = active.length === 1 && active[0]?.versionId === row.publishedVersionId;
        function propose(target: string | null, button: HTMLButtonElement) { trigger.current = button; setChangeError(null); setChange({ season: season!, row, target }); }
        return <article key={row.id} className="scenario-version-card">
          <strong>{row.title}</strong><p className="muted">{row.slug} · 현재 배포 {row.publishedVersion ? `v${row.publishedVersion}` : "없음"}</p>
          <p>{seasonBindingState(row)}</p>
          {row.bindings.length ? <p className="muted">연결 이력: {row.bindings.map(b => `v${b.version} ${STATUS_LABEL[b.status]} · ${b.isActive ? "연결" : "해제"}`).join(" / ")}</p> : null}
          <div className="scenario-status-actions">
            {eligible ? <button type="button" className="primary-button compact-button" disabled={applied || pending || disabled} onClick={e => propose(row.publishedVersionId, e.currentTarget)}>{applied ? "현재 버전 적용 중" : `v${row.publishedVersion} 시즌에 연결`}</button> : <p className="muted">활성 경쟁 시나리오의 배포 버전만 연결할 수 있습니다.</p>}
            {active.length ? <button type="button" className="secondary-button compact-button" disabled={pending || disabled} onClick={e => propose(null, e.currentTarget)}>시즌 연결 해제</button> : null}
          </div>
        </article>;
      })}</div>}
    </>}
    {change ? <BindingDialog change={change} pending={pending} error={changeError} onCancel={close} onConfirm={() => void apply()} /> : null}
  </section>;
}
