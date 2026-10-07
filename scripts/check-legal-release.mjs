import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

function fail(message) {
  console.error(`LEGAL_RELEASE_FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  return {
    strict: argv.includes("--strict"),
    json: argv.includes("--json"),
    selfTest: argv.includes("--self-test"),
  };
}

function findMarkers(text, markers) {
  return markers.filter((marker) => text.includes(marker));
}

export function evaluateLegalRelease({ docText, appText }) {
  const draftMarkers = [
    "[확정 필요]",
    "검토 초안",
    "개발·검토용 초안",
  ];

  const requiredDocPhrases = [
    "인사평가·징계",
    "개인정보 처리 목적",
    "보유기간",
    "처리위탁",
    "국외이전",
    "개인정보 보호책임자",
  ];

  const requiredAppPhrases = [
    "HERO 이용약관",
    "개인정보 처리방침",
    "인사평가·징계",
    "처리위탁·국외이전",
    "개인정보 보호책임자",
  ];

  const docDraftMarkers = findMarkers(docText, draftMarkers);
  const appDraftMarkers = findMarkers(appText, draftMarkers);
  const missingDocPhrases = requiredDocPhrases.filter(
    (phrase) => !docText.includes(phrase),
  );
  const missingAppPhrases = requiredAppPhrases.filter(
    (phrase) => !appText.includes(phrase),
  );

  const checks = [
    {
      id: "review_document_final",
      status: docDraftMarkers.length === 0 ? "pass" : "blocked",
      detail:
        docDraftMarkers.length === 0
          ? "Legal/privacy review document has no draft placeholders."
          : `Review document still contains draft markers: ${docDraftMarkers.join(", ")}`,
    },
    {
      id: "shipped_legal_ui_final",
      status: appDraftMarkers.length === 0 ? "pass" : "blocked",
      detail:
        appDraftMarkers.length === 0
          ? "Shipped /terms and /privacy UI has no draft placeholders."
          : `Shipped legal UI still contains draft markers: ${appDraftMarkers.join(", ")}`,
    },
    {
      id: "review_document_contract",
      status: missingDocPhrases.length === 0 ? "pass" : "blocked",
      detail:
        missingDocPhrases.length === 0
          ? "Review document retains required privacy/learning-use concepts."
          : `Review document is missing required concepts: ${missingDocPhrases.join(", ")}`,
    },
    {
      id: "shipped_legal_ui_contract",
      status: missingAppPhrases.length === 0 ? "pass" : "blocked",
      detail:
        missingAppPhrases.length === 0
          ? "Shipped legal UI retains required policy concepts."
          : `Shipped legal UI is missing required concepts: ${missingAppPhrases.join(", ")}`,
    },
  ];

  const blocking = checks.filter((check) => check.status === "blocked");

  return {
    verdict: blocking.length === 0 ? "legal_ui_ready" : "legal_ui_blocked",
    checks,
  };
}

function runSelfTest() {
  const draft = evaluateLegalRelease({
    docText:
      "# 이용약관\n검토 초안\n인사평가·징계\n개인정보 처리 목적\n보유기간\n처리위탁\n국외이전\n개인정보 보호책임자",
    appText:
      "HERO 이용약관 개인정보 처리방침 인사평가·징계 처리위탁·국외이전 개인정보 보호책임자 [확정 필요]",
  });

  if (draft.verdict !== "legal_ui_blocked") {
    fail("self-test expected draft fixture to be blocked");
  }

  const final = evaluateLegalRelease({
    docText:
      "# 이용약관\n인사평가·징계\n개인정보 처리 목적\n보유기간\n처리위탁\n국외이전\n개인정보 보호책임자",
    appText:
      "HERO 이용약관 개인정보 처리방침 인사평가·징계 처리위탁·국외이전 개인정보 보호책임자",
  });

  if (final.verdict !== "legal_ui_ready") {
    fail("self-test expected final fixture to be ready");
  }

  const missingContract = evaluateLegalRelease({
    docText:
      "# 이용약관\n인사평가·징계\n개인정보 처리 목적\n보유기간\n처리위탁\n국외이전\n개인정보 보호책임자",
    appText: "HERO 이용약관 개인정보 처리방침",
  });

  if (missingContract.verdict !== "legal_ui_blocked") {
    fail("self-test expected missing shipped policy concepts to be blocked");
  }

  console.log("LEGAL_RELEASE_SELF_TEST_PASS");
}

const options = parseArgs(process.argv.slice(2));

if (options.selfTest) {
  runSelfTest();
  process.exit(0);
}

const docPath = resolve(root, "docs/07_TERMS_PRIVACY_DRAFT.md");
const appPath = resolve(
  root,
  "apps/web/src/features/legal/LegalPage.tsx",
);

for (const path of [docPath, appPath]) {
  if (!existsSync(path)) {
    fail(`required legal release file is missing: ${path}`);
  }
}

const report = evaluateLegalRelease({
  docText: readFileSync(docPath, "utf8"),
  appText: readFileSync(appPath, "utf8"),
});

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("HERO legal release gate");
  console.log("=======================");
  console.log(`verdict: ${report.verdict}`);
  console.log("");

  for (const check of report.checks) {
    console.log(
      `[${check.status.toUpperCase()}] ${check.id} — ${check.detail}`,
    );
  }
}

if (options.strict && report.verdict !== "legal_ui_ready") {
  process.exitCode = 2;
}
