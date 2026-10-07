import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function fail(message) {
  console.error(`RELEASE_EVIDENCE_FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    json: argv.includes("--json"),
    selfTest: argv.includes("--self-test"),
  };
}

function validApproval(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "approval_missing" };
  }

  if (value.status !== "approved") {
    return { ok: false, reason: `status_${String(value.status ?? "missing")}` };
  }

  if (typeof value.approvedBy !== "string" || value.approvedBy.trim().length < 2) {
    return { ok: false, reason: "approved_by_missing" };
  }

  if (
    typeof value.approvedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(
      value.approvedAt,
    )
  ) {
    return { ok: false, reason: "approved_at_invalid" };
  }

  if (
    typeof value.evidenceRef !== "string" ||
    value.evidenceRef.trim().length < 3
  ) {
    return { ok: false, reason: "evidence_ref_missing" };
  }

  return { ok: true, reason: "approved_with_evidence" };
}

function evaluateEvidence(data) {
  const checks = [];

  if (data?.schemaVersion !== 1) {
    checks.push({
      id: "schema_version",
      status: "blocked",
      detail: "schemaVersion must be 1",
    });
  } else {
    checks.push({
      id: "schema_version",
      status: "pass",
      detail: "schemaVersion=1",
    });
  }

  const audioPolicy = data?.audioPolicy;
  if (!["deferred", "excluded", "included"].includes(audioPolicy)) {
    checks.push({
      id: "audio_policy",
      status: "blocked",
      detail: "audioPolicy must be deferred, excluded, or included",
    });
  } else if (audioPolicy === "deferred") {
    checks.push({
      id: "audio_policy",
      status: "deferred",
      detail: "Final release audio scope decision is still pending.",
    });
  } else {
    checks.push({
      id: "audio_policy",
      status: "pass",
      detail:
        audioPolicy === "included"
          ? "Approved audio assets are in release scope."
          : "Audio assets are explicitly excluded from this release scope.",
    });
  }

  const approvals = data?.approvals ?? {};

  for (const [key, label] of [
    ["legalPrivacy", "Legal/privacy approval"],
    ["externalDeployment", "External deployment approval"],
    ["intranetPolicy", "Intranet/personal-device policy approval"],
  ]) {
    const result = validApproval(approvals[key]);
    checks.push({
      id: key,
      status: result.ok ? "pass" : "blocked",
      detail: result.ok ? label : `${label}: ${result.reason}`,
    });
  }

  const realDeviceApproval = validApproval(approvals.realDevice);
  const realDeviceChecks = approvals.realDevice?.checks ?? {};
  const requiredDevices = [
    "kakaoInApp",
    "androidChrome",
    "samsungInternet",
    "iosSafari",
  ];
  const missingDevices = requiredDevices.filter(
    (device) => realDeviceChecks[device] !== true,
  );

  checks.push({
    id: "realDevice",
    status:
      realDeviceApproval.ok && missingDevices.length === 0
        ? "pass"
        : "blocked",
    detail:
      realDeviceApproval.ok && missingDevices.length === 0
        ? "All required mobile browser/device checks are approved."
        : `Real-device evidence incomplete: ${[
            realDeviceApproval.ok ? null : realDeviceApproval.reason,
            missingDevices.length > 0
              ? `missing=${missingDevices.join(",")}`
              : null,
          ]
            .filter(Boolean)
            .join(" ")}`,
  });

  const pilotApproval = validApproval(approvals.pilot);
  const participants = Number(approvals.pilot?.participants ?? 0);
  const blockerCount = approvals.pilot?.blockerCount;

  checks.push({
    id: "pilot",
    status:
      pilotApproval.ok &&
      Number.isInteger(participants) &&
      participants >= 30 &&
      blockerCount === 0
        ? "pass"
        : "blocked",
    detail:
      pilotApproval.ok &&
      Number.isInteger(participants) &&
      participants >= 30 &&
      blockerCount === 0
        ? `Pilot approved with ${participants} participants and 0 blockers.`
        : `Pilot evidence incomplete: approval=${pilotApproval.reason} participants=${participants} blockerCount=${String(blockerCount)}`,
  });

  const audioQc = validApproval(approvals.audioQc);
  checks.push({
    id: "audioQc",
    status:
      audioPolicy === "included"
        ? audioQc.ok
          ? "pass"
          : "blocked"
        : "not_applicable",
    detail:
      audioPolicy === "included"
        ? audioQc.ok
          ? "Audio HF/rights/technical QC approval recorded."
          : `Audio QC required because audioPolicy=included: ${audioQc.reason}`
        : "Audio QC approval is not required unless audio assets are included.",
  });

  const blocking = checks.filter((check) => check.status === "blocked");
  const deferred = checks.filter((check) => check.status === "deferred");

  return {
    verdict:
      blocking.length === 0 && deferred.length === 0
        ? "evidence_complete"
        : "evidence_incomplete",
    release: data?.release ?? null,
    updatedAt: data?.updatedAt ?? null,
    audioPolicy,
    checks,
  };
}

function assertSelfTest() {
  const good = {
    schemaVersion: 1,
    release: "1.0.0",
    updatedAt: "2026-10-07",
    audioPolicy: "excluded",
    approvals: {
      legalPrivacy: {
        status: "approved",
        approvedBy: "Privacy Office",
        approvedAt: "2026-10-07",
        evidenceRef: "internal:privacy-001",
      },
      externalDeployment: {
        status: "approved",
        approvedBy: "Platform Owner",
        approvedAt: "2026-10-07",
        evidenceRef: "internal:deploy-001",
      },
      realDevice: {
        status: "approved",
        approvedBy: "QA Lead",
        approvedAt: "2026-10-07",
        evidenceRef: "internal:device-001",
        checks: {
          kakaoInApp: true,
          androidChrome: true,
          samsungInternet: true,
          iosSafari: true,
        },
      },
      intranetPolicy: {
        status: "approved",
        approvedBy: "Security Office",
        approvedAt: "2026-10-07",
        evidenceRef: "internal:network-001",
      },
      pilot: {
        status: "approved",
        approvedBy: "Pilot Owner",
        approvedAt: "2026-10-07",
        evidenceRef: "internal:pilot-001",
        participants: 30,
        blockerCount: 0,
      },
      audioQc: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
      },
    },
  };

  const goodReport = evaluateEvidence(good);
  if (goodReport.verdict !== "evidence_complete") {
    fail("self-test good fixture should be evidence_complete");
  }

  const bad = structuredClone(good);
  bad.audioPolicy = "included";
  bad.approvals.realDevice.checks.iosSafari = false;
  bad.approvals.pilot.blockerCount = 1;

  const badReport = evaluateEvidence(bad);
  const blocked = new Set(
    badReport.checks
      .filter((check) => check.status === "blocked")
      .map((check) => check.id),
  );

  for (const id of ["realDevice", "pilot", "audioQc"]) {
    if (!blocked.has(id)) {
      fail(`self-test expected blocked check: ${id}`);
    }
  }

  console.log("RELEASE_EVIDENCE_SELF_TEST_PASS");
}

const options = parseArgs(process.argv.slice(2));

if (options.selfTest) {
  assertSelfTest();
  process.exit(0);
}

const evidencePath = resolve(root, "ops/release-evidence.json");
if (!existsSync(evidencePath)) {
  fail("ops/release-evidence.json is missing");
}

let evidence;
try {
  evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
} catch (cause) {
  fail(
    `release evidence JSON parse failed: ${cause instanceof Error ? cause.message : "unknown_error"}`,
  );
}

const report = evaluateEvidence(evidence);
const blocked = report.checks.filter((check) => check.status === "blocked");
const deferred = report.checks.filter((check) => check.status === "deferred");

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("HERO release evidence");
  console.log("=====================");
  console.log(`verdict: ${report.verdict}`);
  console.log(`release: ${report.release ?? "-"}`);
  console.log(`audioPolicy: ${report.audioPolicy ?? "-"}`);
  console.log("");

  for (const check of report.checks) {
    console.log(
      `[${check.status.toUpperCase()}] ${check.id} — ${check.detail}`,
    );
  }
}

if (options.strict && (blocked.length > 0 || deferred.length > 0)) {
  process.exitCode = 2;
}
