import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSha256Hex, sha256Content } from "./scenario-approval-integrity.ts";
import {
  HUMAN_REVIEW_AREAS,
  loadHumanReviewEvidence,
  summarizeHumanReview,
  type HumanReviewArea,
} from "./scenario-human-review.ts";

interface PromotionEntry {
  scenarioId: string;
  file: string;
  status: "tutorial_exception" | "source_hold" | "review_ready" | "approved";
  humanReview: {
    status: "pending" | "approved" | "not_required";
  };
  approvedContentSha256?: string | null;
}

interface PromotionManifest {
  schemaVersion: number;
  entries: PromotionEntry[];
}

function fail(message: string): never {
  console.error(`HUMAN_REVIEW_EVIDENCE_FAIL: ${message}`);
  process.exit(1);
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

const root = process.cwd();
const promotionPath = resolve(root, "scenarios/research/promotion-status.json");
if (!existsSync(promotionPath)) fail("promotion-status.json is missing");

const promotion = JSON.parse(
  readFileSync(promotionPath, "utf8"),
) as PromotionManifest;
const evidence = loadHumanReviewEvidence(root);

if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.entries)) {
  fail("unsupported human-review evidence manifest");
}

const promotionIds = new Set(
  promotion.entries
    .filter((entry) => entry.status !== "tutorial_exception")
    .map((entry) => entry.scenarioId),
);

const seen = new Set<string>();
for (const entry of evidence.entries) {
  if (!entry.scenarioId || seen.has(entry.scenarioId)) {
    fail(`duplicate or empty scenarioId: ${entry.scenarioId}`);
  }
  seen.add(entry.scenarioId);

  if (!promotionIds.has(entry.scenarioId)) {
    fail(`review evidence references unknown competitive scenario: ${entry.scenarioId}`);
  }

  if (!Array.isArray(entry.reviews)) {
    fail(`reviews must be an array: ${entry.scenarioId}`);
  }

  for (const [index, review] of entry.reviews.entries()) {
    if (!HUMAN_REVIEW_AREAS.includes(review.area as HumanReviewArea)) {
      fail(`unsupported review area: ${entry.scenarioId}#${index} ${review.area}`);
    }
    if (!isSha256Hex(review.contentSha256)) {
      fail(`invalid content SHA-256: ${entry.scenarioId}#${index}`);
    }
    if (review.decision !== "pass" && review.decision !== "hold") {
      fail(`invalid review decision: ${entry.scenarioId}#${index}`);
    }
    if (!review.reviewedBy?.trim()) {
      fail(`reviewedBy is required: ${entry.scenarioId}#${index}`);
    }
    if (!isIsoDate(review.reviewedAt)) {
      fail(`reviewedAt must be YYYY-MM-DD: ${entry.scenarioId}#${index}`);
    }
    if (!review.evidenceRef?.trim()) {
      fail(`evidenceRef is required: ${entry.scenarioId}#${index}`);
    }
  }
}

for (const scenarioId of promotionIds) {
  if (!seen.has(scenarioId)) {
    fail(`competitive scenario has no human-review evidence entry: ${scenarioId}`);
  }
}

for (const entry of promotion.entries) {
  if (entry.status === "tutorial_exception") continue;

  const scenarioPath = resolve(root, entry.file);
  if (!existsSync(scenarioPath)) {
    fail(`scenario file is missing: ${entry.file}`);
  }

  const currentSha = sha256Content(readFileSync(scenarioPath));
  const targetSha =
    entry.status === "approved"
      ? entry.approvedContentSha256 ?? ""
      : currentSha;
  const summary = summarizeHumanReview(evidence, entry.scenarioId, targetSha);

  if (
    entry.status === "approved" ||
    entry.humanReview.status === "approved"
  ) {
    if (!isSha256Hex(targetSha)) {
      fail(`approved scenario has no valid approved SHA: ${entry.scenarioId}`);
    }
    if (!summary.complete) {
      fail(
        `approved scenario lacks complete human-review evidence for approved SHA: ${entry.scenarioId}; missing=${summary.missingAreas.join(",")}; held=${summary.heldAreas.join(",")}`,
      );
    }
  }

  console.log(
    `HUMAN_REVIEW_STATUS ${entry.scenarioId} sha=${targetSha} passed=${summary.passedAreas.length}/${HUMAN_REVIEW_AREAS.length} missing=${summary.missingAreas.join(",") || "-"} held=${summary.heldAreas.join(",") || "-"}`,
  );
}

console.log("HUMAN_REVIEW_EVIDENCE_PASS");
