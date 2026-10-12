import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { getSupabase } from "../../lib/supabase";
import { ReadRequestGate } from "../../lib/readRequestGate";
import { AUDIT_ACTIONS, AUDIT_COLUMNS, AUDIT_PAGE_SIZE, EMPTY_AUDIT_FILTERS, auditDateBounds,
  auditTime, readAuditRows, type AuditFilters, type AuditRow } from "./auditHistory";

export function AdminAuditPage() {
  const gate = useRef(new ReadRequestGate());
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [cursors, setCursors] = useState<Array<number | null>>([null]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(filters: AuditFilters, pages: Array<number | null>) {
    let bounds: ReturnType<typeof auditDateBounds>;
    try { bounds = auditDateBounds(filters); }
    catch (cause) { setRows([]); setHasNext(false); setError(cause instanceof Error ? cause.message : "날짜를 확인해주세요."); return; }
    const ticket = gate.current.begin();
    setLoading(true); setError(null); setRows([]); setHasNext(false);
    setApplied(filters); setCursors(pages);
    try {
      let query = getSupabase().from("audit_logs").select(AUDIT_COLUMNS)
        .order("id", { ascending: false }).limit(AUDIT_PAGE_SIZE + 1);
      const cursor = pages[pages.length - 1] ?? null;
      if (cursor !== null) query = query.lt("id", cursor);
      if (filters.action) query = query.eq("action", filters.action);
      if (bounds.from) query = query.gte("created_at", bounds.from);
      if (bounds.to) query = query.lt("created_at", bounds.to);
      const result = await query;
      if (!gate.current.isCurrent(ticket)) return;
      if (result.error) throw result.error;
      const records = readAuditRows(result.data);
      if (cursor !== null && records.some(r => r.id >= cursor)) throw new Error("audit_cursor_invalid");
      setRows(records.slice(0, AUDIT_PAGE_SIZE)); setHasNext(records.length > AUDIT_PAGE_SIZE);
    } catch {
      if (gate.current.isCurrent(ticket)) setError("감사 이력을 불러오지 못했습니다. 권한과 연결 상태를 확인하고 다시 조회해주세요.");
    } finally {
      if (gate.current.isCurrent(ticket)) setLoading(false);
    }
  }
  useEffect(() => {
    void load(EMPTY_AUDIT_FILTERS, [null]);
    return () => gate.current.invalidate();
  }, []);

  return <section className="admin-page" aria-labelledby="audit-title">
    <header className="panel admin-header">
      <nav className="admin-subnav" aria-label="관리자 메뉴">
          <Link className="admin-subnav-link" to="/admin/overview">운영 현황</Link>
        <Link className="admin-subnav-link" to="/admin">조직</Link>
        <Link className="admin-subnav-link" to="/admin/scenarios">시나리오</Link>
        <Link className="admin-subnav-link admin-subnav-link--active" to="/admin/audit" aria-current="page">감사 이력</Link>
      </nav>
      <p className="eyebrow">Audit History</p><h2 id="audit-title">감사 이력</h2>
      <p className="muted">초대·조직·사용자·시나리오 변경 기록을 조회합니다. 최근 등록 순으로 표시하며, 날짜와 시각은 한국 시간 기준입니다.</p>
    </header>
    <section className="panel" aria-label="감사 이력 조회">
      <form className="admin-form-grid" onSubmit={event => { event.preventDefault(); if (!loading) void load(draft, [null]); }}>
        <label><span>이벤트</span><select aria-label="이벤트" value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })}>
          <option value="">전체 이벤트</option>
          {Object.entries(AUDIT_ACTIONS).map(([action, label]) => <option key={action} value={action}>{label}</option>)}
        </select></label>
        <label><span>시작일</span><input type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
        <label><span>종료일</span><input type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
        <button className="primary-button" disabled={loading} type="submit">조회</button>
        <button className="secondary-button" disabled={loading} type="button" onClick={() => {
          setDraft(EMPTY_AUDIT_FILTERS); void load(EMPTY_AUDIT_FILTERS, [null]);
        }}>필터 초기화</button>
      </form>
      {error ? <p className="error-text" role="alert">{error}</p> : null}
      <p role="status" className="muted">{loading ? "감사 이력을 불러오고 있습니다…" : error ? "조회 결과를 확인해주세요." :
        `${cursors.length}페이지 · ${rows.length}건 · ${AUDIT_ACTIONS[applied.action] ?? "전체 이벤트"} · ${applied.from || "시작일 제한 없음"} ~ ${applied.to || "종료일 제한 없음"}`}</p>
      {!loading && !error && rows.length === 0 ? <p>조회 조건에 해당하는 감사 이력이 없습니다.</p> : null}
      <div className="admin-list audit-history-list" aria-label="감사 기록">
        {rows.map(row => <article key={row.id} className="audit-history-row">
          <strong>{AUDIT_ACTIONS[row.action] ?? row.action}</strong>
          <p><time dateTime={row.created_at}>{auditTime(row.created_at)}</time> · 기록 #{row.id}</p>
          <details><summary>기록 식별 정보</summary><dl>
            <dt>이벤트 코드</dt><dd>{row.action}</dd>
            <dt>처리자 ID</dt><dd>{row.actor_user_id ?? "시스템 또는 미기록"}</dd>
            <dt>조직 ID</dt><dd>{row.plant_id ?? "없음"}</dd>
            <dt>대상</dt><dd>{row.entity_type} · {row.entity_id ?? "없음"}</dd>
          </dl></details>
        </article>)}
      </div>
      <div className="inline-actions" aria-label="감사 이력 페이지">
        <button className="secondary-button" disabled={loading || cursors.length <= 1} type="button"
          onClick={() => void load(applied, cursors.slice(0, -1))}>이전 페이지</button>
        <button className="secondary-button" disabled={loading || !hasNext || Boolean(error)} type="button"
          onClick={() => { const last = rows[rows.length - 1]; if (last) void load(applied, [...cursors, last.id]); }}>다음 페이지</button>
        <button className="text-button" disabled={loading} type="button" onClick={() => void load(applied, [null])}>최신 기록 새로고침</button>
      </div>
    </section>
  </section>;
}
