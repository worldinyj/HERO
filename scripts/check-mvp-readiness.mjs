import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const strict = process.argv.includes("--strict");
const jsonOutput = process.argv.includes("--json");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function checkFile(path) {
  return existsSync(resolve(root, path));
}

const structuralRequirements = [
  "docs/01_PRD.md",
  "docs/02_TRD.md",
  "docs/03_UXUI.md",
  "docs/04_TASKLIST.md",
  "docs/05_TRACEABILITY.md",
  "docs/06_AUDIO_ASSET_GUIDE.md",
  "docs/07_TERMS_PRIVACY_DRAFT.md",
  "docs/08_HP_BALANCE_REPORT.md",
  "docs/09_DEPLOYMENT_BOOTSTRAP.md",
  "scenarios/data/S00_tutorial.json",
  "scenarios/research/promotion-status.json",
  ".github/workflows/ci.yml",
  ".github/workflows/database-tests.yml",
  ".github/workflows/e2e.yml",
  "apps/web/public/audio/audio_manifest.json",
];

const missingFiles = structuralRequirements.filter((path) => !checkFile(path));

if (missingFiles.length > 0) {
  console.error("MVP readiness structural check FAILED");
  for (const path of missingFiles) {
    console.error(`- missing: ${path}`);
  }
  process.exit(1);
}

const promotion = JSON.parse(
  read("scenarios/research/promotion-status.json"),
);
const legal = read("docs/07_TERMS_PRIVACY_DRAFT.md");
const deployment = read("docs/09_DEPLOYMENT_BOOTSTRAP.md");
const audio = JSON.parse(
  read("apps/web/public/audio/audio_manifest.json"),
);

const competitive = promotion.entries.filter(
  (entry) => entry.scenarioId !== "s00_tutorial",
);
const approvedCompetitive = competitive.filter(
  (entry) =>
    entry.status === "approved" &&
    entry.sourceRightsComplete === true &&
    entry.hfReviewComplete === true &&
    entry.anonymizationReviewComplete === true &&
    entry.humanReview?.status === "approved" &&
    Boolean(entry.humanReview?.approvedBy) &&
    Boolean(entry.humanReview?.approvedAt),
);

const scenarioStatus = competitive.map((entry) => ({
  scenarioId: entry.scenarioId,
  status: entry.status,
  blockers: entry.blockers ?? [],
}));

const legalPending =
  legal.includes("[확정 필요]") ||
  legal.includes("검토 초안");

const uncheckedDeploymentItems = (
  deployment.match(/^- \[ \]/gmu) ?? []
).length;

const audioAssets = Array.isArray(audio.assets) ? audio.assets.length : 0;
const audioApproved = audioAssets > 0;

const gates = [
  {
    id: "repository_structure",
    status: "pass",
    owner: "automation",
    detail: "Core design, CI, E2E, scenario, deployment, and audio-manifest files exist.",
  },
  {
    id: "competitive_scenarios",
    status: approvedCompetitive.length >= 3 ? "pass" : "blocked",
    owner: "human+content",
    detail:
      approvedCompetitive.length >= 3
        ? `${approvedCompetitive.length} competitive scenarios approved for shipping.`
        : `${approvedCompetitive.length}/3 competitive scenarios approved. Promotion manifest remains authoritative.`,
  },
  {
    id: "legal_privacy",
    status: legalPending ? "blocked" : "pass",
    owner: "legal+privacy",
    detail: legalPending
      ? "Terms/privacy document still contains review-draft or [확정 필요] markers."
      : "Terms/privacy finalization markers are cleared.",
  },
  {
    id: "external_deployment",
    status: uncheckedDeploymentItems > 0 ? "blocked" : "pass",
    owner: "operator",
    detail:
      uncheckedDeploymentItems > 0
        ? `${uncheckedDeploymentItems} deployment/bootstrap checklist items remain unchecked.`
        : "Deployment/bootstrap checklist has no unchecked items.",
  },
  {
    id: "audio_assets",
    status: audioApproved ? "pass" : "deferred",
    owner: "audio+HF+rights",
    detail: audioApproved
      ? `${audioAssets} approved audio assets are registered.`
      : "Audio manifest contains no approved assets. Audio generation/QC is intentionally handled separately.",
  },
  {
    id: "real_device_pilot",
    status: "blocked",
    owner: "human+operator",
    detail:
      "Kakao in-app browser, Android/Samsung Internet/iOS Safari real-device checks, intranet policy, and pilot operation require external execution.",
  },
];

const blocking = gates.filter((gate) => gate.status === "blocked");
const deferred = gates.filter((gate) => gate.status === "deferred");

const report = {
  generatedAt: new Date().toISOString(),
  verdict: blocking.length === 0 ? "release_candidate" : "not_release_ready",
  structuralCheck: "pass",
  approvedCompetitiveScenarios: approvedCompetitive.length,
  competitiveScenarioStatus: scenarioStatus,
  audioAssets,
  uncheckedDeploymentItems,
  gates,
};

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("HERO MVP release readiness");
  console.log("==========================");
  console.log(`verdict: ${report.verdict}`);
  console.log("");

  for (const gate of gates) {
    console.log(
      `[${gate.status.toUpperCase()}] ${gate.id} — ${gate.detail}`,
    );
  }

  console.log("");
  console.log(
    `blocking=${blocking.length} deferred=${deferred.length} approved_scenarios=${approvedCompetitive.length}/3 audio_assets=${audioAssets}`,
  );
}

if (strict && (blocking.length > 0 || deferred.length > 0)) {
  process.exitCode = 2;
}
