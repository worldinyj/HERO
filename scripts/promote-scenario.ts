import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { sha256Content } from "./scenario-approval-integrity.ts";
import {
  loadHumanReviewEvidence,
  summarizeHumanReview,
} from "./scenario-human-review.ts";

type PromotionStatus =
  | "tutorial_exception"
  | "source_hold"
  | "review_ready"
  | "approved";

interface PromotionEntry {
  scenarioId: string;
  file: string;
  status: PromotionStatus;
  sourceRightsComplete: boolean;
  hfReviewComplete: boolean;
  anonymizationReviewComplete: boolean;
  humanReview: {
    status: "pending" | "approved" | "not_required";
    approvedBy: string | null;
    approvedAt: string | null;
  };
  approvedContentSha256?: string | null;
  blockers?: string[];
  notes?: string;
}

interface PromotionManifest {
  schemaVersion: number;
  updatedAt?: string;
  entries: PromotionEntry[];
}

interface SourceEvidenceEntry {
  scenarioId: string;
  sourceVerdict: "partial" | "complete";
  rightsVerdict: "partial" | "complete";
}

interface SourceEvidenceManifest {
  schemaVersion: number;
  entries: SourceEvidenceEntry[];
}

interface Options {
  scenarioId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  confirmHf: boolean;
  confirmAnonymization: boolean;
  confirmDebrief: boolean;
  apply: boolean;
}

function fail(message: string): never {
  console.error(`PROMOTE_FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const value = (prefix: string) =>
    argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    scenarioId: value("--scenario="),
    approvedBy: value("--approved-by="),
    approvedAt: value("--approved-at="),
    confirmHf: argv.includes("--confirm-hf"),
    confirmAnonymization: argv.includes("--confirm-anonymization"),
    confirmDebrief: argv.includes("--confirm-debrief"),
    apply: argv.includes("--apply"),
  };
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function outputPathForDraft(relativeDraftPath: string): string {
  return resolve(
    process.cwd(),
    "scenarios/data",
    basename(relativeDraftPath),
  );
}

const options = parseArgs(process.argv.slice(2));

if (!options.scenarioId) {
  fail("missing --scenario=<scenario_id>");
}

const manifestPath = resolve(
  process.cwd(),
  "scenarios/research/promotion-status.json",
);
const sourceEvidencePath = resolve(
  process.cwd(),
  "scenarios/research/source-evidence.json",
);

if (!existsSync(manifestPath)) {
  fail("promotion-status.json is missing");
}

if (!existsSync(sourceEvidencePath)) {
  fail("source-evidence.json is missing");
}

const manifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as PromotionManifest;
const sourceEvidence = JSON.parse(
  readFileSync(sourceEvidencePath, "utf8"),
) as SourceEvidenceManifest;

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
  fail("unsupported promotion manifest");
}

if (
  sourceEvidence.schemaVersion !== 1 ||
  !Array.isArray(sourceEvidence.entries)
) {
  fail("unsupported source evidence manifest");
}

const entry = manifest.entries.find(
  (candidate) => candidate.scenarioId === options.scenarioId,
);

if (!entry) {
  fail(`scenario is not registered in promotion manifest: ${options.scenarioId}`);
}

if (entry.status === "tutorial_exception") {
  fail("tutorial_exception scenarios do not use competitive promotion");
}

if (entry.status === "approved") {
  if (options.apply) {
    fail("scenario is already approved");
  }

  console.log(JSON.stringify({
    scenarioId: entry.scenarioId,
    currentStatus: entry.status,
    sourceRightsComplete: entry.sourceRightsComplete,
    file: entry.file,
    humanReview: entry.humanReview,
    approvedContentSha256: entry.approvedContentSha256 ?? null,
    apply: false,
  }, null, 2));
  console.log("PROMOTE_PREFLIGHT_ALREADY_APPROVED: no files changed.");
  process.exit(0);
}

if (!entry.sourceRightsComplete) {
  fail(
    "sourceRightsComplete=false. Resolve and document source/rights evidence before human approval.",
  );
}

const evidence = sourceEvidence.entries.find(
  (candidate) => candidate.scenarioId === entry.scenarioId,
);

if (!evidence) {
  fail("scenario has no source-evidence record");
}

if (
  evidence.sourceVerdict !== "complete" ||
  evidence.rightsVerdict !== "complete"
) {
  fail(
    `source evidence is incomplete: source=${evidence.sourceVerdict}, rights=${evidence.rightsVerdict}`,
  );
}

if (!entry.file.startsWith("scenarios/drafts/")) {
  fail(`promotion source must be under scenarios/drafts: ${entry.file}`);
}

const draftPath = resolve(process.cwd(), entry.file);

if (!existsSync(draftPath)) {
  fail(`draft file does not exist: ${entry.file}`);
}

const draftContent = readFileSync(draftPath, "utf8");
const draftSha256 = sha256Content(draftContent);
const rawScenario = JSON.parse(draftContent);
const parsed = ScenarioSchema.safeParse(rawScenario);

if (!parsed.success) {
  fail(
    `scenario schema validation failed: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

if (parsed.data.id !== entry.scenarioId) {
  fail(
    `manifest scenarioId does not match draft id: ${entry.scenarioId} != ${parsed.data.id}`,
  );
}

const humanReviewEvidence = loadHumanReviewEvidence(process.cwd());
const humanReviewSummary = summarizeHumanReview(
  humanReviewEvidence,
  entry.scenarioId,
  draftSha256,
);

const missingConfirmations = [
  !options.confirmHf ? "--confirm-hf" : null,
  !options.confirmAnonymization ? "--confirm-anonymization" : null,
  !options.confirmDebrief ? "--confirm-debrief" : null,
].filter((value): value is string => value !== null);

const preflight = {
  scenarioId: entry.scenarioId,
  currentStatus: entry.status,
  sourceRightsComplete: entry.sourceRightsComplete,
  draft: entry.file,
  target: `scenarios/data/${basename(entry.file)}`,
  draftSha256,
  approvedBy: options.approvedBy,
  approvedAt: options.approvedAt,
  confirmations: {
    hf: options.confirmHf,
    anonymization: options.confirmAnonymization,
    incidentDebrief: options.confirmDebrief,
  },
  humanReviewEvidence: humanReviewSummary,
  apply: options.apply,
};

if (!options.apply) {
  console.log(JSON.stringify(preflight, null, 2));
  console.log(
    "PROMOTE_PREFLIGHT_ONLY: no files changed. Add --apply only after the named human reviewer has completed every confirmation.",
  );
  process.exit(0);
}

if (!humanReviewSummary.complete) {
  fail(
    `human review evidence is incomplete for current content SHA: missing=${humanReviewSummary.missingAreas.join(",") || "-"}; held=${humanReviewSummary.heldAreas.join(",") || "-"}`,
  );
}

if (!options.approvedBy?.trim()) {
  fail("--approved-by=<reviewer name/role> is required with --apply");
}

if (!options.approvedAt || !isIsoDate(options.approvedAt)) {
  fail("--approved-at=YYYY-MM-DD is required with --apply");
}

if (missingConfirmations.length > 0) {
  fail(
    `missing required human-review confirmations: ${missingConfirmations.join(", ")}`,
  );
}

const targetPath = outputPathForDraft(entry.file);
const targetRelative = `scenarios/data/${basename(entry.file)}`;

if (existsSync(targetPath)) {
  fail(`target already exists: ${targetRelative}`);
}

mkdirSync(dirname(targetPath), { recursive: true });
copyFileSync(draftPath, targetPath);

entry.status = "approved";
entry.hfReviewComplete = true;
entry.anonymizationReviewComplete = true;
entry.humanReview = {
  status: "approved",
  approvedBy: options.approvedBy.trim(),
  approvedAt: options.approvedAt,
};
entry.approvedContentSha256 = draftSha256;
entry.file = targetRelative;
entry.blockers = [];
entry.notes = [
  entry.notes?.trim(),
  `Human promotion recorded ${options.approvedAt} by ${options.approvedBy.trim()}; HF, anonymization/operational-overexposure, and incidentDebrief confirmations were explicitly attested. Approved content SHA-256: ${draftSha256}.`,
]
  .filter(Boolean)
  .join(" ");

manifest.updatedAt = options.approvedAt;
writeFileSync(
  manifestPath,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

rmSync(draftPath);

console.log(JSON.stringify({
  ...preflight,
  target: targetRelative,
  approvedContentSha256: draftSha256,
  apply: true,
}, null, 2));
console.log(
  "PROMOTE_APPLIED: run pnpm check:scenario-promotion, pnpm validate:scenario, pnpm simulate:scenario, and pnpm check:mvp-readiness before committing.",
);
