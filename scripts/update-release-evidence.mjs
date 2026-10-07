import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const evidencePath = resolve(root, "ops/release-evidence.json");

const APPROVAL_IDS = new Set([
  "legalPrivacy",
  "externalDeployment",
  "realDevice",
  "intranetPolicy",
  "pilot",
  "audioQc",
]);

const AUDIO_POLICIES = new Set(["deferred", "excluded", "included"]);

function fail(message) {
  console.error(`RELEASE_EVIDENCE_UPDATE_FAIL: ${message}`);
  process.exit(1);
}

function option(argv, name) {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < argv.length) {
    return argv[index + 1];
  }

  return null;
}

function flag(argv, name) {
  return argv.includes(`--${name}`);
}

function validApprovedAt(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?$/u.test(
      value,
    )
  );
}

function requireText(value, label, min = 2) {
  if (typeof value !== "string" || value.trim().length < min) {
    fail(`${label} is required`);
  }

  return value.trim();
}

function parseNonNegativeInteger(value, label) {
  if (value === null || !/^\d+$/u.test(value)) {
    fail(`${label} must be a non-negative integer`);
  }

  return Number(value);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function clone(value) {
  return structuredClone(value);
}

export function applyApproval(data, input) {
  const next = clone(data);
  const approvalId = input.approval;

  if (!APPROVAL_IDS.has(approvalId)) {
    throw new Error(`unknown_approval:${approvalId}`);
  }

  if (!next.approvals?.[approvalId]) {
    throw new Error(`approval_shape_missing:${approvalId}`);
  }

  if (!validApprovedAt(input.approvedAt)) {
    throw new Error("approved_at_invalid");
  }

  const approvedBy = String(input.approvedBy ?? "").trim();
  const evidenceRef = String(input.evidenceRef ?? "").trim();

  if (approvedBy.length < 2) throw new Error("approved_by_missing");
  if (evidenceRef.length < 3) throw new Error("evidence_ref_missing");

  const common = {
    ...next.approvals[approvalId],
    status: "approved",
    approvedBy,
    approvedAt: input.approvedAt,
    evidenceRef,
  };

  if (approvalId === "realDevice") {
    const checks = input.deviceChecks ?? {};
    const required = [
      "kakaoInApp",
      "androidChrome",
      "samsungInternet",
      "iosSafari",
    ];

    const missing = required.filter((key) => checks[key] !== true);
    if (missing.length > 0) {
      throw new Error(`real_device_checks_missing:${missing.join(",")}`);
    }

    next.approvals.realDevice = {
      ...common,
      checks: {
        kakaoInApp: true,
        androidChrome: true,
        samsungInternet: true,
        iosSafari: true,
      },
    };
  } else if (approvalId === "pilot") {
    const participants = Number(input.participants);
    const blockerCount = Number(input.blockerCount);

    if (!Number.isInteger(participants) || participants < 30) {
      throw new Error("pilot_participants_must_be_at_least_30");
    }

    if (!Number.isInteger(blockerCount) || blockerCount !== 0) {
      throw new Error("pilot_blocker_count_must_be_zero");
    }

    next.approvals.pilot = {
      ...common,
      participants,
      blockerCount,
    };
  } else {
    next.approvals[approvalId] = common;
  }

  next.updatedAt = input.approvedAt.slice(0, 10);
  return next;
}

export function applyAudioPolicy(data, policy, changedAt) {
  if (!AUDIO_POLICIES.has(policy)) {
    throw new Error(`invalid_audio_policy:${policy}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(changedAt)) {
    throw new Error("changed_at_invalid");
  }

  const next = clone(data);
  next.audioPolicy = policy;
  next.updatedAt = changedAt;
  return next;
}

function runSelfTest() {
  const fixture = {
    schemaVersion: 1,
    release: "1.0.0",
    updatedAt: "2026-10-07",
    audioPolicy: "deferred",
    approvals: {
      legalPrivacy: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
      },
      externalDeployment: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
      },
      realDevice: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
        checks: {
          kakaoInApp: false,
          androidChrome: false,
          samsungInternet: false,
          iosSafari: false,
        },
      },
      intranetPolicy: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
      },
      pilot: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
        participants: 0,
        blockerCount: null,
      },
      audioQc: {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        evidenceRef: null,
      },
    },
  };

  const legal = applyApproval(fixture, {
    approval: "legalPrivacy",
    approvedBy: "Privacy Office",
    approvedAt: "2026-10-07",
    evidenceRef: "internal:privacy-001",
  });

  if (
    legal.approvals.legalPrivacy.status !== "approved" ||
    fixture.approvals.legalPrivacy.status !== "pending"
  ) {
    throw new Error("self_test_legal_approval_failed");
  }

  const pilot = applyApproval(fixture, {
    approval: "pilot",
    approvedBy: "Pilot Owner",
    approvedAt: "2026-10-07",
    evidenceRef: "internal:pilot-001",
    participants: 30,
    blockerCount: 0,
  });

  if (
    pilot.approvals.pilot.participants !== 30 ||
    pilot.approvals.pilot.blockerCount !== 0
  ) {
    throw new Error("self_test_pilot_failed");
  }

  let rejected = false;
  try {
    applyApproval(fixture, {
      approval: "realDevice",
      approvedBy: "QA Lead",
      approvedAt: "2026-10-07",
      evidenceRef: "internal:device-001",
      deviceChecks: {
        kakaoInApp: true,
        androidChrome: true,
        samsungInternet: true,
        iosSafari: false,
      },
    });
  } catch {
    rejected = true;
  }

  if (!rejected) {
    throw new Error("self_test_incomplete_device_should_fail");
  }

  const excluded = applyAudioPolicy(fixture, "excluded", "2026-10-07");
  if (excluded.audioPolicy !== "excluded") {
    throw new Error("self_test_audio_policy_failed");
  }

  console.log("RELEASE_EVIDENCE_UPDATE_SELF_TEST_PASS");
}

const argv = process.argv.slice(2);

if (flag(argv, "self-test")) {
  try {
    runSelfTest();
  } catch (cause) {
    fail(cause instanceof Error ? cause.message : "self_test_failed");
  }
  process.exit(0);
}

if (!existsSync(evidencePath)) {
  fail("ops/release-evidence.json is missing");
}

const originalText = readFileSync(evidencePath, "utf8");
let data;

try {
  data = JSON.parse(originalText);
} catch (cause) {
  fail(
    `release evidence JSON parse failed: ${cause instanceof Error ? cause.message : "unknown_error"}`,
  );
}

const approval = option(argv, "approval");
const audioPolicy = option(argv, "audio-policy");

if (Boolean(approval) === Boolean(audioPolicy)) {
  fail("choose exactly one operation: --approval=... or --audio-policy=...");
}

let next;

try {
  if (approval) {
    const approvedBy = requireText(option(argv, "approved-by"), "--approved-by");
    const approvedAt = option(argv, "approved-at");
    const evidenceRef = requireText(
      option(argv, "evidence-ref"),
      "--evidence-ref",
      3,
    );

    if (!validApprovedAt(approvedAt)) {
      fail("--approved-at must be YYYY-MM-DD or an offset/Z timestamp");
    }

    const input = {
      approval,
      approvedBy,
      approvedAt,
      evidenceRef,
    };

    if (approval === "realDevice") {
      input.deviceChecks = {
        kakaoInApp: flag(argv, "kakao-in-app"),
        androidChrome: flag(argv, "android-chrome"),
        samsungInternet: flag(argv, "samsung-internet"),
        iosSafari: flag(argv, "ios-safari"),
      };
    }

    if (approval === "pilot") {
      input.participants = parseNonNegativeInteger(
        option(argv, "participants"),
        "--participants",
      );
      input.blockerCount = parseNonNegativeInteger(
        option(argv, "blocker-count"),
        "--blocker-count",
      );
    }

    next = applyApproval(data, input);
  } else {
    const changedAt = option(argv, "changed-at") ?? todayUtc();
    next = applyAudioPolicy(data, audioPolicy, changedAt);
  }
} catch (cause) {
  fail(cause instanceof Error ? cause.message : "update_failed");
}

const output = JSON.stringify(next, null, 2) + "\n";
const apply = flag(argv, "apply");

if (apply) {
  writeFileSync(evidencePath, output);
  console.log(`RELEASE_EVIDENCE_UPDATED: ${evidencePath}`);
} else {
  console.log("RELEASE_EVIDENCE_DRY_RUN: no file changed; add --apply after verifying the human approval evidence.");
  console.log(output);
}
