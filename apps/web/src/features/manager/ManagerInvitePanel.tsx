import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { shareHeroInvite } from "../../lib/kakaoShare";
import { getSupabase } from "../../lib/supabase";
import { nextInviteBatchRange, MAX_INVITES_PER_RUN } from "./bulkInviteBatch";
import { InviteCreationOutcomeUnknownError, isDefiniteInviteRejection } from "./inviteCreationErrors";
import { csvEscape } from "./bulkInviteCsv";

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
  plantDisplayName: string;
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
  const [singleRetryBlocked, setSingleRetryBlocked] = useState(false);
  const [singleResult, setSingleResult] = useState<InviteLinkResult | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkRetryBlocked, setBulkRetryBlocked] = useState(false);
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkInputs, setBulkInputs] = useState<BulkInput[]>([]);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkInfo, setBulkInfo] = useState<string | null>(null);
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

    if (invokeError) {
      if (!isDefiniteInviteRejection(invokeError)) {
        throw new InviteCreationOutcomeUnknownError();
      }
      throw invokeError;
    }

    const result = data as InviteLinkResult & { error?: string };
    if (!result.inviteUrl) {
      // An unexpected success response could still mean the DB insert was
      // committed. Prevent blind reissue of a one-time token.
      throw new InviteCreationOutcomeUnknownError();
    }

    return result;
  }

  async function handleSingleCreate() {
    if (singlePending || singleRetryBlocked) return;
    // The one-time token cannot be retrieved from the server again.
    if (singleResult) {
      setError("현재 표시된 링크를 먼저 보관하고 '링크 보관 완료'를 눌러주세요.");
      return;
    }
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
      if (cause instanceof InviteCreationOutcomeUnknownError) {
        setSingleRetryBlocked(true);
        setError("응답을 확인하지 못했습니다. 초대가 서버에 생성되었을 수도 있습니다. 담당자 초대 목록을 확인하기 전에는 같은 대상을 다시 초대하지 마세요.");
      } else {
        setError(cause instanceof Error ? cause.message : "초대 링크 생성에 실패했습니다.");
      }
    } finally {
      setSinglePending(false);
    }
  }

  async function handleShare() {
    if (!singleResult) return;

    try {
      const method = await shareHeroInvite({
        inviteUrl: singleResult.inviteUrl,
        plantDisplayName: singleResult.plantDisplayName,
      });

      if (method === "clipboard") {
        setCopied(true);
      }
    } catch {
      setError("카카오톡 공유 또는 링크 복사에 실패했습니다.");
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
    if (!file || bulkPending) return;

    // Invite URLs are shown only once. Never silently destroy partially
    // generated links when a new file is chosen.
    if (bulkResults.length > 0) {
      setError("기존 초대 링크를 CSV로 저장한 뒤 '새 목록 시작'을 눌러주세요.");
      return;
    }

    try {
      setError(null);
      setBulkInfo(null);
      const inputs = parseInviteCsv(await file.text());
      setBulkFileName(file.name);
      setBulkInputs(inputs);
    } catch (cause) {
      setBulkInputs([]);
      setBulkFileName("");
      setError(cause instanceof Error ? cause.message : "CSV를 읽지 못했습니다.");
    }
  }

  async function handleBulkShare(row: BulkResult) {
    try {
      const method = await shareHeroInvite({
        inviteUrl: row.inviteUrl,
        plantDisplayName: row.plantDisplayName,
        inviteeName: row.name,
      });

      if (method === "clipboard") {
        setCopiedBulkUrl(row.inviteUrl);
      }
    } catch {
      setError(`${row.name}님의 카카오톡 공유/링크 복사에 실패했습니다.`);
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
    if (bulkPending || bulkRetryBlocked || bulkInputs.length === 0 || bulkResults.length >= bulkInputs.length) {
      return;
    }

    // Keep successes even if the next request fails. Retrying resumes at the
    // first unfinished index, so one-time links are not generated twice.
    const results = [...bulkResults];
    const initialCount = results.length;
    const indices = nextInviteBatchRange(initialCount, bulkInputs.length);

    try {
      setBulkPending(true);
      setError(null);
      setBulkInfo(null);

      for (const index of indices) {
        const input = bulkInputs[index];
        if (!input) throw new Error("초대 목록 항목을 찾지 못했습니다.");

        const result = await createInvite(input);
        results.push({
          ...input,
          inviteUrl: result.inviteUrl,
          expiresAt: result.expiresAt,
          plantDisplayName: result.plantDisplayName,
        });
        // Persist every successful link to the UI immediately.
        setBulkResults([...results]);
      }

      setBulkInfo(
        results.length === bulkInputs.length
          ? `${results.length}명 초대 링크 생성이 완료되었습니다. CSV를 안전하게 보관해주세요.`
          : `${results.length}/${bulkInputs.length}명 완료. 이번 실행은 ${MAX_INVITES_PER_RUN}건 이하로 제한됩니다. 남은 항목은 서버 요청 한도가 회복된 후 재개해주세요.`,
      );
    } catch (cause) {
      setBulkResults([...results]);
      if (cause instanceof InviteCreationOutcomeUnknownError) {
        // The interrupted request may have committed on the server. Retrying
        // the same row automatically would create a second valid invitation.
        setBulkRetryBlocked(true);
        setError(
          `${results.length}/${bulkInputs.length}명 확인 완료, 다음 요청의 성공 여부는 불확실합니다. 생성된 링크를 CSV로 저장하고 담당자 초대 목록에서 해당 대상의 미수락 초대를 확인·정리한 뒤에만 새로운 초대를 진행하세요. 자동 재개는 잠겼습니다.`,
        );
      } else {
        setError(
          `${results.length}/${bulkInputs.length}명 생성 후 중단되었습니다. 이미 생성된 링크를 CSV로 저장하고 요청 제한이 해제되면 남은 항목부터 재개하세요. 상세: ${cause instanceof Error ? cause.message : "초대 생성 실패"}`,
        );
      }
    } finally {
      if (results.length > initialCount) onChanged();
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
            disabled={singlePending || singleRetryBlocked || Boolean(singleResult)}
            onClick={() => void handleSingleCreate()}
          >
            {singlePending ? "생성 중…" : "초대 링크 생성"}
          </button>

          {singleRetryBlocked ? (
            <div className="invite-result-box" role="alert">
              <strong>초대 생성 결과 확인 필요</strong>
              <p className="muted">서버에서 이미 생성했을 수 있으므로 같은 대상을 곧바로 재시도하지 마세요. 담당자 초대 목록의 미수락 항목을 확인하고 중복 초대를 취소한 뒤 새 요청을 시작해주세요.</p>
              <button
                type="button"
                className="secondary-button"
                disabled={singlePending}
                onClick={() => setSingleRetryBlocked(false)}
              >
                초대 목록 확인 완료 · 새 요청 허용
              </button>
            </div>
          ) : null}

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
                <button
                  type="button"
                  className="text-button"
                  disabled={singlePending}
                  onClick={() => {
                    setSingleResult(null);
                    setCopied(false);
                    setError(null);
                  }}
                >
                  링크 보관 완료 · 다음 초대 작성
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="manager-invite-form">
          <strong>CSV 일괄 초대</strong>
          <p className="muted mini-copy">
            헤더: name, job_role, team_name · 파일 최대 200명 · 한 번에 최대 {MAX_INVITES_PER_RUN}건
            (서버는 계정당 10분에 30회 요청 제한)
          </p>

          <label className="file-drop compact-file-drop">
            <span>{bulkFileName || "CSV 파일 선택"}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              disabled={bulkPending}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                void handleCsvFile(file);
              }}
            />
          </label>

          {bulkInputs.length > 0 ? (
            <p className="notice">{bulkInputs.length}명 중 {bulkResults.length}명 생성 완료. 생성된 링크는 즉시 아래에 표시되며 CSV로 저장할 수 있습니다.</p>
          ) : null}

          <button
            type="button"
            className="primary-button"
            disabled={bulkPending || bulkRetryBlocked || bulkInputs.length === 0 || bulkResults.length >= bulkInputs.length}
            onClick={() => void handleBulkCreate()}
          >
            {bulkPending
              ? `${bulkResults.length}/${bulkInputs.length}명 생성 중…`
              : bulkResults.length === 0
                ? "일괄 링크 생성 시작"
                : bulkResults.length === bulkInputs.length
                  ? "전체 생성 완료"
                  : `남은 ${bulkInputs.length - bulkResults.length}명 재개`}
          </button>

          {bulkInfo ? <p className="notice" role="status">{bulkInfo}</p> : null}
          {bulkRetryBlocked ? (
            <div className="invite-result-box" role="alert">
              <strong>미확인 요청이 있어 자동 재개를 중지했습니다</strong>
              <p className="muted">확인된 링크를 우선 CSV로 저장해주세요. 담당자 초대 목록에서 실패 지점의 미수락 초대가 이미 만들어졌는지 확인하고, 필요하면 취소한 후 새 목록을 시작해야 합니다.</p>
              {bulkResults.length === 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={bulkPending}
                  onClick={() => {
                    setBulkInputs([]);
                    setBulkResults([]);
                    setBulkRetryBlocked(false);
                    setBulkFileName("");
                    setBulkInfo(null);
                    setError(null);
                  }}
                >
                  미수락 초대 확인 완료 · 새 CSV 선택
                </button>
              ) : null}
            </div>
          ) : null}

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
                생성된 {bulkResults.length}명 링크 CSV 다운로드
              </button>
              <p className="muted mini-copy">일회용 링크는 다시 조회할 수 없습니다. 새 파일을 시작하기 전에 반드시 저장해주세요.</p>
              <button
                type="button"
                className="text-button"
                disabled={bulkPending}
                onClick={() => {
                  setBulkResults([]);
                  setBulkInputs([]);
                  setBulkFileName("");
                  setBulkInfo(null);
                  setBulkRetryBlocked(false);
                  setError(null);
                  setCopiedBulkUrl(null);
                }}
              >
                새 목록 시작 (현재 화면의 링크 지우기)
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
