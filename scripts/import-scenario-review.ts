import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { sha256Content } from "./scenario-approval-integrity.ts";
import { canonicalContent } from "../apps/web/src/features/admin/scenarioReview.ts";
import { validateReviewSubmission } from "../apps/web/src/features/admin/scenarioReviewSubmission.ts";
import { humanReviewEvidencePath, loadHumanReviewEvidence } from "./scenario-human-review.ts";

const args = process.argv.slice(2);
const value = (prefix: string) => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const root = resolve(value("--root=") ?? process.cwd());
const file = value("--file=");
const apply = args.includes("--apply");
let lock: number | undefined;
const lockPath = humanReviewEvidencePath(root) + ".import.lock";
let temporary: string | undefined;
try {
  if (!file) throw new Error("missing --file=<review_submission.json>");
  if (apply && !args.includes("--confirm-human-review")) throw new Error("--apply requires --confirm-human-review after verifying the actual human review");
  if (apply) {
    try { lock = openSync(lockPath, "wx"); }
    catch (cause) {
      throw new Error((cause as NodeJS.ErrnoException).code === "EEXIST"
        ? "review_import_locked: another import may be running; no changes made"
        : "review_storage_unavailable: cannot acquire the import lock");
    }
  }
  let packet;
  try { packet = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch { throw new Error("invalid_review_submission_json: cannot read a valid review result file"); }
  const promotion = JSON.parse(readFileSync(resolve(root, "scenarios/research/promotion-status.json"), "utf8"));
  const source = promotion.entries.find((entry: { scenarioId: string }) => entry.scenarioId === packet?.scenarioId);
  if (!source || source.status === "tutorial_exception") throw new Error("unknown competitive review target");
  const scenarioFile = resolve(root, source.file);
  const bytes = readFileSync(scenarioFile);
  const scenario = ScenarioSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (scenario.id !== source.scenarioId) throw new Error("scenario identity mismatch");
  const sha = sha256Content(bytes);
  const validated = validateReviewSubmission(packet, { scenarioId: scenario.id, version: scenario.version, contentSha256: sha });
  if (!validated.submission) throw new Error(validated.error ?? "invalid_review_submission");
  const manifest = loadHumanReviewEvidence(root);
  const entry = manifest.entries.find(entry => entry.scenarioId === scenario.id);
  if (!entry || !Array.isArray(entry.reviews)) throw new Error("missing review evidence entry");
  let added = 0; let skipped = 0;
  for (const record of validated.submission.reviews) {
    if (entry.reviews.some(previous => canonicalContent(previous) === canonicalContent(record))) { skipped += 1; continue; }
    const effective = entry.reviews.filter(previous => previous.area === record.area && previous.contentSha256 === sha).at(-1);
    if (effective && record.reviewedAt < effective.reviewedAt) throw new Error("older_review_rejected: a newer review for this area already exists");
    if (source.status === "approved") throw new Error("approved_target_requires_review_reset: return the content to review before adding new evidence");
    entry.reviews.push(record); added += 1;
  }
  // Validate all records before writing; a failed later row cannot partially apply.
  if (apply && added > 0) {
    if (sha256Content(readFileSync(scenarioFile)) !== sha) throw new Error("review_content_changed: retry against the current content");
    temporary = resolve(dirname(humanReviewEvidencePath(root)), `.human-review-import-${process.pid}.tmp`);
    writeFileSync(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temporary, humanReviewEvidencePath(root)); temporary = undefined;
  }
  console.log(`REVIEW_IMPORT_${apply ? "APPLIED" : "PREFLIGHT_ONLY"} scenario=${scenario.id} added=${added} duplicate=${skipped}`);
  console.log("No promotion, database update or automatic approval was performed.");
} catch (error) {
  console.error(`REVIEW_IMPORT_FAIL: ${error instanceof Error ? error.message : "invalid_submission"}`);
  process.exitCode = 1;
} finally {
  if (temporary && existsSync(temporary)) unlinkSync(temporary);
  if (lock !== undefined) { closeSync(lock); unlinkSync(lockPath); }
}
