import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";

type Classification = "direct" | "root" | "contributing";

interface TraceCause {
  id: string;
  classification: Classification;
  label: string;
  provenance: string;
  evidenceAnchors: string[];
  barriers: string[];
  correctiveActions: string[];
}

interface TraceBarrier {
  id: string;
  label: string;
}

interface TraceAction {
  id: string;
  label: string;
  evidenceAnchor: string;
}

interface TraceEntry {
  scenarioId: string;
  scenarioVersion: number;
  sourceDocument: {
    authority: string;
    documentId: string;
    title: string;
    usage: string;
    publicAsset: boolean;
  };
  causes: TraceCause[];
  barriers: TraceBarrier[];
  correctiveActions: TraceAction[];
  recoveryBoundary: {
    separateFromInitiatingCause: boolean;
    topics: string[];
  };
  publicSanitization: {
    required: boolean;
    forbiddenTerms: string[];
  };
}

interface TraceManifest {
  schemaVersion: number;
  updatedAt: string;
  entries: TraceEntry[];
}

interface PromotionEntry {
  scenarioId: string;
  file: string;
  status: "tutorial_exception" | "source_hold" | "review_ready" | "approved";
  sourceRightsComplete: boolean;
}

interface PromotionManifest {
  schemaVersion: number;
  entries: PromotionEntry[];
}

function fail(message: string): never {
  console.error(`CAUSE_TRACEABILITY_FAIL: ${message}`);
  process.exit(1);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function uniqueIds<T extends { id: string }>(
  items: T[],
  label: string,
  scenarioId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id?.trim()) fail(`${scenarioId}: empty ${label} id`);
    if (ids.has(item.id)) fail(`${scenarioId}: duplicate ${label} id ${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

const root = process.cwd();
const tracePath = resolve(root, "scenarios/research/cause-traceability.json");
const promotionPath = resolve(root, "scenarios/research/promotion-status.json");

if (!existsSync(tracePath)) fail("cause-traceability.json is missing");
if (!existsSync(promotionPath)) fail("promotion-status.json is missing");

const manifest = readJson<TraceManifest>(tracePath);
const promotion = readJson<PromotionManifest>(promotionPath);

if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
  fail("unsupported cause traceability manifest");
}
if (promotion.schemaVersion !== 1 || !Array.isArray(promotion.entries)) {
  fail("unsupported promotion manifest");
}

const traceByScenario = new Map<string, TraceEntry>();
for (const entry of manifest.entries) {
  if (!entry.scenarioId?.trim() || traceByScenario.has(entry.scenarioId)) {
    fail(`duplicate or empty scenarioId: ${entry.scenarioId}`);
  }
  traceByScenario.set(entry.scenarioId, entry);
}

const requiredScenarioIds = promotion.entries
  .filter(
    (entry) =>
      entry.status !== "tutorial_exception" &&
      entry.sourceRightsComplete === true &&
      (entry.status === "review_ready" || entry.status === "approved"),
  )
  .map((entry) => entry.scenarioId);

for (const scenarioId of requiredScenarioIds) {
  if (!traceByScenario.has(scenarioId)) {
    fail(`review-ready/approved sourced scenario lacks cause traceability: ${scenarioId}`);
  }
}

for (const entry of manifest.entries) {
  const promotionEntry = promotion.entries.find(
    (candidate) => candidate.scenarioId === entry.scenarioId,
  );
  if (!promotionEntry) {
    fail(`traceability references unknown promotion scenario: ${entry.scenarioId}`);
  }

  const scenarioPath = resolve(root, promotionEntry.file);
  if (!existsSync(scenarioPath)) {
    fail(`scenario file is missing: ${promotionEntry.file}`);
  }

  const scenarioText = readFileSync(scenarioPath, "utf8");
  const scenario = ScenarioSchema.parse(JSON.parse(scenarioText));
  const debrief = scenario.incidentDebrief;

  if (!debrief) fail(`${entry.scenarioId}: incidentDebrief is required`);
  if (scenario.version !== entry.scenarioVersion) {
    fail(
      `${entry.scenarioId}: scenarioVersion mismatch trace=${entry.scenarioVersion} actual=${scenario.version}`,
    );
  }

  if (!entry.sourceDocument.authority?.trim()) {
    fail(`${entry.scenarioId}: source authority is empty`);
  }
  if (!entry.sourceDocument.documentId?.trim()) {
    fail(`${entry.scenarioId}: source documentId is empty`);
  }
  if (entry.sourceDocument.usage !== "internal_factual_hf_analysis") {
    fail(`${entry.scenarioId}: unsupported source usage ${entry.sourceDocument.usage}`);
  }
  if (entry.sourceDocument.publicAsset !== false) {
    fail(`${entry.scenarioId}: detailed investigation document must not be treated as a public asset`);
  }

  const causeIds = uniqueIds(entry.causes, "cause", entry.scenarioId);
  const barrierIds = uniqueIds(entry.barriers, "barrier", entry.scenarioId);
  const actionIds = uniqueIds(entry.correctiveActions, "corrective action", entry.scenarioId);

  if (causeIds.size === 0) fail(`${entry.scenarioId}: causes are empty`);
  if (barrierIds.size === 0) fail(`${entry.scenarioId}: barriers are empty`);
  if (actionIds.size === 0) fail(`${entry.scenarioId}: corrective actions are empty`);

  for (const cause of entry.causes) {
    if (!["direct", "root", "contributing"].includes(cause.classification)) {
      fail(`${entry.scenarioId}/${cause.id}: unsupported classification`);
    }
    if (!cause.label?.trim()) fail(`${entry.scenarioId}/${cause.id}: label is empty`);
    if (!cause.provenance?.trim()) fail(`${entry.scenarioId}/${cause.id}: provenance is empty`);
    if (cause.classification === "root" && !cause.provenance.startsWith("hero_classification_")) {
      fail(
        `${entry.scenarioId}/${cause.id}: HERO root cause must be explicitly marked as HERO classification`,
      );
    }
    if (!Array.isArray(cause.evidenceAnchors) || cause.evidenceAnchors.length === 0) {
      fail(`${entry.scenarioId}/${cause.id}: evidence anchors are required`);
    }
    if (!Array.isArray(cause.barriers) || cause.barriers.length === 0) {
      fail(`${entry.scenarioId}/${cause.id}: at least one barrier link is required`);
    }
    if (!Array.isArray(cause.correctiveActions) || cause.correctiveActions.length === 0) {
      fail(`${entry.scenarioId}/${cause.id}: at least one corrective-action link is required`);
    }

    for (const barrierId of cause.barriers) {
      if (!barrierIds.has(barrierId)) {
        fail(`${entry.scenarioId}/${cause.id}: unknown barrier ${barrierId}`);
      }
    }
    for (const actionId of cause.correctiveActions) {
      if (!actionIds.has(actionId)) {
        fail(`${entry.scenarioId}/${cause.id}: unknown corrective action ${actionId}`);
      }
    }
  }

  for (const action of entry.correctiveActions) {
    if (!action.label?.trim() || !action.evidenceAnchor?.trim()) {
      fail(`${entry.scenarioId}/${action.id}: action label/evidence anchor is required`);
    }
  }

  const counts = {
    direct: entry.causes.filter((cause) => cause.classification === "direct").length,
    root: entry.causes.filter((cause) => cause.classification === "root").length,
    contributing: entry.causes.filter((cause) => cause.classification === "contributing").length,
  };

  if (counts.direct !== debrief.directCauses.length) {
    fail(
      `${entry.scenarioId}: direct cause count mismatch trace=${counts.direct} debrief=${debrief.directCauses.length}`,
    );
  }
  if (counts.root !== debrief.rootCauses.length) {
    fail(
      `${entry.scenarioId}: root cause count mismatch trace=${counts.root} debrief=${debrief.rootCauses.length}`,
    );
  }
  if (counts.contributing !== debrief.contributingFactors.length) {
    fail(
      `${entry.scenarioId}: contributing factor count mismatch trace=${counts.contributing} debrief=${debrief.contributingFactors.length}`,
    );
  }
  if (entry.correctiveActions.length !== debrief.correctiveActions.length) {
    fail(
      `${entry.scenarioId}: corrective action count mismatch trace=${entry.correctiveActions.length} debrief=${debrief.correctiveActions.length}`,
    );
  }
  if (debrief.causalChain.length === 0 || debrief.failedBarriers.length === 0) {
    fail(`${entry.scenarioId}: public debrief must retain causal chain and failed barriers`);
  }

  if (entry.recoveryBoundary.separateFromInitiatingCause !== true) {
    fail(`${entry.scenarioId}: recovery HF issues must remain separate from initiating causes`);
  }
  if (!Array.isArray(entry.recoveryBoundary.topics) || entry.recoveryBoundary.topics.length === 0) {
    fail(`${entry.scenarioId}: recovery boundary topics are required`);
  }

  if (entry.publicSanitization.required) {
    if (
      !Array.isArray(entry.publicSanitization.forbiddenTerms) ||
      entry.publicSanitization.forbiddenTerms.length === 0
    ) {
      fail(`${entry.scenarioId}: public sanitization terms are required`);
    }
    for (const term of entry.publicSanitization.forbiddenTerms) {
      if (!term.trim()) fail(`${entry.scenarioId}: empty forbidden term`);
      if (scenarioText.includes(term)) {
        fail(`${entry.scenarioId}: forbidden public operational detail remains in scenario JSON: ${term}`);
      }
    }
  }

  if (entry.scenarioId === "s03_procedure_reality_gap" && scenario.version >= 4) {
    const intro = scenario.nodes.intro;
    const alignment = scenario.nodes.decision_state_alignment;
    const safeNoAction = scenario.nodes.safe_no_action_end;

    if (!intro || intro.type !== "scene") {
      fail(`${entry.scenarioId}: v4 intro scene is required`);
    }
    if (intro.text.includes("절차상 다음 설정을 입력할 차례")) {
      fail(
        `${entry.scenarioId}: v4 must not frame the unplanned setting change as a required procedure step`,
      );
    }
    if (!alignment || alignment.type !== "decision") {
      fail(`${entry.scenarioId}: v4 state-alignment decision is required`);
    }
    if (!alignment.choices.some((choice) => choice.next === "safe_no_action_end")) {
      fail(
        `${entry.scenarioId}: v4 must offer a safe path that rechecks necessity and avoids the unneeded action`,
      );
    }
    if (
      !safeNoAction ||
      safeNoAction.type !== "ending" ||
      safeNoAction.ending !== "safe_stop"
    ) {
      fail(`${entry.scenarioId}: v4 safe_no_action_end must be a safe_stop ending`);
    }

    const absentBarrierLanguage = debrief.failedBarriers.filter((barrier) =>
      barrier.includes("부재") || barrier.includes("미작동")
    );
    if (absentBarrierLanguage.length < 2) {
      fail(
        `${entry.scenarioId}: v4 must distinguish absent/unavailable safeguards from barriers that existed and failed`,
      );
    }
  }

  console.log(
    `CAUSE_TRACEABILITY_STATUS ${entry.scenarioId} v${scenario.version} causes=${entry.causes.length} barriers=${entry.barriers.length} actions=${entry.correctiveActions.length}`,
  );
}

console.log(
  `CAUSE_TRACEABILITY_PASS: ${manifest.entries.length} traceability record(s), required=${requiredScenarioIds.length}.`,
);
