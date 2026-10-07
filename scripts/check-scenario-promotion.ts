import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  approvedContentHashMatches,
  isSha256Hex,
} from "./scenario-approval-integrity.ts";

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
}

interface PromotionManifest {
  schemaVersion: number;
  entries: PromotionEntry[];
}

function fail(message: string): never {
  console.error(`PROMOTION_GUARD_FAIL: ${message}`);
  process.exit(1);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

const root = process.cwd();
const manifestPath = resolve(
  root,
  "scenarios/research/promotion-status.json",
);

if (!existsSync(manifestPath)) {
  fail("promotion-status.json is missing");
}

const manifest = readJson(manifestPath) as PromotionManifest;

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
  fail("unsupported promotion manifest");
}

const entries = new Map<string, PromotionEntry>();

for (const entry of manifest.entries) {
  if (!entry.scenarioId || entries.has(entry.scenarioId)) {
    fail(`duplicate or empty manifest scenarioId: ${entry.scenarioId}`);
  }

  if (!existsSync(resolve(root, entry.file))) {
    fail(`manifest file does not exist: ${entry.file}`);
  }

  entries.set(entry.scenarioId, entry);
}

function scenarioFiles(directory: string): string[] {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];

  return readdirSync(absolute)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => resolve(absolute, name));
}

for (const file of scenarioFiles("scenarios/data")) {
  const scenario = readJson(file) as { id?: string };
  const id = scenario.id;

  if (!id) fail(`shipping scenario missing id: ${file}`);

  const entry = entries.get(id);
  if (!entry) fail(`shipping scenario has no promotion record: ${id}`);

  if (entry.status === "tutorial_exception" && id === "s00_tutorial") {
    continue;
  }

  const approved =
    entry.status === "approved" &&
    entry.sourceRightsComplete === true &&
    entry.hfReviewComplete === true &&
    entry.anonymizationReviewComplete === true &&
    entry.humanReview.status === "approved" &&
    typeof entry.humanReview.approvedBy === "string" &&
    entry.humanReview.approvedBy.trim().length > 0 &&
    typeof entry.humanReview.approvedAt === "string" &&
    entry.humanReview.approvedAt.trim().length > 0;

  if (!approved) {
    fail(
      `competitive shipping scenario is not fully human-approved: ${id} (${entry.status})`,
    );
  }

  if (!isSha256Hex(entry.approvedContentSha256)) {
    fail(
      `approved competitive scenario is missing a valid approvedContentSha256: ${id}`,
    );
  }

  const shippingContent = readFileSync(file);
  if (!approvedContentHashMatches(entry.approvedContentSha256, shippingContent)) {
    fail(
      `approved competitive scenario content changed after human approval: ${id}`,
    );
  }
}

for (const file of scenarioFiles("scenarios/drafts")) {
  const scenario = readJson(file) as { id?: string };
  const id = scenario.id;

  if (!id) fail(`draft scenario missing id: ${file}`);

  const entry = entries.get(id);
  if (!entry) fail(`draft scenario has no promotion record: ${id}`);

  if (entry.status === "approved") {
    fail(
      `approved scenario must be promoted out of drafts before shipping: ${id}`,
    );
  }
}

console.log(
  `PROMOTION_GUARD_PASS: ${entries.size} manifest entries, competitive data requires explicit human approval.`,
);
