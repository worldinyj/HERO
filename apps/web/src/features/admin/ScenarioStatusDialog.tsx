import { useEffect, useRef } from "react";
import { STATUS_IMPACT, STATUS_LABEL, type ScenarioStatus } from "./scenarioStatus";

export interface StatusChange {
  id: string;
  title: string;
  slug: string;
  version: number;
  from: ScenarioStatus;
  to: ScenarioStatus;
}

export function ScenarioStatusDialog({ change, pending, error, onCancel, onConfirm }: {
  change: StatusChange;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => dialog.current?.close();
  }, []);
  return <dialog ref={dialog} className="scenario-status-dialog panel" aria-labelledby="status-change-title" aria-describedby="status-change-impact" aria-busy={pending} onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    if (pending) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === cancel.current) { event.preventDefault(); confirm.current?.focus(); }
    else if (!event.shiftKey && document.activeElement === confirm.current) { event.preventDefault(); cancel.current?.focus(); }
  }}>
    <p className="eyebrow">Scenario status</p>
    <h3 id="status-change-title">시나리오 상태 변경 확인</h3>
    <p><strong>{change.title} · v{change.version}</strong></p>
    <p className="muted">{change.slug}</p>
    <p>{STATUS_LABEL[change.from]} → <strong>{STATUS_LABEL[change.to]}</strong></p>
    <p id="status-change-impact">{STATUS_IMPACT[change.to]}</p>
    {change.to === "approved" || change.to === "published" ? <p className="muted">상태 변경은 출처·권리·HF·익명화 검토와 공식 출시 승인을 대신하지 않습니다.</p> : null}
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {pending ? <p role="status">변경 결과를 확인하고 있습니다…</p> : null}
    <div className="scenario-status-actions">
      <button ref={cancel} type="button" className="secondary-button" disabled={pending} onClick={onCancel}>취소</button>
      <button ref={confirm} type="button" className="primary-button" disabled={pending} onClick={onConfirm}>{pending ? "변경 중…" : `${STATUS_LABEL[change.to]} 상태로 변경`}</button>
    </div>
  </dialog>;
}
