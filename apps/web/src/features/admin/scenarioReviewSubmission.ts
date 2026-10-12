import { REVIEW_AREAS, type ReviewArea, type ReviewTarget } from "./scenarioReview";

export interface SubmittedReview {
  area: ReviewArea;
  contentSha256: string;
  decision: "pass" | "hold";
  reviewedBy: string;
  reviewedAt: string;
  evidenceRef: string;
  note?: string;
}
export interface ReviewSubmission {
  schemaVersion: 1;
  kind: "human_review_submission";
  scenarioId: string;
  version: number;
  contentSha256: string;
  reviews: SubmittedReview[];
}
export type SubmissionTarget = Pick<ReviewTarget, "scenarioId" | "version" | "contentSha256">;

export function reviewDateInSeoul(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function isReviewDate(value: unknown, today: string): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}

export function validateReviewSubmission(value: unknown, target: SubmissionTarget, today = reviewDateInSeoul()): { submission: ReviewSubmission | null; error: string | null } {
  const fail = (error: string) => ({ submission: null, error });
  if (!object(value) || value.schemaVersion !== 1 || value.kind !== "human_review_submission" ||
      Object.keys(value).some(key => !["schemaVersion", "kind", "scenarioId", "version", "contentSha256", "reviews"].includes(key))) {
    return fail("검토 결과 파일의 형식을 확인해주세요.");
  }
  if (!/^[a-f0-9]{64}$/.test(target.contentSha256) || value.scenarioId !== target.scenarioId || value.version !== target.version || value.contentSha256 !== target.contentSha256) {
    return fail("현재 검토 대상의 시나리오·버전·파일 SHA가 일치하지 않습니다.");
  }
  if (!Array.isArray(value.reviews) || value.reviews.length < 1 || value.reviews.length > REVIEW_AREAS.length) return fail("검토 결과는 1~5개 영역이어야 합니다.");
  const seen = new Set<string>();
  const reviews: SubmittedReview[] = [];
  for (const row of value.reviews) {
    if (!object(row) || Object.keys(row).some(key => !["area", "contentSha256", "decision", "reviewedBy", "reviewedAt", "evidenceRef", "note"].includes(key)) ||
        !REVIEW_AREAS.includes(row.area as ReviewArea) || seen.has(String(row.area)) || row.contentSha256 !== target.contentSha256) return fail("검토 영역 또는 영역별 파일 SHA를 확인해주세요. 같은 영역을 중복해서 제출할 수 없습니다.");
    if (row.decision !== "pass" && row.decision !== "hold") return fail("통과 또는 보완 필요 판정을 선택해주세요.");
    if (!text(row.reviewedBy, 120)) return fail("검토자 성명 또는 공식 역할을 120자 이내로 입력해주세요.");
    if (!isReviewDate(row.reviewedAt, today)) return fail("검토일은 실제 존재하는 오늘까지의 날짜여야 합니다.");
    if (!text(row.evidenceRef, 500)) return fail("근거 문서·결재·티켓 참조를 500자 이내로 입력해주세요.");
    if (row.note !== undefined && (typeof row.note !== "string" || row.note.length > 2000 || row.note.includes("\0"))) return fail("검토 메모는 2000자 이내로 입력해주세요.");
    const note = typeof row.note === "string" ? row.note.trim() : "";
    if (row.decision === "hold" && !note) return fail("보완 필요 판정에는 보완할 내용을 입력해주세요.");
    seen.add(String(row.area));
    reviews.push({ area: row.area as ReviewArea, contentSha256: target.contentSha256, decision: row.decision,
      reviewedBy: row.reviewedBy.trim(), reviewedAt: row.reviewedAt, evidenceRef: row.evidenceRef.trim(), ...(note ? { note } : {}) });
  }
  return { submission: { schemaVersion: 1, kind: "human_review_submission", scenarioId: target.scenarioId,
    version: target.version, contentSha256: target.contentSha256, reviews }, error: null };
}
