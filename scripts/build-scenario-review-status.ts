import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { canonicalContent, type ReviewTarget } from "../apps/web/src/features/admin/scenarioReview.ts";
import { loadHumanReviewEvidence, summarizeHumanReview, HUMAN_REVIEW_AREAS } from "./scenario-human-review.ts";
import { sha256Content } from "./scenario-approval-integrity.ts";

const promotion = JSON.parse(readFileSync("scenarios/research/promotion-status.json", "utf8"));
const entry = promotion.entries.find((e: { scenarioId: string }) => e.scenarioId === "s03_procedure_reality_gap");
if (!entry) throw new Error("S03 review target is missing");
const raw = readFileSync(entry.file);
const scenario = ScenarioSchema.parse(JSON.parse(raw.toString("utf8")));
const contentSha256 = sha256Content(raw);
const summary = summarizeHumanReview(loadHumanReviewEvidence(), scenario.id, contentSha256);
const target: ReviewTarget = {
  scenarioId: scenario.id, version: scenario.version, title: scenario.title, contentSha256,
  previewSha256: createHash("sha256").update(canonicalContent(scenario)).digest("hex"),
  sourceRightsComplete: entry.sourceRightsComplete === true,
  approved: entry.status === "approved" && entry.approvedContentSha256 === contentSha256 && summary.complete
    && entry.sourceRightsComplete === true && entry.hfReviewComplete === true
    && entry.anonymizationReviewComplete === true && entry.humanReview.status === "approved",
  areas: HUMAN_REVIEW_AREAS.map(area => ({ area, decision: summary.passedAreas.includes(area) ? "pass" : summary.heldAreas.includes(area) ? "hold" : "pending" })),
};
// Export only the progress summary. No draft content, reviewer names, internal
// source URLs, evidence references or notes may enter the static web bundle.
const output = JSON.stringify(target, null, 2) + "\n";
const path = "apps/web/src/features/admin/scenarioReviewStatus.generated.json";
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output) throw new Error("Scenario review summary is stale; run pnpm build:scenario-review-status");
  console.log("SCENARIO_REVIEW_STATUS_PASS");
} else {
  writeFileSync(path, output);
  console.log("SCENARIO_REVIEW_STATUS_GENERATED");
}
