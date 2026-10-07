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

function validApproval(value) {
  return Boolean(
    value &&
      value.status === "approved" &&
      typeof value.approvedBy === "string" &&
      value.approvedBy.trim().length >= 2 &&
      typeof value.approvedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}/u.test(value.approvedAt) &&
      typeof value.evidenceRef === "string" &&
      value.evidenceRef.trim().length >= 3,
  );
}

const structuralRequirements = [
  "docs/01_PRD.md",
  "docs/02_TRD.md",
  "docs/03_UXUI.md",
  "docs/04_TASKLIST.md",
  "docs/05_TRACEABILITY.md",
  "docs/06_AUDIO_ASSET_GUIDE.md",
  "docs/07_TERMS_PRIVACY_DRAFT.md",
  "apps/web/src/features/legal/LegalPage.tsx",
  "scripts/check-legal-release.mjs",
  "docs/08_HP_BALANCE_REPORT.md",
  "docs/09_DEPLOYMENT_BOOTSTRAP.md",
  "docs/10_MVP_READINESS.md",
  "docs/11_RELEASE_EVIDENCE.md",
  "ops/release-evidence.json",
  "scenarios/data/S00_tutorial.json",
  "scenarios/research/promotion-status.json",
  ".github/workflows/ci.yml",
  ".github/workflows/database-tests.yml",
  ".github/workflows/e2e.yml",
  ".github/workflows/staging-smoke.yml",
  ".github/workflows/release-candidate.yml",
  "apps/web/public/audio/audio_manifest.json",
  "apps/web/src/features/audio/audioManager.ts",
  "apps/web/src/features/audio/AudioContext.tsx",
  "apps/web/src/features/audio/AudioSettings.tsx",
  "scripts/check-audio-manifest.mjs",
  "scripts/check-staging-http.mjs",
  "scripts/check-release-evidence.mjs",
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
const legalApp = read("apps/web/src/features/legal/LegalPage.tsx");
const deployment = read("docs/09_DEPLOYMENT_BOOTSTRAP.md");
const audio = JSON.parse(
  read("apps/web/public/audio/audio_manifest.json"),
);
const releaseEvidence = JSON.parse(
  read("ops/release-evidence.json"),
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

const legalDocumentPending =
  legal.includes("[확정 필요]") ||
  legal.includes("검토 초안");
const legalAppPending =
  legalApp.includes("[확정 필요]") ||
  legalApp.includes("검토 초안") ||
  legalApp.includes("개발·검토용 초안");
const legalPending = legalDocumentPending || legalAppPending;

const uncheckedDeploymentItems = (
  deployment.match(/^- \[ \]/gmu) ?? []
).length;

const audioAssets = Array.isArray(audio.assets) ? audio.assets.length : 0;
const audioApprovedAssets = Array.isArray(audio.assets)
  ? audio.assets.filter((asset) => asset?.approved === true).length
  : 0;
const audioRuntimeReady = [
  "apps/web/src/features/audio/audioManager.ts",
  "apps/web/src/features/audio/AudioContext.tsx",
  "apps/web/src/features/audio/AudioSettings.tsx",
  "scripts/check-audio-manifest.mjs",
].every(checkFile);

const approvals = releaseEvidence.approvals ?? {};
const audioPolicy = releaseEvidence.audioPolicy;
const requiredDeviceChecks = [
  "kakaoInApp",
  "androidChrome",
  "samsungInternet",
  "iosSafari",
];
const realDeviceChecks = approvals.realDevice?.checks ?? {};
const realDevicesComplete = requiredDeviceChecks.every(
  (key) => realDeviceChecks[key] === true,
);
const pilotParticipants = Number(approvals.pilot?.participants ?? 0);
const pilotBlockerCount = approvals.pilot?.blockerCount;
const stagingSmokeVerified =
  process.env.HERO_STAGING_SMOKE_VERIFIED === "1";

let audioAssetStatus = "deferred";
let audioAssetDetail =
  `Audio manifest has ${audioAssets} entries but release audio scope is still deferred.`;

if (audioPolicy === "excluded") {
  audioAssetStatus = "pass";
  audioAssetDetail =
    "Audio assets are explicitly excluded from this release scope; runtime remains ready.";
} else if (audioPolicy === "included") {
  const audioQcApproved = validApproval(approvals.audioQc);
  if (audioApprovedAssets > 0 && audioQcApproved) {
    audioAssetStatus = "pass";
    audioAssetDetail =
      `${audioApprovedAssets} approved audio assets are included with recorded HF/rights/technical QC approval.`;
  } else {
    audioAssetStatus = "blocked";
    audioAssetDetail =
      `audioPolicy=included requires approved assets and audioQc approval (approved assets=${audioApprovedAssets}).`;
  }
} else if (audioPolicy !== "deferred") {
  audioAssetStatus = "blocked";
  audioAssetDetail =
    "audioPolicy must be one of deferred, excluded, or included.";
}

const gates = [
  {
    id: "repository_structure",
    status: "pass",
    owner: "automation",
    detail:
      "Core design, CI, E2E, scenario, deployment, release-evidence, and audio files exist.",
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
    status:
      !legalPending && validApproval(approvals.legalPrivacy)
        ? "pass"
        : "blocked",
    owner: "legal+privacy",
    detail:
      !legalPending && validApproval(approvals.legalPrivacy)
        ? "Final terms/privacy review document, shipped UI, and approval evidence are all complete."
        : `Final legal document + shipped /terms,/privacy UI + approval evidence are required (documentPending=${legalDocumentPending}, appPending=${legalAppPending}).`,
  },
  {
    id: "staging_smoke_automation",
    status:
      checkFile("scripts/check-staging-http.mjs") &&
      checkFile(".github/workflows/staging-smoke.yml")
        ? "pass"
        : "blocked",
    owner: "automation",
    detail:
      checkFile("scripts/check-staging-http.mjs") &&
      checkFile(".github/workflows/staging-smoke.yml")
        ? "Manual staging smoke workflow is ready for real external credentials."
        : "Staging smoke workflow or validator is missing.",
  },
  {
    id: "external_deployment",
    status:
      uncheckedDeploymentItems === 0 &&
      validApproval(approvals.externalDeployment)
        ? "pass"
        : "blocked",
    owner: "operator",
    detail:
      uncheckedDeploymentItems === 0 &&
      validApproval(approvals.externalDeployment)
        ? "Deployment checklist and external deployment approval evidence are complete."
        : `${uncheckedDeploymentItems} deployment checklist items remain unchecked; approved deployment evidence is also required.`,
  },
  {
    id: "staging_smoke_live",
    status: stagingSmokeVerified ? "pass" : "blocked",
    owner: "operator+automation",
    detail: stagingSmokeVerified
      ? `Successful same-commit Staging Smoke verified (run ${process.env.HERO_STAGING_SMOKE_RUN_ID ?? "unknown"}).`
      : "Run Release Candidate Gate with a successful same-commit Staging Smoke run ID.",
  },
  {
    id: "audio_runtime",
    status: audioRuntimeReady ? "pass" : "blocked",
    owner: "automation",
    detail: audioRuntimeReady
      ? "AudioManager, settings, first-play choice, lazy-loading contract, and manifest validator are present."
      : "Audio runtime or validator files are missing.",
  },
  {
    id: "audio_assets",
    status: audioAssetStatus,
    owner: "audio+HF+rights",
    detail: audioAssetDetail,
  },
  {
    id: "real_device",
    status:
      validApproval(approvals.realDevice) && realDevicesComplete
        ? "pass"
        : "blocked",
    owner: "human+operator",
    detail:
      validApproval(approvals.realDevice) && realDevicesComplete
        ? "Kakao in-app, Android Chrome, Samsung Internet, and iOS Safari evidence is approved."
        : "All four required real-device/browser checks and approval evidence are required.",
  },
  {
    id: "intranet_policy",
    status: validApproval(approvals.intranetPolicy) ? "pass" : "blocked",
    owner: "human+operator",
    detail: validApproval(approvals.intranetPolicy)
      ? "Intranet/personal-device access policy evidence is approved."
      : "Intranet/personal-device policy approval evidence is required.",
  },
  {
    id: "pilot",
    status:
      validApproval(approvals.pilot) &&
      Number.isInteger(pilotParticipants) &&
      pilotParticipants >= 30 &&
      pilotBlockerCount === 0
        ? "pass"
        : "blocked",
    owner: "human+operator",
    detail:
      validApproval(approvals.pilot) &&
      Number.isInteger(pilotParticipants) &&
      pilotParticipants >= 30 &&
      pilotBlockerCount === 0
        ? `Pilot approved with ${pilotParticipants} participants and 0 blockers.`
        : `Pilot requires approval evidence, >=30 participants, and blockerCount=0 (participants=${pilotParticipants}, blockerCount=${String(pilotBlockerCount)}).`,
  },
];

const blocking = gates.filter((gate) => gate.status === "blocked");
const deferred = gates.filter((gate) => gate.status === "deferred");

const report = {
  generatedAt: new Date().toISOString(),
  verdict:
    blocking.length === 0 && deferred.length === 0
      ? "release_candidate"
      : "not_release_ready",
  structuralCheck: "pass",
  approvedCompetitiveScenarios: approvedCompetitive.length,
  competitiveScenarioStatus: scenarioStatus,
  audioPolicy,
  audioAssets,
  approvedAudioAssets: audioApprovedAssets,
  audioRuntimeReady,
  uncheckedDeploymentItems,
  releaseEvidenceUpdatedAt: releaseEvidence.updatedAt ?? null,
  legalDocumentPending,
  legalAppPending,
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
    `blocking=${blocking.length} deferred=${deferred.length} approved_scenarios=${approvedCompetitive.length}/3 audio_policy=${audioPolicy} audio_assets=${audioApprovedAssets}/${audioAssets}`,
  );
}

if (strict && (blocking.length > 0 || deferred.length > 0)) {
  process.exitCode = 2;
}
