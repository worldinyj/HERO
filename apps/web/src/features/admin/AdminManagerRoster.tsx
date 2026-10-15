import { useEffect, useRef, useState } from "react";
import { getSupabase } from "../../lib/supabase";
import { ReadTimeoutError } from "../../lib/readWithDeadline";
import { ReadRequestGate } from "../../lib/readRequestGate";
import { EMPTY_MANAGER_FILTERS, MANAGER_PAGE_SIZE, readManagerPage, type ManagerFilters, type ManagerRow } from "./managerRosterQueries";

interface Props {
  plants: Array<{ id: string; display_name: string; is_active: boolean }>;
  disabled: boolean;
  onSelect: (manager: ManagerRow) => void;
  onQueryChange: () => void;
}

export function AdminManagerRoster({ plants, disabled, onSelect, onQueryChange }: Props) {
  const gate = useRef(new ReadRequestGate());
  const [draft, setDraft] = useState<ManagerFilters>(EMPTY_MANAGER_FILTERS);
  const [filters, setFilters] = useState<ManagerFilters>(EMPTY_MANAGER_FILTERS);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const revision = gate.current.begin();
    const controller = new AbortController();
    setLoading(true);
    setRows([]);
    setTotal(null);
    setError(null);
    void Promise.resolve().then(() => readManagerPage(getSupabase(), filters, page, controller.signal)).then(result => {
      if (!gate.current.isCurrent(revision)) return;
      const lastPage = Math.max(0, Math.ceil(result.total / MANAGER_PAGE_SIZE) - 1);
      if (page > lastPage) { setPage(lastPage); return; }
      setRows(result.rows);
      setTotal(result.total);
      setLoading(false);
    }).catch(cause => {
      if (!gate.current.isCurrent(revision)) return;
      setError(cause instanceof ReadTimeoutError
        ? "담당자 조회 응답이 지연되어 대기를 마쳤습니다. 연결을 확인한 뒤 다시 조회해주세요."
        : "담당자 목록을 불러오지 못했습니다. 검색 조건과 연결 상태를 확인한 뒤 다시 시도해주세요.");
      setLoading(false);
    });
    return () => { gate.current.invalidate(); controller.abort(); };
  }, [filters, page, retry]);

  function changePage(next: number) {
    onQueryChange();
    setPage(next);
  }

  return <section aria-labelledby="admin-manager-roster-title">
    <h4 id="admin-manager-roster-title">담당자 목록 검색</h4>
    <form className="admin-form-grid" onSubmit={event => {
      event.preventDefault();
      if (disabled) return;
      onQueryChange();
      setFilters({ ...draft, name: draft.name.trim() });
      setPage(0);
    }}>
      <label><span>담당자 이름</span><input aria-label="담당자 이름 검색" value={draft.name} maxLength={100} pattern="[^*]*" title="* 문자를 제외한 담당자 이름을 입력해주세요."
        onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
      <label><span>발전소</span><select aria-label="담당자 발전소 필터" value={draft.plantId}
        onChange={event => setDraft({ ...draft, plantId: event.target.value })}>
        <option value="">전체 발전소</option>
        {plants.map(plant => <option key={plant.id} value={plant.id}>{plant.display_name}</option>)}
      </select></label>
      <label><span>계정 상태</span><select aria-label="담당자 상태 필터" value={draft.status}
        onChange={event => setDraft({ ...draft, status: event.target.value as ManagerFilters["status"] })}>
        <option value="all">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option>
      </select></label>
      <button type="submit" className="secondary-button" disabled={disabled}>담당자 검색</button>
    </form>
    <div aria-live="polite" aria-busy={loading}>
      {loading ? <p className="muted">담당자 목록을 불러오고 있습니다…</p> : error ?
        <div role="alert"><p>{error}</p><button type="button" className="secondary-button"
          onClick={() => { onQueryChange(); setRetry(value => value + 1); }}>담당자 목록 다시 조회</button></div> : <>
          <p className="muted">검색 결과 {total}명 · {page + 1} / {Math.max(1, Math.ceil((total ?? 0) / MANAGER_PAGE_SIZE))}페이지 · 페이지당 {MANAGER_PAGE_SIZE}명</p>
          <div className="admin-list">{rows.length === 0 ? <p className="muted">검색 조건에 맞는 담당자가 없습니다.</p> : rows.map(manager => {
            const plant = Array.isArray(manager.plants) ? manager.plants[0] : manager.plants;
            return <article key={manager.id} className="admin-row">
              <div><strong>{manager.real_name}</strong><span>{manager.nickname} · {plant ? `${plant.display_name} · ${plant.code}` : "발전소 미지정"}</span></div>
              <div className="admin-row-actions">
                <span className={manager.is_active ? "status-pill status-pill--active" : "status-pill"}>{manager.is_active ? "활성" : "비활성"}</span>
                <button type="button" className="secondary-button compact-button"
                  aria-label={`${manager.real_name} 담당자 초대링크 재생성`}
                  disabled={disabled || !manager.is_active || !plants.some(p => p.id === manager.plant_id && p.is_active)}
                  onClick={() => onSelect(manager)}>초대링크 재생성</button>
              </div>
            </article>;
          })}</div>
          <nav aria-label="담당자 페이지" className="admin-row-actions">
            <button type="button" className="secondary-button" disabled={disabled || page === 0} onClick={() => changePage(page - 1)}>이전 담당자 페이지</button>
            <button type="button" className="secondary-button" disabled={disabled || (page + 1) * MANAGER_PAGE_SIZE >= (total ?? 0)} onClick={() => changePage(page + 1)}>다음 담당자 페이지</button>
          </nav>
        </>}
    </div>
  </section>;
}
