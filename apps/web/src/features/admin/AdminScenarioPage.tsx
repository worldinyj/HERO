import { useEffect, useMemo, useRef, useState } from "react";
import type { Scenario } from "@hero/schema";
import { Link } from "react-router";
import { getSupabase } from "../../lib/supabase";
import { AdminScenarioPreview } from "./AdminScenarioPreview";
import { parsePreviewJson, readSavedPreview, type PreviewIssue } from "./scenarioPreviewValidation";

import { confirmedStatusResponse, scenarioErrorMessage, STATUS_LABEL, type ScenarioStatus } from "./scenarioStatus";
import { SeasonScenarioPanel } from "./SeasonScenarioPanel";
import { ScenarioVersionComparison } from "./ScenarioVersionComparison";
import { ScenarioStatusDialog, type StatusChange } from "./ScenarioStatusDialog";

interface ScenarioVersionRow {
  id: string;
  version: number;
  status: ScenarioStatus;
  default_perspective_role: string;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  scenarios:
    | {
        id: string;
        slug: string;
        title: string;
        is_active: boolean;
        is_competitive: boolean;
      }
    | Array<{
        id: string;
        slug: string;
        title: string;
        is_active: boolean;
        is_competitive: boolean;
      }>;
}

interface UploadIssue {
  path?: string;
  code?: string;
  message: string;
}

const NEXT_STATUS: Record<ScenarioStatus, ScenarioStatus[]> = {
  draft: ["review", "archived"],
  review: ["draft", "approved", "archived"],
  approved: ["review", "published", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

function scenarioInfo(row: ScenarioVersionRow) {
  return Array.isArray(row.scenarios) ? row.scenarios[0] : row.scenarios;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AdminScenarioPage() {
  const [versions, setVersions] = useState<ScenarioVersionRow[]>([]);
  const [jsonText, setJsonText] = useState("");
  const [fileName, setFileName] = useState("");
  const [issues, setIssues] = useState<UploadIssue[]>([]);
  const [warnings, setWarnings] = useState<UploadIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seasonBusy, setSeasonBusy] = useState(false);
  const [statusPending, setStatusPending] = useState<string | null>(null);
  const [statusChange, setStatusChange] = useState<StatusChange | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const statusLock = useRef(false);
  const statusTrigger = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playPreview, setPlayPreview] = useState<{ scenario: Scenario; sourceLabel: string; revision: number } | null>(null);
  const [previewIssues, setPreviewIssues] = useState<PreviewIssue[]>([]);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const previewRevision = useRef(0);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => () => { previewRevision.current += 1; }, []);

  async function invoke(body: Record<string, unknown>) {
    const supabase = getSupabase();
    const { data, error: invokeError } = await supabase.functions.invoke(
      "admin-scenario",
      { body },
    );

    if (invokeError) throw invokeError;
    return data as Record<string, unknown>;
  }

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await invoke({ action: "list" });
      setVersions((data.versions ?? []) as ScenarioVersionRow[]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "시나리오 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const comparisonVersions = useMemo(() => versions.flatMap(row => {
    const scenario = scenarioInfo(row);
    return scenario ? [{ id: row.id, version: row.version, status: row.status, slug: scenario.slug, title: scenario.title }] : [];
  }), [versions]);

  const preview = useMemo(() => {
    if (!jsonText.trim()) return null;

    return parsePreviewJson(jsonText);
  }, [jsonText]);

  function closePreview(restoreFocus = true) {
    previewRevision.current += 1;
    setPreviewLoadingId(null);
    setPlayPreview(null);
    setPreviewIssues([]);
    if (restoreFocus) window.requestAnimationFrame(() => previewTrigger.current?.focus());
  }

  function previewEditor() {
    closePreview(false);
    if (!preview?.scenario) { setPreviewIssues(preview?.issues ?? []); return; }
    setPlayPreview({ scenario: preview.scenario, sourceLabel: "입력 중인 JSON 검토용 사본", revision: previewRevision.current });
  }

  async function previewSaved(row: ScenarioVersionRow) {
    const revision = ++previewRevision.current;
    setPreviewLoadingId(row.id);
    setPlayPreview(null);
    setPreviewIssues([]);
    try {
      const data = await invoke({ action: "preview", scenarioVersionId: row.id });
      if (revision !== previewRevision.current) return;
      const checked = readSavedPreview(data, row.id, row.version);
      if (!checked.scenario) { setPreviewIssues(checked.issues); return; }
      setPlayPreview({ scenario: checked.scenario, sourceLabel: `저장된 버전 · ${STATUS_LABEL[row.status]}`, revision });
    } catch {
      if (revision === previewRevision.current) setPreviewIssues([{ path: "", message: "저장된 버전을 불러오지 못했습니다. 다시 시도해주세요." }]);
    } finally {
      if (revision === previewRevision.current) setPreviewLoadingId(null);
    }
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    setIssues([]);
    setWarnings([]);
    setError(null);

    try {
      setJsonText(await file.text());
    } catch {
      setError("JSON 파일을 읽지 못했습니다.");
    }
  }

  async function handleUpload() {
    setIssues([]);
    setWarnings([]);
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setIssues([{ message: "유효한 JSON 형식이 아닙니다." }]);
      return;
    }

    try {
      setSaving(true);
      const data = await invoke({ action: "upload", scenario: parsed });

      if (data.error) {
        setIssues((data.issues ?? [{ message: String(data.error) }]) as UploadIssue[]);
        return;
      }

      setWarnings((data.warnings ?? []) as UploadIssue[]);
      setJsonText("");
      setFileName("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "시나리오 저장에 실패했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function closeStatusDialog() {
    if (statusLock.current) return;
    setStatusChange(null);
    setStatusError(null);
    window.requestAnimationFrame(() => {
      const trigger = statusTrigger.current;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else document.getElementById("scenario-admin-title")?.focus();
    });
  }

  async function handleStatus() {
    if (!statusChange || statusLock.current) return;
    const change = statusChange;
    statusLock.current = true;
    setStatusPending(change.id);
    setStatusError(null);
    try {
      const data = await invoke({ action: "set-status", scenarioVersionId: change.id, status: change.to, expectedStatus: change.from });
      if (!confirmedStatusResponse(data, change.id, change.to, change.version)) throw new Error("unconfirmed_status_response");
      await load();
      statusLock.current = false;
      closeStatusDialog();
    } catch (cause) {
      setStatusError(await scenarioErrorMessage(cause));
    } finally {
      statusLock.current = false;
      setStatusPending(null);
    }
  }

  return (
    <section className="admin-page" aria-labelledby="scenario-admin-title">
      <header className="panel admin-header">
        <div className="admin-breadcrumb">
          <Link to="/admin">조직 관리</Link>
          <span aria-hidden="true">/</span>
          <strong>시나리오</strong>
        </div>
        <p className="eyebrow">Scenario Studio</p>
        <h2 id="scenario-admin-title" tabIndex={-1}>시나리오 관리</h2>
        <p className="muted">
          JSON은 서버에서 스키마와 그래프 무결성을 다시 검증한 뒤 초안으로 저장됩니다.
        </p>
        <button type="button" className="text-button" disabled={loading || saving || (Boolean(statusPending) || seasonBusy)} onClick={() => void load()}>목록 새로고침</button>
      </header>

      {error ? (
        <section className="panel">
          <p className="error-text" role="alert">{error}</p>
        </section>
      ) : null}

      <section className="panel admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Upload</p>
            <h3>JSON 시나리오 업로드</h3>
          </div>
        </div>

        <label className="file-drop">
          <span>{fileName || "JSON 파일 선택"}</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <textarea
          className="scenario-json-editor"
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
          spellCheck={false}
          placeholder="또는 HERO scenario JSON을 붙여넣으세요."
          aria-label="시나리오 JSON"
        />

        {preview ? (
          <div className={preview.scenario ? "scenario-preview" : "scenario-preview scenario-preview--error"}>
            {preview.scenario ? (
              <>
                <strong>{preview.scenario.title}</strong>
                <span>
                  {preview.scenario.id} · v{preview.scenario.version} · {preview.scenario.defaultPerspectiveRole} · 노드 {Object.keys(preview.scenario.nodes).length}개
                </span>
              </>
            ) : (
              <><strong>미리보기 전 검증이 필요합니다.</strong>{preview.issues.slice(0, 8).map((issue, index) => <p key={index}>{issue.path ? `${issue.path}: ` : ""}{issue.message}</p>)}</>
            )}
          </div>
        ) : null}

        <button type="button" className="secondary-button" disabled={saving || seasonBusy || !preview?.scenario} onClick={event => { previewTrigger.current = event.currentTarget; previewEditor(); }}>입력한 JSON 미리보기</button>
        {preview?.warnings.length ? <div className="validation-box"><strong>미리보기 검토 경고</strong>{preview.warnings.map((issue, index) => <p key={index}>{issue.message}</p>)}</div> : null}

        {issues.length > 0 ? (
          <div className="validation-box validation-box--error">
            <strong>저장 차단</strong>
            {issues.map((issue, index) => (
              <p key={`${issue.path ?? issue.code ?? "issue"}-${index}`}>
                {issue.path ? `${issue.path}: ` : ""}
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}

        {warnings.length > 0 ? (
          <div className="validation-box">
            <strong>검토 경고</strong>
            {warnings.map((issue, index) => (
              <p key={`${issue.path ?? issue.code ?? "warning"}-${index}`}>
                {issue.message}
              </p>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="primary-button"
          disabled={saving || seasonBusy || !preview?.scenario}
          onClick={handleUpload}
        >
          {saving ? "검증·저장 중…" : "서버 검증 후 초안 저장"}
        </button>
      </section>

      {previewLoadingId ? <section className="panel" role="status"><p>저장된 시나리오를 불러오고 있습니다…</p><button type="button" className="text-button" onClick={() => closePreview()}>불러오기 취소</button></section> : null}
      {previewIssues.length ? <section className="panel validation-box validation-box--error" role="alert"><strong>미리보기를 열 수 없습니다.</strong>{previewIssues.slice(0, 8).map((issue, index) => <p key={index}>{issue.path ? `${issue.path}: ` : ""}{issue.message}</p>)}</section> : null}
      {playPreview ? <AdminScenarioPreview key={playPreview.revision} scenario={playPreview.scenario} sourceLabel={playPreview.sourceLabel} onClose={() => closePreview()} /> : null}

      <SeasonScenarioPanel invoke={invoke} refreshKey={versions} disabled={saving || Boolean(statusPending)} onBusy={setSeasonBusy} />

      <ScenarioVersionComparison versions={comparisonVersions} editor={preview?.scenario ?? null} readVersion={id => invoke({ action: "preview", scenarioVersionId: id })} />

      {statusChange ? <ScenarioStatusDialog change={statusChange} pending={(Boolean(statusPending) || seasonBusy)} error={statusError} onCancel={closeStatusDialog} onConfirm={() => void handleStatus()} /> : null}

      <section className="panel admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Versions</p>
            <h3>버전 및 배포 상태</h3>
          </div>
          <span className="count-badge">{versions.length}</span>
        </div>

        {loading ? (
          <p className="muted">시나리오 버전을 불러오고 있습니다…</p>
        ) : versions.length === 0 ? (
          <p className="muted">저장된 시나리오 버전이 없습니다.</p>
        ) : (
          <div className="scenario-version-list">
            {versions.map((row) => {
              const scenario = scenarioInfo(row);
              return (
                <article key={row.id} className="scenario-version-card">
                  <div className="scenario-version-head">
                    <div>
                      <strong>{scenario?.title ?? "시나리오"}</strong>
                      <span>
                        {scenario?.slug ?? "-"} · v{row.version} · {row.default_perspective_role}
                      </span>
                    </div>
                    <span className={`scenario-status scenario-status--${row.status}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </div>

                  <div className="scenario-version-meta">
                    <span>등록 {formatDate(row.created_at)}</span>
                    {row.approved_at ? <span>승인 {formatDate(row.approved_at)}</span> : null}
                    {row.published_at ? <span>배포 {formatDate(row.published_at)}</span> : null}
                  </div>

                  <div className="scenario-status-actions">
                    <button type="button" className="secondary-button compact-button" aria-label={`${scenario?.title ?? "시나리오"} v${row.version} 미리보기`} disabled={Boolean(previewLoadingId)} onClick={event => { previewTrigger.current = event.currentTarget; void previewSaved(row); }}>미리보기</button>
                    {NEXT_STATUS[row.status].map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={status === "published" ? "primary-button compact-button" : "secondary-button compact-button"}
                        disabled={Boolean(statusPending) || seasonBusy || saving}
                        onClick={event => { statusTrigger.current = event.currentTarget; setStatusError(null); setStatusChange({ id: row.id, title: scenario?.title ?? "시나리오", slug: scenario?.slug ?? "-", version: row.version, from: row.status, to: status }); }}
                      >
                        {STATUS_LABEL[status]}로
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
