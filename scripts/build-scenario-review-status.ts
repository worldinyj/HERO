import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { canonicalContent, type ReviewTarget } from "../apps/web/src/features/admin/scenarioReview.ts";
import { loadHumanReviewEvidence, summarizeHumanReview, HUMAN_REVIEW_AREAS } from "./scenario-human-review.ts";
import { sha256Content } from "./scenario-approval-integrity.ts";

const promotion = JSON.parse(readFileSync("scenarios/research/promotion-status.json", "utf8"));
type Entry = { scenarioId: string; file: string; status: string; sourceRightsComplete: boolean; approvedContentSha256?: string; hfReviewComplete: boolean; anonymizationReviewComplete: boolean; humanReview: { status: string } };
const entries = promotion.entries as Entry[];
function makeTarget(entry: Entry): ReviewTarget {
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
return target;
}
const targets = entries.filter(entry => ["review_ready", "approved"].includes(entry.status)).map(makeTarget);
const target = targets.find(target => target.scenarioId === "s03_procedure_reality_gap");
if (!target) throw new Error("S03 review target is missing");
// Export only the progress summary. No draft content, reviewer names, internal
// source URLs, evidence references or notes may enter the static web bundle.
const htoTarget = targets.find(target => target.scenarioId === "s02_equipment_identity");
if (!htoTarget) throw new Error("S02 HTO review target is missing");
const artifactFiles = [
  "apps/web/src/features/admin/HtoReviewDraft.tsx",
  "apps/web/src/features/admin/s02HtoReview.ts",
  "apps/web/src/features/admin/HtoConditionComparison.tsx",
  "apps/web/src/features/admin/htoComparisonModel.ts",
  "apps/web/src/features/admin/HtoDraftFeedback.tsx",
  "apps/web/src/styles.css",
].map(path => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") }));
const hto = {
  artifactId: "s02_hto_admin_draft",
  scenarioId: htoTarget.scenarioId,
  version: htoTarget.version,
  contentSha256: htoTarget.contentSha256,
  previewSha256: htoTarget.previewSha256,
  artifactSha256: createHash("sha256").update(canonicalContent({ contentSha256: htoTarget.contentSha256, files: artifactFiles })).digest("hex"),
};
const outputs = [
  ["apps/web/src/features/admin/scenarioReviewStatus.generated.json", target],
  ["apps/web/src/features/admin/scenarioReviewTargets.generated.json", targets],
  ["apps/web/src/features/admin/htoReviewTarget.generated.json", hto],
] as const;
for (const [path, value] of outputs) {
  const output = JSON.stringify(value, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== output) throw new Error("Scenario review summary is stale; run pnpm build:scenario-review-status");
  } else writeFileSync(path, output);
}
console.log(process.argv.includes("--check") ? "SCENARIO_REVIEW_STATUS_PASS" : "SCENARIO_REVIEW_STATUS_GENERATED");
