import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { sha256Content } from "./scenario-approval-integrity.ts";
import {
  HUMAN_REVIEW_AREAS,
  humanReviewEvidencePath,
  loadHumanReviewEvidence,
  summarizeHumanReview,
  type HumanReviewArea,
  type HumanReviewDecision,
} from "./scenario-human-review.ts";

interface PromotionEntry {
  scenarioId: string;
  file: string;
  status: "tutorial_exception" | "source_hold" | "review_ready" | "approved";
}

interface PromotionManifest {
  entries: PromotionEntry[];
}

function fail(message: string): never {
  console.error(`RECORD_HUMAN_REVIEW_FAIL: ${message}`);
  process.exit(1);
}

function value(argv: string[], prefix: string): string | null {
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function isIsoDate(input: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(input) &&
    !Number.isNaN(Date.parse(`${input}T00:00:00Z`));
}

const argv = process.argv.slice(2);
const scenarioId = value(argv, "--scenario=");
const area = value(argv, "--area=") as HumanReviewArea | null;
const decision = value(argv, "--decision=") as HumanReviewDecision | null;
const reviewedBy = value(argv, "--reviewed-by=");
const reviewedAt = value(argv, "--reviewed-at=");
const evidenceRef = value(argv, "--evidence-ref=");
const note = value(argv, "--note=");
const apply = argv.includes("--apply");

if (!scenarioId) fail("missing --scenario=<scenario_id>");
if (!area || !HUMAN_REVIEW_AREAS.includes(area)) {
  fail(`--area must be one of: ${HUMAN_REVIEW_AREAS.join(", ")}`);
}
if (decision !== "pass" && decision !== "hold") {
  fail("--decision must be pass or hold");
}
if (!reviewedBy?.trim()) fail("--reviewed-by is required");
if (!reviewedAt || !isIsoDate(reviewedAt)) {
  fail("--reviewed-at=YYYY-MM-DD is required");
}
if (!evidenceRef?.trim()) fail("--evidence-ref is required");

const root = process.cwd();
const promotionPath = resolve(root, "scenarios/research/promotion-status.json");
const promotion = JSON.parse(
  readFileSync(promotionPath, "utf8"),
) as PromotionManifest;
const promotionEntry = promotion.entries.find(
  (entry) => entry.scenarioId === scenarioId,
);
if (!promotionEntry) fail(`unknown scenario: ${scenarioId}`);
if (promotionEntry.status === "tutorial_exception") {
  fail("tutorial scenarios do not require competitive human review evidence");
}

const scenarioPath = resolve(root, promotionEntry.file);
if (!existsSync(scenarioPath)) fail(`scenario file is missing: ${promotionEntry.file}`);
const contentSha256 = sha256Content(readFileSync(scenarioPath));

const manifest = loadHumanReviewEvidence(root);
const entry = manifest.entries.find((candidate) => candidate.scenarioId === scenarioId);
if (!entry) fail(`human-review evidence entry is missing: ${scenarioId}`);

const record = {
  area,
  contentSha256,
  decision,
  reviewedBy: reviewedBy.trim(),
  reviewedAt,
  evidenceRef: evidenceRef.trim(),
  ...(note?.trim() ? { note: note.trim() } : {}),
};

console.log(JSON.stringify({
  scenarioId,
  scenarioFile: promotionEntry.file,
  promotionStatus: promotionEntry.status,
  review: record,
  apply,
}, null, 2));

if (!apply) {
  console.log("RECORD_HUMAN_REVIEW_PREFLIGHT_ONLY: no files changed.");
  process.exit(0);
}

entry.reviews.push(record);
writeFileSync(
  humanReviewEvidencePath(root),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const summary = summarizeHumanReview(manifest, scenarioId, contentSha256);
console.log(
  `RECORD_HUMAN_REVIEW_APPLIED: ${scenarioId} ${area}=${decision}; passed=${summary.passedAreas.length}/${HUMAN_REVIEW_AREAS.length}`,
);
