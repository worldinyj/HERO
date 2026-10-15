import { useState, type ReactNode } from "react";

const PAGE_SIZE = 20;

export function OrgListPages<T>({ rows, label, loading, disabled, children }: {
  rows: readonly T[];
  label: string;
  loading: boolean;
  disabled: boolean;
  children: (rows: readonly T[]) => ReactNode;
}) {
  const [requestedPage, setPage] = useState(0);
  // A refreshed list can shrink while the operator is on its final page.
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const page = Math.min(requestedPage, lastPage);
  return <div aria-busy={loading}>
    {loading ? <p className="muted">{label} 목록을 불러오고 있습니다…</p> : <>
      <p className="muted mini-copy" role="status">
        {label} 전체 {rows.length}건 · {page + 1} / {lastPage + 1}페이지 · 페이지당 {PAGE_SIZE}건
      </p>
      {rows.length ? children(rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) : <p className="muted">표시할 {label} 목록이 없습니다.</p>}
      <nav className="admin-row-actions" aria-label={`${label} 페이지`}>
        <button type="button" className="secondary-button" disabled={disabled || page === 0}
          onClick={() => setPage(page - 1)}>이전 {label} 페이지</button>
        <button type="button" className="secondary-button" disabled={disabled || page === lastPage}
          onClick={() => setPage(page + 1)}>다음 {label} 페이지</button>
      </nav>
    </>}
  </div>;
}
