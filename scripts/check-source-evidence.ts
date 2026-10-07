import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Verdict = "partial" | "complete";
type SourceClass =
  | "official_primary"
  | "official_locator"
  | "government_relay"
  | "academic"
  | "media";
type RightsStatus =
  | "verified"
  | "unverified"
  | "not_used_for_reproduction"
  | "not_applicable";

interface EvidenceSource {
  id: string;
  authority: string;
  sourceClass: SourceClass;
  url: string;
  eventSpecific: boolean;
  purpose: string[];
  rights: {
    status: RightsStatus;
    license: string | null;
    evidenceUrl: string | null;
  };
}

interface EvidenceEntry {
  scenarioId: string;
  sourceVerdict: Verdict;
  rightsVerdict: Verdict;
  missing: string[];
  sources: EvidenceSource[];
}

interface EvidenceManifest {
  schemaVersion: number;
  entries: EvidenceEntry[];
}

interface PromotionEntry {
  scenarioId: string;
  status: "tutorial_exception" | "source_hold" | "review_ready" | "approved";
  sourceRightsComplete: boolean;
}

interface PromotionManifest {
  schemaVersion: number;
  entries: PromotionEntry[];
}

function fail(message: string): never {
  console.error(`SOURCE_EVIDENCE_GUARD_FAIL: ${message}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const root = process.cwd();
const evidencePath = resolve(
  root,
  "scenarios/research/source-evidence.json",
);
const promotionPath = resolve(
  root,
  "scenarios/research/promotion-status.json",
);

if (!existsSync(evidencePath)) {
  fail("source-evidence.json is missing");
}

if (!existsSync(promotionPath)) {
  fail("promotion-status.json is missing");
}

const evidence = readJson<EvidenceManifest>(evidencePath);
const promotion = readJson<PromotionManifest>(promotionPath);

if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.entries)) {
  fail("unsupported source evidence manifest");
}

if (promotion.schemaVersion !== 1 || !Array.isArray(promotion.entries)) {
  fail("unsupported promotion manifest");
}

const evidenceByScenario = new Map<string, EvidenceEntry>();

for (const entry of evidence.entries) {
  if (!entry.scenarioId || evidenceByScenario.has(entry.scenarioId)) {
    fail(`duplicate or empty evidence scenarioId: ${entry.scenarioId}`);
  }

  if (!Array.isArray(entry.sources) || entry.sources.length === 0) {
    fail(`evidence has no sources: ${entry.scenarioId}`);
  }

  const sourceIds = new Set<string>();

  for (const source of entry.sources) {
    if (!source.id || sourceIds.has(source.id)) {
      fail(`duplicate or empty source id for ${entry.scenarioId}: ${source.id}`);
    }
    sourceIds.add(source.id);

    if (!source.authority.trim()) {
      fail(`source authority is empty: ${entry.scenarioId}/${source.id}`);
    }

    if (!validUrl(source.url)) {
      fail(`invalid source URL: ${entry.scenarioId}/${source.id}`);
    }

    if (!Array.isArray(source.purpose) || source.purpose.length === 0) {
      fail(`source purpose is empty: ${entry.scenarioId}/${source.id}`);
    }

    if (source.rights.status === "verified") {
      if (!source.rights.license?.trim()) {
        fail(`verified rights missing license: ${entry.scenarioId}/${source.id}`);
      }
      if (
        !source.rights.evidenceUrl ||
        !validUrl(source.rights.evidenceUrl)
      ) {
        fail(`verified rights missing evidence URL: ${entry.scenarioId}/${source.id}`);
      }
    }
  }

  const hasOfficialEventSource = entry.sources.some(
    (source) =>
      source.sourceClass === "official_primary" &&
      source.eventSpecific === true,
  );

  const hasVerifiedRights = entry.sources.some(
    (source) => source.rights.status === "verified",
  );

  if (entry.sourceVerdict === "complete" && !hasOfficialEventSource) {
    fail(
      `complete source verdict requires an event-specific official primary source: ${entry.scenarioId}`,
    );
  }

  if (entry.rightsVerdict === "complete" && !hasVerifiedRights) {
    fail(
      `complete rights verdict requires verified rights evidence: ${entry.scenarioId}`,
    );
  }

  if (
    (entry.sourceVerdict === "complete" ||
      entry.rightsVerdict === "complete") &&
    entry.missing.length > 0
  ) {
    fail(
      `complete verdict cannot retain missing blockers: ${entry.scenarioId}`,
    );
  }

  evidenceByScenario.set(entry.scenarioId, entry);
}

for (const entry of promotion.entries) {
  if (entry.status === "tutorial_exception") continue;

  const source = evidenceByScenario.get(entry.scenarioId);

  if (!source) {
    fail(`competitive scenario missing source evidence: ${entry.scenarioId}`);
  }

  const evidenceComplete =
    source.sourceVerdict === "complete" &&
    source.rightsVerdict === "complete";

  if (entry.sourceRightsComplete && !evidenceComplete) {
    fail(
      `sourceRightsComplete=true conflicts with incomplete evidence: ${entry.scenarioId}`,
    );
  }

  if (entry.status === "approved" && !evidenceComplete) {
    fail(
      `approved scenario has incomplete source evidence: ${entry.scenarioId}`,
    );
  }
}

console.log(
  `SOURCE_EVIDENCE_GUARD_PASS: ${evidenceByScenario.size} competitive evidence records are consistent with promotion-status.json.`,
);
