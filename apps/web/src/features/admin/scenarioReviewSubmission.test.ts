import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import draft from "../../../../../scenarios/drafts/S03_procedure_reality_v1.json";
import target from "./scenarioReviewStatus.generated.json";
import { reviewDateInSeoul, validateReviewSubmission } from "./scenarioReviewSubmission";
const record = { area: "hf_accuracy", contentSha256: target.contentSha256, decision: "hold", reviewedBy: "검토 담당자", reviewedAt: "2026-10-11", evidenceRef: "review-ticket-1", note: "원인 분류의 근거를 보완" };
const packet = () => ({ schemaVersion: 1, kind: "human_review_submission", scenarioId: target.scenarioId, version: target.version, contentSha256: target.contentSha256, reviews: [{ ...record }] });
const check = (value: unknown) => validateReviewSubmission(value, target, "2026-10-12");
describe("review submission validation", () => {
  it("preserves HOLD and accepts partial review submissions without setting approval", () => {
    const result = check(packet());
    expect(result.error).toBeNull();
    expect(result.submission?.reviews[0]?.decision).toBe("hold");
    expect(result.submission).not.toHaveProperty("approved");
  });
  it("rejects a changed content SHA, target version and record hash", () => {
    for (const value of [{ ...packet(), contentSha256: "a".repeat(64) }, { ...packet(), version: 99 }, { ...packet(), reviews: [{ ...record, contentSha256: "b".repeat(64) }] }]) expect(check(value).submission).toBeNull();
  });
  it("rejects absent reviewer/evidence, undefined decisions, duplicate areas and an unexplained HOLD", () => {
    for (const patch of [{ reviewedBy: " " }, { evidenceRef: " " }, { decision: "" }, { note: "" }]) expect(check({ ...packet(), reviews: [{ ...record, ...patch }] }).submission).toBeNull();
    expect(check({ ...packet(), reviews: [record, record] }).submission).toBeNull();
    expect(check({ ...packet(), approved: true }).submission).toBeNull();
  });
  it("checks calendar dates, future dates and the Korea midnight boundary", () => {
    for (const reviewedAt of ["2026-02-30", "2026-10-13", "2026-01-01suffix"]) expect(check({ ...packet(), reviews: [{ ...record, reviewedAt }] }).submission).toBeNull();
    expect(check({ ...packet(), reviews: [{ ...record, reviewedAt: "2024-02-29" }] }).error).toBeNull();
    expect(reviewDateInSeoul(new Date("2026-10-11T15:01:00Z"))).toBe("2026-10-12");
  });
});
const temporaryRoots: string[] = [];
afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hero-review-import-")); temporaryRoots.push(root);
  const dir = join(root, "scenarios/research"); mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(draft);
  writeFileSync(join(root, "scenario.json"), content);
  const sha = createHash("sha256").update(content).digest("hex");
  writeFileSync(join(dir, "promotion-status.json"), JSON.stringify({ entries: [{ scenarioId: target.scenarioId, file: "scenario.json", status: "review_ready" }] }));
  const evidence = join(dir, "human-review-evidence.json");
  writeFileSync(evidence, JSON.stringify({ schemaVersion: 1, entries: [{ scenarioId: target.scenarioId, reviews: [] }] }));
  const input = join(root, "submission.json");
  const submission = { ...packet(), contentSha256: sha, reviews: [{ ...record, contentSha256: sha }] };
  writeFileSync(input, JSON.stringify(submission));
  const command = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", resolve("../../scripts/import-scenario-review.ts"), `--root=${root}`, `--file=${input}`, ...args], { encoding: "utf8", cwd: resolve("../..") });
  return { root, evidence, input, submission, command };
}
describe("review import CLI in an isolated temporary repository", () => {
  it("preflights without writes, requires human confirmation, and applies idempotently", () => {
    const f = fixture(); const original = readFileSync(f.evidence, "utf8");
    expect(f.command().status).toBe(0); expect(readFileSync(f.evidence, "utf8")).toBe(original);
    expect(f.command("--apply").status).toBe(1); expect(readFileSync(f.evidence, "utf8")).toBe(original);
    expect(f.command("--apply", "--confirm-human-review").status).toBe(0);
    expect(JSON.parse(readFileSync(f.evidence, "utf8")).entries[0].reviews).toHaveLength(1);
    expect(f.command("--apply", "--confirm-human-review").status).toBe(0);
    expect(JSON.parse(readFileSync(f.evidence, "utf8")).entries[0].reviews).toHaveLength(1);
  });
  it("refuses a locked import or changes to an already approved target", () => {
    const f = fixture(); const original = readFileSync(f.evidence, "utf8");
    writeFileSync(f.evidence + ".import.lock", "");
    expect(f.command("--apply", "--confirm-human-review").status).toBe(1);
    expect(readFileSync(f.evidence, "utf8")).toBe(original);
    unlinkSync(f.evidence + ".import.lock");
    writeFileSync(join(f.root, "scenarios/research/promotion-status.json"), JSON.stringify({ entries: [{ scenarioId: target.scenarioId, file: "scenario.json", status: "approved" }] }));
    expect(f.command("--apply", "--confirm-human-review").status).toBe(1);
    expect(readFileSync(f.evidence, "utf8")).toBe(original);
  });
  it("rejects the whole packet if a later record is invalid or older than the effective record", () => {
    const f = fixture();
    expect(f.command("--apply", "--confirm-human-review").status).toBe(0);
    const original = readFileSync(f.evidence, "utf8");
    writeFileSync(f.input, "not-json");
    const malformed = f.command("--apply", "--confirm-human-review");
    expect(malformed.status).toBe(1); expect(malformed.stderr).not.toContain("not-json");
    expect(readFileSync(f.evidence, "utf8")).toBe(original);
    writeFileSync(f.input, JSON.stringify({ ...f.submission, reviews: [{ ...f.submission.reviews[0], area: "just_culture" }, { ...f.submission.reviews[0], reviewedAt: "2026-10-10", note: "이전 검토" }] }));
    expect(f.command("--apply", "--confirm-human-review").status).toBe(1);
    expect(readFileSync(f.evidence, "utf8")).toBe(original);
    writeFileSync(f.input, JSON.stringify({ ...f.submission, reviews: [{ ...f.submission.reviews[0], area: "just_culture" }, { ...f.submission.reviews[0], reviewedBy: "" }] }));
    expect(f.command("--apply", "--confirm-human-review").status).toBe(1);
    expect(readFileSync(f.evidence, "utf8")).toBe(original);
  });
});
