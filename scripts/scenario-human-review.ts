import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const HUMAN_REVIEW_AREAS = [
  "hf_accuracy",
  "operations_context",
  "anonymization",
  "just_culture",
  "incident_debrief",
] as const;

export type HumanReviewArea = (typeof HUMAN_REVIEW_AREAS)[number];
export type HumanReviewDecision = "pass" | "hold";

export interface HumanReviewRecord {
  area: HumanReviewArea;
  contentSha256: string;
  decision: HumanReviewDecision;
  reviewedBy: string;
  reviewedAt: string;
  evidenceRef: string;
  note?: string;
}

export interface HumanReviewEvidenceEntry {
  scenarioId: string;
  reviews: HumanReviewRecord[];
}

export interface HumanReviewEvidenceManifest {
  schemaVersion: 1;
  entries: HumanReviewEvidenceEntry[];
}

export interface HumanReviewSummary {
  complete: boolean;
  passedAreas: HumanReviewArea[];
  missingAreas: HumanReviewArea[];
  heldAreas: HumanReviewArea[];
}

export function humanReviewEvidencePath(root = process.cwd()): string {
  return resolve(root, "scenarios/research/human-review-evidence.json");
}

export function loadHumanReviewEvidence(
  root = process.cwd(),
): HumanReviewEvidenceManifest {
  const path = humanReviewEvidencePath(root);
  if (!existsSync(path)) {
    throw new Error("human-review-evidence.json is missing");
  }

  return JSON.parse(readFileSync(path, "utf8")) as HumanReviewEvidenceManifest;
}

export function summarizeHumanReview(
  manifest: HumanReviewEvidenceManifest,
  scenarioId: string,
  contentSha256: string,
): HumanReviewSummary {
  const entry = manifest.entries.find(
    (candidate) => candidate.scenarioId === scenarioId,
  );

  const effective = new Map<HumanReviewArea, HumanReviewRecord>();

  for (const review of entry?.reviews ?? []) {
    if (review.contentSha256 !== contentSha256) continue;
    effective.set(review.area, review);
  }

  const passedAreas = HUMAN_REVIEW_AREAS.filter(
    (area) => effective.get(area)?.decision === "pass",
  );
  const heldAreas = HUMAN_REVIEW_AREAS.filter(
    (area) => effective.get(area)?.decision === "hold",
  );
  const missingAreas = HUMAN_REVIEW_AREAS.filter(
    (area) => !effective.has(area),
  );

  return {
    complete: passedAreas.length === HUMAN_REVIEW_AREAS.length,
    passedAreas,
    missingAreas,
    heldAreas,
  };
}
