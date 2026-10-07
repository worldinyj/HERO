import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function read(path) {
  const full = resolve(root, path);
  if (!existsSync(full)) {
    throw new Error(`missing_required_file:${path}`);
  }
  return readFileSync(full, "utf8");
}

function readJson(path) {
  return JSON.parse(read(path));
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

function legalState(docText, appText, approval) {
  const markers = ["[확정 필요]", "검토 초안", "개발·검토용 초안"];
  return {
    documentDraft: markers.some((marker) => docText.includes(marker)),
    appDraft: markers.some((marker) => appText.includes(marker)),
    approvalComplete: validApproval(approval),
  };
}

function buildReport({
  promotion,
  releaseEvidence,
  deploymentText,
  legalDoc,
  legalApp,
  audioManifest,
}) {
  const approvals = releaseEvidence.approvals ?? {};
  const scenarioRows = promotion.entries
    .filter((entry) => entry.scenarioId !== "s00_tutorial")
    .map((entry) => ({
      scenarioId: entry.scenarioId,
      status: entry.status,
      blockers: entry.blockers ?? [],
      sourceRightsComplete: entry.sourceRightsComplete === true,
      hfReviewComplete: entry.hfReviewComplete === true,
      anonymizationReviewComplete:
        entry.anonymizationReviewComplete === true,
      humanReview: entry.humanReview?.status ?? "pending",
    }));

  const approvedScenarioCount = scenarioRows.filter(
    (entry) => entry.status === "approved",
  ).length;

  const legal = legalState(
    legalDoc,
    legalApp,
    approvals.legalPrivacy,
  );

  const uncheckedDeploymentItems = (
    deploymentText.match(/^- \[ \]/gmu) ?? []
  ).length;

  const realDeviceChecks = approvals.realDevice?.checks ?? {};
  const realDeviceComplete =
    validApproval(approvals.realDevice) &&
    ["kakaoInApp", "androidChrome", "samsungInternet", "iosSafari"].every(
      (key) => realDeviceChecks[key] === true,
    );

  const pilotParticipants = Number(approvals.pilot?.participants ?? 0);
  const pilotComplete =
    validApproval(approvals.pilot) &&
    Number.isInteger(pilotParticipants) &&
    pilotParticipants >= 30 &&
    approvals.pilot?.blockerCount === 0;

  const approvedAudioAssets = Array.isArray(audioManifest.assets)
    ? audioManifest.assets.filter((asset) => asset?.approved === true).length
    : 0;

  const actions = [];
  let priority = 1;

  for (const scenario of scenarioRows) {
    if (scenario.status === "review_ready") {
      actions.push({
        priority: priority++,
        id: `human-review:${scenario.scenarioId}`,
        owner: "HF+anonymization reviewer",
        title: `${scenario.scenarioId} 사람 검토 및 승인`,
        why:
          "Source/rights gate is ready; human HF, anonymization, and debrief approval remains.",
        command:
          `pnpm build:review-packet -- --scenario=${scenario.scenarioId} --check`,
        next:
          `After real approval: pnpm promote:scenario -- --scenario=${scenario.scenarioId} --approved-by="<reviewer>" --approved-at=YYYY-MM-DD --confirm-hf --confirm-anonymization --confirm-debrief --apply`,
      });
    }
  }

  for (const scenario of scenarioRows) {
    if (scenario.status === "source_hold") {
      actions.push({
        priority: priority++,
        id: `source-hold:${scenario.scenarioId}`,
        owner: "content/source reviewer",
        title: `${scenario.scenarioId} 공식 출처·권리 blocker 해소`,
        why:
          scenario.blockers.length > 0
            ? scenario.blockers.join(" / ")
            : "Source/rights evidence remains incomplete.",
        command: "pnpm check:source-evidence",
        next:
          "Update source-evidence.json only after event-specific official records and rights evidence are actually obtained.",
      });
    }
  }

  if (legal.documentDraft || legal.appDraft || !legal.approvalComplete) {
    actions.push({
      priority: priority++,
      id: "legal-privacy",
      owner: "legal+privacy",
      title: "이용약관·개인정보 최종 문안 및 승인",
      why:
        `documentDraft=${legal.documentDraft}, appDraft=${legal.appDraft}, approval=${legal.approvalComplete}`,
      command: "pnpm check:legal-release",
      next:
        "Finalize both docs/07 and shipped /terms,/privacy UI, then record the real approval with pnpm update:release-evidence.",
    });
  }

  if (
    uncheckedDeploymentItems > 0 ||
    !validApproval(approvals.externalDeployment)
  ) {
    actions.push({
      priority: priority++,
      id: "external-deployment",
      owner: "platform operator",
      title: "Supabase·Cloudflare·Kakao staging 연결",
      why:
        `${uncheckedDeploymentItems} deployment checklist item(s) remain; external deployment approval=${validApproval(approvals.externalDeployment)}`,
      command: "pnpm check:deployment-preflight",
      next:
        "Complete docs/09 deployment checklist, deploy staging, then record externalDeployment approval evidence.",
    });
  }

  if (!realDeviceComplete) {
    actions.push({
      priority: priority++,
      id: "real-device",
      owner: "QA+operator",
      title: "실기기 4종 검증",
      why:
        "Kakao in-app, Android Chrome, Samsung Internet, and iOS Safari must all be verified with approval evidence.",
      command:
        "pnpm update:release-evidence -- --approval=realDevice --approved-by="<QA reviewer>" --approved-at=YYYY-MM-DD --evidence-ref="<traceable ref>" --kakao-in-app --android-chrome --samsung-internet --ios-safari",
      next: "Run as dry-run first; add --apply only after all four checks are actually complete.",
    });
  }

  if (!validApproval(approvals.intranetPolicy)) {
    actions.push({
      priority: priority++,
      id: "intranet-policy",
      owner: "security+operator",
      title: "사내망·개인폰 접속정책 승인",
      why: "Release evidence does not yet contain approved intranetPolicy.",
      command:
        "pnpm update:release-evidence -- --approval=intranetPolicy --approved-by="<reviewer>" --approved-at=YYYY-MM-DD --evidence-ref="<traceable ref>"",
      next: "Record only after the real policy decision is complete.",
    });
  }

  if (releaseEvidence.audioPolicy === "deferred") {
    actions.push({
      priority: priority++,
      id: "audio-policy",
      owner: "release owner",
      title: "Release 1 오디오 포함/제외 결정",
      why:
        `audioPolicy=deferred; approved audio assets=${approvedAudioAssets}`,
      command:
        "pnpm update:release-evidence -- --audio-policy=excluded",
      next:
        "Choose excluded for a silent-asset MVP, or included only after approved assets and audioQc evidence exist. Dry-run first.",
    });
  } else if (
    releaseEvidence.audioPolicy === "included" &&
    (!validApproval(approvals.audioQc) || approvedAudioAssets === 0)
  ) {
    actions.push({
      priority: priority++,
      id: "audio-qc",
      owner: "audio+HF+rights",
      title: "오디오 HF·권리·기술 QC 승인",
      why:
        `audioPolicy=included, approvedAssets=${approvedAudioAssets}, audioQc=${validApproval(approvals.audioQc)}`,
      command: "pnpm check:audio-manifest",
      next:
        "Approve assets in the manifest and record audioQc evidence only after human HF/rights/technical review.",
    });
  }

  if (!pilotComplete) {
    actions.push({
      priority: priority++,
      id: "pilot",
      owner: "pilot owner",
      title: "파일럿 30명 이상·Blocker 0 확인",
      why:
        `participants=${pilotParticipants}, blockerCount=${String(approvals.pilot?.blockerCount)}, approval=${validApproval(approvals.pilot)}`,
      command:
        "pnpm update:release-evidence -- --approval=pilot --approved-by="<pilot owner>" --approved-at=YYYY-MM-DD --evidence-ref="<traceable ref>" --participants=30 --blocker-count=0",
      next: "Record only after actual pilot completion; dry-run before --apply.",
    });
  }

  actions.push({
    priority: priority++,
    id: "staging-smoke-rc",
    owner: "release operator",
    title: "동일 SHA Staging Smoke → Release Candidate Gate",
    why:
      "This is the final mechanical gate after scenario, legal, deployment, device, policy, pilot, and audio-scope evidence are complete.",
    command: "GitHub Actions → Staging Smoke (workflow_dispatch)",
    next:
      "Run Release Candidate Gate on the same main SHA using the successful Staging Smoke run ID.",
  });

  return {
    release: releaseEvidence.release,
    updatedAt: releaseEvidence.updatedAt,
    approvedCompetitiveScenarios: approvedScenarioCount,
    totalCompetitiveScenarios: scenarioRows.length,
    scenarios: scenarioRows,
    legal,
    deployment: {
      uncheckedItems: uncheckedDeploymentItems,
      approvalComplete: validApproval(approvals.externalDeployment),
    },
    realDeviceComplete,
    intranetPolicyComplete: validApproval(approvals.intranetPolicy),
    pilot: {
      complete: pilotComplete,
      participants: pilotParticipants,
      blockerCount: approvals.pilot?.blockerCount ?? null,
    },
    audio: {
      policy: releaseEvidence.audioPolicy,
      approvedAssets: approvedAudioAssets,
      qcComplete: validApproval(approvals.audioQc),
    },
    nextActions: actions,
  };
}

function printText(report) {
  console.log("HERO release handoff");
  console.log("====================");
  console.log(
    `competitive scenarios: ${report.approvedCompetitiveScenarios}/${report.totalCompetitiveScenarios} approved`,
  );
  console.log(
    `legal: documentDraft=${report.legal.documentDraft} appDraft=${report.legal.appDraft} approval=${report.legal.approvalComplete}`,
  );
  console.log(
    `deployment: unchecked=${report.deployment.uncheckedItems} approval=${report.deployment.approvalComplete}`,
  );
  console.log(
    `audio: policy=${report.audio.policy} approvedAssets=${report.audio.approvedAssets} qc=${report.audio.qcComplete}`,
  );
  console.log("");
  console.log("Next actions");

  for (const action of report.nextActions) {
    console.log(
      `${action.priority}. [${action.owner}] ${action.title}`,
    );
    console.log(`   why: ${action.why}`);
    console.log(`   command: ${action.command}`);
    console.log(`   next: ${action.next}`);
  }
}

function selfTest() {
  const fixture = {
    promotion: {
      entries: [
        {
          scenarioId: "s00_tutorial",
          status: "tutorial_exception",
        },
        {
          scenarioId: "s01",
          status: "source_hold",
          sourceRightsComplete: false,
          blockers: ["direct source"],
          humanReview: { status: "pending" },
        },
        {
          scenarioId: "s03",
          status: "review_ready",
          sourceRightsComplete: true,
          blockers: ["human review"],
          humanReview: { status: "pending" },
        },
      ],
    },
    releaseEvidence: {
      release: "1.0.0",
      updatedAt: "2026-10-07",
      audioPolicy: "deferred",
      approvals: {
        legalPrivacy: { status: "pending" },
        externalDeployment: { status: "pending" },
        realDevice: { status: "pending", checks: {} },
        intranetPolicy: { status: "pending" },
        pilot: { status: "pending", participants: 0, blockerCount: null },
        audioQc: { status: "pending" },
      },
    },
    deploymentText: "- [ ] configure\n",
    legalDoc: "검토 초안 [확정 필요]",
    legalApp: "검토 초안",
    audioManifest: { assets: [] },
  };

  const report = buildReport(fixture);
  const ids = new Set(report.nextActions.map((action) => action.id));

  for (const expected of [
    "human-review:s03",
    "source-hold:s01",
    "legal-privacy",
    "external-deployment",
    "real-device",
    "intranet-policy",
    "audio-policy",
    "pilot",
    "staging-smoke-rc",
  ]) {
    if (!ids.has(expected)) {
      throw new Error(`self_test_missing_action:${expected}`);
    }
  }

  console.log("RELEASE_HANDOFF_SELF_TEST_PASS");
}

const argv = process.argv.slice(2);

if (argv.includes("--self-test")) {
  try {
    selfTest();
  } catch (cause) {
    console.error(
      cause instanceof Error ? cause.message : "release_handoff_self_test_failed",
    );
    process.exit(1);
  }
  process.exit(0);
}

try {
  const report = buildReport({
    promotion: readJson("scenarios/research/promotion-status.json"),
    releaseEvidence: readJson("ops/release-evidence.json"),
    deploymentText: read("docs/09_DEPLOYMENT_BOOTSTRAP.md"),
    legalDoc: read("docs/07_TERMS_PRIVACY_DRAFT.md"),
    legalApp: read("apps/web/src/features/legal/LegalPage.tsx"),
    audioManifest: readJson("apps/web/public/audio/audio_manifest.json"),
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }
} catch (cause) {
  console.error(
    `RELEASE_HANDOFF_FAIL: ${cause instanceof Error ? cause.message : "unknown_error"}`,
  );
  process.exit(1);
}
