import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getSupabase } from "../../lib/supabase";

type JobRole = "sro" | "ro" | "field_operator" | "supervisor" | "worker";

interface InviteLinkResult {
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
  plantDisplayName: string;
}

interface BulkInput {
  name: string;
  jobRole: JobRole;
  teamName: string;
}

interface BulkResult extends BulkInput {
  inviteUrl: string;
  expiresAt: string;
}

const JOB_OPTIONS: Array<{ value: JobRole; label: string }> = [
  { value: "sro", label: "SRO" },
  { value: "ro", label: "RO" },
  { value: "field_operator", label: "현장운전원" },
  { value: "supervisor", label: "감독" },
  { value: "worker", label: "작업자" },
];

const JOB_SET = new Set<JobRole>(JOB_OPTIONS.map((item) => item.value));

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(value.trim());
      value = "";
      continue;
    }

    value += char;
  }

  cells.push(value.trim());
  return cells;
}

function parseInviteCsv(text: string): BulkInput[] {
  const lines = text
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("CSV가 비어 있습니다.");
  }

  const first = parseCsvLine(lines[0] ?? "").map((cell) => cell.toLowerCase());
  const hasHeader =
    first.includes("name") ||
    first.includes("invitee_name") ||
    first.includes("real_name") ||
    first.includes("job_role");

  let nameIndex = 0;
  let jobIndex = 1;
  let teamIndex = 2;
  let dataStart = 0;

  if (hasHeader) {
    const findColumn = (...names: string[]) =>
      first.findIndex((cell) => names.includes(cell));

    nameIndex = findColumn("name", "invitee_name", "real_name");
    jobIndex = findColumn("job_role", "role");
    teamIndex = findColumn("team_name", "team");

    if (nameIndex < 0 || jobIndex < 0) {
      throw new Error("CSV 헤더에는 name(또는 invitee_name)과 job_role이 필요합니다.");
    }

    dataStart = 1;
  }

  const rows: BulkInput[] = [];

  for (let index = dataStart; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const cells = parseCsvLine(line);
    const name = (cells[nameIndex] ?? "").trim();
    const roleRaw = (cells[jobIndex] ?? "").trim().toLowerCase();
    const teamName = teamIndex >= 0 ? (cells[teamIndex] ?? "").trim() : "";

    if (!name) {
      throw new Error(`CSV ${index + 1}행: 이름이 없습니다.`);
    }

    if (!JOB_SET.has(roleRaw as JobRole)) {
      throw new Error(
        `CSV ${index + 1}행: job_role은 sro, ro, field_operator, supervisor, worker 중 하나여야 합니다.`,
      );
    }

    rows.push({
      name,
      jobRole: roleRaw as JobRole,
      teamName,
    });
  }

  if (rows.length === 0) {
    throw new Error("초대할 데이터 행이 없습니다.");
  }

  if (rows.length > 200) {
    throw new Error("한 번에 최대 200명까지 초대할 수 있습니다.");
  }

  return rows;
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadBulkCsv(rows: BulkResult[]) {
  const header = ["name", "job_role", "team_name", "invite_url", "expires_at"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.jobRole,
        row.teamName,
        row.inviteUrl,
        row.expiresAt,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `hero-invite-links-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ManagerInvitePanel({ onChanged }: { onChanged: () => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [jobRole, setJobRole] = useState<JobRole>("worker");
  const [teamName, setTeamName] = useState("");
  const [singlePending, setSinglePending] = useState(false);
  const [singleResult, setSingleResult] = useState<InviteLinkResult | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkInputs, setBulkInputs] = useState<BulkInput[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedBulkUrl, setCopiedBulkUrl] = useState<string | null>(null);

  async function createInvite(input: BulkInput): Promise<InviteLinkResult> {
    if (!profile?.plant_id) {
      throw new Error("담당자의 발전소 정보가 없습니다.");
    }

    const supabase = getSupabase();
    const { data, error: invokeError } = await supabase.functions.invoke(
      "create-invite",
      {
        body: {
          plantId: profile.plant_id,
          targetRole: "player",
          inviteeName: input.name,
          jobRole: input.jobRole,
          teamName: input.teamName || undefined,
        },
      },
    );

    if (invokeError) throw invokeError;

    const result = data as InviteLinkResult & { error?: string };
    if (!result.inviteUrl) {
      throw new Error(result.error ?? "초대 링크 생성에 실패했습니다.");
    }

    return result;
  }

  async function handleSingleCreate() {
    if (!name.trim()) {
      setError("초대할 사용자 이름을 입력해주세요.");
      return;
    }

    try {
      setSinglePending(true);
      setError(null);
      setCopied(false);
      const result = await createInvite({
        name: name.trim(),
        jobRole,
        teamName: teamName.trim(),
      });
      setSingleResult(result);
      setName("");
      setTeamName("");
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "초대 링크 생성에 실패했습니다.");
    } finally {
      setSinglePending(false);
    }
  }

  async function handleShare() {
    if (!singleResult) return;

    const shareData = {
      title: "HERO 초대장",
      text: `${singleResult.plantDisplayName} HERO 교육 초대장입니다.`,
      url: singleResult.inviteUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }

      await navigator.clipboard.writeText(singleResult.inviteUrl);
      setCopied(true);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("공유 또는 링크 복사에 실패했습니다.");
    }
  }

  async function handleCopy() {
    if (!singleResult) return;
    try {
      await navigator.clipboard.writeText(singleResult.inviteUrl);
      setCopied(true);
    } catch {
      setError("링크 복사에 실패했습니다.");
    }
  }

  async function handleCsvFile(file: File | null) {
    if (!file) return;

    try {
      setError(null);
      setBulkResults([]);
      setBulkFileName(file.name);
      setBulkInputs(parseInviteCsv(await file.text()));
    } catch (cause) {
      setBulkInputs([]);
      setError(cause instanceof Error ? cause.message : "CSV를 읽지 못했습니다.");
    }
  }

  async function handleBulkShare(row: BulkResult) {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "HERO 초대장",
          text: `${row.name}님 HERO 교육 초대장입니다.`,
          url: row.inviteUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(row.inviteUrl);
      setCopiedBulkUrl(row.inviteUrl);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(`${row.name}님의 링크 공유/복사에 실패했습니다.`);
    }
  }

  async function handleBulkCopy(row: BulkResult) {
    try {
      await navigator.clipboard.writeText(row.inviteUrl);
      setCopiedBulkUrl(row.inviteUrl);
    } catch {
      setError(`${row.name}님의 링크 복사에 실패했습니다.`);
    }
  }

  async function handleBulkCreate() {
    if (bulkInputs.length === 0) {
      setError("먼저 CSV 파일을 선택해주세요.");
      return;
    }

    try {
      setBulkPending(true);
      setError(null);
      const results: BulkResult[] = [];

      for (const input of bulkInputs) {
        const result = await createInvite(input);
        results.push({
          ...input,
          inviteUrl: result.inviteUrl,
          expiresAt: result.expiresAt,
        });
      }

      setBulkResults(results);
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `일괄 초대 중 중단되었습니다: ${cause.message}`
          : "일괄 초대 생성에 실패했습니다.",
      );
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <section className="panel manager-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Invite</p>
          <h3>사용자 초대</h3>
        </div>
        <span className="privacy-badge">링크 1회용 · 7일</span>
      </div>

      {error ? <p className="error-text" role="alert">{error}</p> : null}

      <div className="invite-tabs-grid">
        <div className="manager-invite-form">
          <strong>단건 초대</strong>

          <label>
            <span>이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="예: 홍길동"
            />
          </label>

          <label>
            <span>직무</span>
            <select
              value={jobRole}
              onChange={(event) => setJobRole(event.target.value as JobRole)}
            >
              {JOB_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>팀/조</span>
            <input
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder="선택 입력"
            />
          </label>

          <button
            type="button"
            className="primary-button"
            disabled={singlePending}
            onClick={() => void handleSingleCreate()}
          >
            {singlePending ? "생성 중…" : "초대 링크 생성"}
          </button>

          {singleResult ? (
            <div className="invite-result-box">
              <strong>생성된 링크는 지금 저장해주세요</strong>
              <code>{singleResult.inviteUrl}</code>
              <div className="inline-actions">
                <button type="button" className="secondary-button compact-button" onClick={() => void handleShare()}>
                  공유
                </button>
                <button type="button" className="secondary-button compact-button" onClick={() => void handleCopy()}>
                  {copied ? "복사 완료" : "링크 복사"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="manager-invite-form">
          <strong>CSV 일괄 초대</strong>
          <p className="muted mini-copy">
            헤더: name, job_role, team_name · 최대 200명
          </p>

          <label className="file-drop compact-file-drop">
            <span>{bulkFileName || "CSV 파일 선택"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleCsvFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {bulkInputs.length > 0 ? (
            <p className="notice">{bulkInputs.length}명을 확인했습니다. 생성 후 링크 CSV를 다운로드할 수 있습니다.</p>
          ) : null}

          <button
            type="button"
            className="primary-button"
            disabled={bulkPending || bulkInputs.length === 0}
            onClick={() => void handleBulkCreate()}
          >
            {bulkPending ? `${bulkInputs.length}명 생성 중…` : "일괄 링크 생성"}
          </button>

          {bulkResults.length > 0 ? (
            <div className="invite-result-box">
              <strong>{bulkResults.length}명 링크 생성 완료</strong>

              <div className="bulk-invite-results">
                {bulkResults.map((row) => (
                  <article key={row.inviteUrl} className="bulk-invite-row">
                    <div>
                      <strong>{row.name}</strong>
                      <span>
                        {JOB_OPTIONS.find((item) => item.value === row.jobRole)?.label ?? row.jobRole}
                        {row.teamName ? ` · ${row.teamName}` : ""}
                      </span>
                    </div>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void handleBulkShare(row)}
                      >
                        공유
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => void handleBulkCopy(row)}
                      >
                        {copiedBulkUrl === row.inviteUrl ? "복사 완료" : "복사"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => downloadBulkCsv(bulkResults)}
              >
                링크 CSV 다운로드
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
