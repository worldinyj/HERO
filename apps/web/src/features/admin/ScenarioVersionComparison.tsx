import { useEffect, useMemo, useRef, useState } from "react";
import type { Scenario } from "@hero/schema";
import { readSavedPreview } from "./scenarioPreviewValidation";
import { DIFF_GROUPS, diffGroup, diffLabel, diffPath, diffScenarios, diffValue, type ScenarioDifference } from "./scenarioDiff";
import { STATUS_LABEL, type ScenarioStatus } from "./scenarioStatus";

export interface ComparisonVersion {
  id: string;
  slug: string;
  title: string;
  version: number;
  status: ScenarioStatus;
}

interface Comparison {
  beforeLabel: string;
  afterLabel: string;
  changes: ScenarioDifference[];
}

const KIND_LABEL = { added: "추가", removed: "삭제", changed: "변경" };

export function ScenarioVersionComparison({ versions, editor, readVersion }: {
  versions: ComparisonVersion[];
  editor: Scenario | null;
  readVersion: (id: string) => Promise<unknown>;
}) {
  const [baselineId, setBaselineId] = useState("");
  const [targetId, setTargetId] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Comparison | null>(null);
  const [shown, setShown] = useState(20);
  const revision = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { revision.current += 1; }, []);
  useEffect(() => {
    revision.current += 1;
    setBusy(false);
    setResult(null);
    setError(null);
    setShown(20);
    setBaselineId("");
    setTargetId("editor");
  }, [versions]);
  useEffect(() => { if (result) heading.current?.focus(); }, [result]);

  const baseline = versions.find(row => row.id === baselineId);
  const targets = versions.filter(row => row.slug === baseline?.slug && row.id !== baselineId);
  const target = targets.find(row => row.id === targetId);
  const editorMatches = Boolean(editor && editor.id === baseline?.slug);
  const canCompare = Boolean(baseline && (targetId === "editor" ? editorMatches : target));
  const visibleChanges = useMemo(() => result?.changes.slice(0, shown) ?? [], [result, shown]);

  function reset(restoreFocus = false) {
    revision.current += 1;
    setBusy(false);
    setError(null);
    setResult(null);
    setShown(20);
    if (restoreFocus) window.requestAnimationFrame(() => {
      if (trigger.current && !trigger.current.disabled) trigger.current.focus();
      else panelHeading.current?.focus();
    });
  }

  async function loadVersion(row: ComparisonVersion): Promise<Scenario> {
    const checked = readSavedPreview(await readVersion(row.id), row.id, row.version);
    if (!checked.scenario || checked.scenario.id !== row.slug) throw new Error("invalid_comparison_version");
    return checked.scenario;
  }

  async function compare() {
    if (!canCompare || !baseline || busy) return;
    const request = ++revision.current;
    const beforeRow = baseline;
    const editorSnapshot = editor ? structuredClone(editor) : null;
    const afterRow = target;
    setBusy(true);
    setError(null);
    setResult(null);
    setShown(20);
    try {
      const [before, after] = await Promise.all([
        loadVersion(beforeRow),
        targetId === "editor" ? Promise.resolve(editorSnapshot!) : loadVersion(afterRow!),
      ]);
      if (request !== revision.current) return;
      setResult({
        beforeLabel: `${beforeRow.title} · v${beforeRow.version} · ${STATUS_LABEL[beforeRow.status]}`,
        afterLabel: afterRow ? `${afterRow.title} · v${afterRow.version} · ${STATUS_LABEL[afterRow.status]}` : `입력 중인 JSON 사본 · v${after.version}`,
        changes: diffScenarios(before, after),
      });
    } catch {
      if (request === revision.current) setError("비교할 버전을 확인하지 못했습니다. 목록의 시나리오·버전과 JSON 내용을 확인한 뒤 다시 시도해주세요.");
    } finally {
      if (request === revision.current) setBusy(false);
    }
  }

  return <section className="panel admin-section" aria-labelledby="scenario-comparison-title">
    <p className="eyebrow">Version comparison</p>
    <h3 id="scenario-comparison-title" ref={panelHeading} tabIndex={-1}>시나리오 버전 비교</h3>
    <p className="muted">변경 전을 기준으로 변경 후의 차이를 확인합니다. 시나리오 저장·상태 변경·플레이 기록은 발생하지 않습니다.</p>
    {versions.length === 0 ? <p className="muted">초안을 저장하면 저장된 버전과 편집 중인 JSON 또는 다른 저장 버전을 비교할 수 있습니다.</p> : <>
      <div className="comparison-select"><label htmlFor="comparison-before">변경 전 · 기준 버전</label>
        <select id="comparison-before" value={baselineId} onChange={event => { reset(); setBaselineId(event.target.value); setTargetId("editor"); }}>
          <option value="">기준 버전을 선택해주세요</option>
          {versions.map(row => <option key={row.id} value={row.id}>{row.title} · {row.slug} · v{row.version} · {STATUS_LABEL[row.status]}</option>)}
        </select>
      </div>
      <div className="comparison-select"><label htmlFor="comparison-after">변경 후 · 비교 대상</label>
        <select id="comparison-after" value={targetId} disabled={!baseline} onChange={event => { reset(); setTargetId(event.target.value); }}>
          <option value="editor">입력 중인 JSON</option>
          {targets.map(row => <option key={row.id} value={row.id}>v{row.version} · {STATUS_LABEL[row.status]}</option>)}
        </select>
      </div>
      {baseline && targetId === "editor" && !editorMatches ? <p className="muted">기준 버전과 동일한 시나리오의 유효한 JSON을 위 편집기에 입력해주세요.</p> : null}
      <button ref={trigger} type="button" className="secondary-button" disabled={busy || !canCompare} onClick={() => void compare()}>변경 사항 비교</button>
    </>}
    {busy ? <div role="status"><p>비교할 버전을 불러오고 있습니다…</p><button type="button" className="text-button" onClick={() => reset(true)}>비교 불러오기 취소</button></div> : null}
    {error ? <p className="error-text" role="alert">{error}</p> : null}
    {result ? <section className="scenario-comparison-result" aria-labelledby="scenario-diff-title">
      <h4 id="scenario-diff-title" ref={heading} tabIndex={-1}>비교 결과 · {result.changes.length}개 변경</h4>
      <p>변경 전: {result.beforeLabel}</p><p>변경 후: {result.afterLabel}</p>
      <p className="muted">버전 번호는 변경 개수에서 제외합니다. 불러온 시점의 내용 사본입니다. JSON을 수정했다면 비교를 다시 실행해주세요. 비교 결과는 승인이나 게시를 대신하지 않습니다.</p>
      {result.changes.length === 0 ? <p>버전 번호를 제외한 내용이 같습니다.</p> : <>
        <p>표시 {visibleChanges.length} / 전체 {result.changes.length}</p>
        {DIFF_GROUPS.map(group => {
          const changes = visibleChanges.filter(change => diffGroup(change.path) === group);
          return changes.length ? <section key={group} aria-label={group}><h5>{group}</h5>{changes.map(change => <details className="scenario-diff-item" key={diffPath(change.path)}>
            <summary>{KIND_LABEL[change.kind]} · {diffLabel(change.path)}</summary>
            <p className="muted"><code>{diffPath(change.path)}</code></p>
            <dl><div><dt>변경 전</dt><dd><pre>{diffValue(change.before)}</pre></dd></div><div><dt>변경 후</dt><dd><pre>{diffValue(change.after)}</pre></dd></div></dl>
            {change.path.at(-1) === "$order" ? <p className="muted">작성 순서 변경입니다. 실제 플레이의 선택지 표시 순서는 별도 셔플 규칙을 따릅니다.</p> : null}
          </details>)}</section> : null;
        })}
        {shown < result.changes.length ? <button type="button" className="secondary-button" onClick={() => setShown(value => value + 20)}>변경 사항 더 보기</button> : null}
      </>}
      <button type="button" className="text-button" onClick={() => reset(true)}>비교 닫기</button>
    </section> : null}
  </section>;
}
