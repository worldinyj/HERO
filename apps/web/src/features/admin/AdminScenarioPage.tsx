import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { getSupabase } from "../../lib/supabase";

type ScenarioStatus = "draft" | "review" | "approved" | "published" | "archived";

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

const STATUS_LABEL: Record<ScenarioStatus, string> = {
  draft: "초안",
  review: "검토",
  approved: "승인",
  published: "배포",
  archived: "보관",
};

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
  const [statusPending, setStatusPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invoke(body: unknown) {
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

  const preview = useMemo(() => {
    if (!jsonText.trim()) return null;

    try {
      const value = JSON.parse(jsonText) as {
        id?: string;
        title?: string;
        version?: number;
        defaultPerspectiveRole?: string;
        nodes?: Record<string, unknown>;
      };

      return {
        validJson: true,
        id: value.id ?? "-",
        title: value.title ?? "-",
        version: value.version ?? "-",
        perspective: value.defaultPerspectiveRole ?? "-",
        nodeCount: value.nodes ? Object.keys(value.nodes).length : 0,
      };
    } catch {
      return { validJson: false };
    }
  }, [jsonText]);

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

  async function handleStatus(versionId: string, status: ScenarioStatus) {
    try {
      setStatusPending(versionId);
      setError(null);
      await invoke({
        action: "set-status",
        scenarioVersionId: versionId,
        status,
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "상태 변경에 실패했습니다.",
      );
    } finally {
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
        <h2 id="scenario-admin-title">시나리오 관리</h2>
        <p className="muted">
          JSON은 서버에서 스키마와 그래프 무결성을 다시 검증한 뒤 초안으로 저장됩니다.
        </p>
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
          <div className={preview.validJson ? "scenario-preview" : "scenario-preview scenario-preview--error"}>
            {preview.validJson ? (
              <>
                <strong>{preview.title}</strong>
                <span>
                  {preview.id} · v{preview.version} · {preview.perspective} · 노드 {preview.nodeCount}개
                </span>
              </>
            ) : (
              <strong>JSON 구문을 확인해주세요.</strong>
            )}
          </div>
        ) : null}

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
          disabled={saving || !jsonText.trim() || preview?.validJson === false}
          onClick={handleUpload}
        >
          {saving ? "검증·저장 중…" : "서버 검증 후 초안 저장"}
        </button>
      </section>

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
                    {NEXT_STATUS[row.status].map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={status === "published" ? "primary-button compact-button" : "secondary-button compact-button"}
                        disabled={statusPending === row.id}
                        onClick={() => void handleStatus(row.id, status)}
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
