import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";
import { simulateScenarioPaths } from "../packages/engine/src/simulator.ts";
import { sha256Content } from "./scenario-approval-integrity.ts";

interface PromotionEntry {
  scenarioId: string;
  file: string;
  status: "tutorial_exception" | "source_hold" | "review_ready" | "approved";
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
  entries: PromotionEntry[];
}

interface EvidenceSource {
  id: string;
  authority: string;
  sourceClass: string;
  url: string;
  eventSpecific: boolean;
  purpose: string[];
  rights: {
    status: string;
    license: string | null;
    evidenceUrl: string | null;
  };
}

interface EvidenceEntry {
  scenarioId: string;
  sourceVerdict: "partial" | "complete";
  rightsVerdict: "partial" | "complete";
  missing: string[];
  sources: EvidenceSource[];
}

interface EvidenceManifest {
  schemaVersion: number;
  entries: EvidenceEntry[];
}

interface Options {
  scenarioId: string | null;
  output: string | null;
  check: boolean;
  stdout: boolean;
}

function fail(message: string): never {
  console.error(`REVIEW_PACKET_FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const value = (prefix: string) =>
    argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    scenarioId: value("--scenario="),
    output: value("--output="),
    check: argv.includes("--check"),
    stdout: argv.includes("--stdout"),
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function pct(rate: number): string {
  if (rate === 0) return "0%";
  const value = rate * 100;
  return value < 1 ? "<1%" : `${Math.round(value)}%`;
}

function checkbox(label: string): string {
  return `- [ ] ${label}`;
}

function reviewerChecklist(): string[] {
  return [
    checkbox("공식 사실, HF 해석, HERO 교육적 재구성이 서로 구분되어 있다."),
    checkbox("직접원인·근본원인·기여원인/기여요인이 구분되어 있고, 사람의 마지막 행동을 근본원인으로 끝내지 않는다."),
    checkbox("Peer Check·Place Keeping·Stop When Unsure 등 HU Tool의 명칭과 적용 맥락이 실제 HF 관점에 맞다."),
    checkbox("발전소/호기/설비 Tag/실제 설정값·시험조건·복구절차를 역추적할 수 있는 정보가 과도하게 노출되지 않는다."),
    checkbox("safe stop을 실패나 소극적 행동으로 묘사하지 않는다."),
    checkbox("게임용 PSF/Hazard Index가 규제기관 공식 원인분류·HEP·개인 능력지표처럼 읽히지 않는다."),
    checkbox("incidentDebrief의 HERO 원인분류가 조사기관의 공식 원인분류와 명확히 구분되고, 인과사슬·실패방어막·관련 재발방지대책이 근거와 일치한다."),
    checkbox("공식 출처의 기관·일자·링크·이용조건 표기가 실제 공개 화면과 일치한다."),
    checkbox("선택지에 도덕적 정답 단서가 과도하지 않고, 경로/엔딩 분포가 교육목적에 적절하다."),
    checkbox("이 SHA-256의 JSON을 직접 검토했으며, 승인 후 내용 변경 시 재검토가 필요함을 이해했다."),
  ];
}

const options = parseArgs(process.argv.slice(2));
if (!options.scenarioId) {
  fail("missing --scenario=<scenario_id>");
}

const root = process.cwd();
const promotionPath = resolve(root, "scenarios/research/promotion-status.json");
const evidencePath = resolve(root, "scenarios/research/source-evidence.json");

if (!existsSync(promotionPath) || !existsSync(evidencePath)) {
  fail("promotion-status.json or source-evidence.json is missing");
}

const promotion = readJson<PromotionManifest>(promotionPath);
const evidence = readJson<EvidenceManifest>(evidencePath);

const entry = promotion.entries.find(
  (candidate) => candidate.scenarioId === options.scenarioId,
);
if (!entry) fail(`scenario is not registered: ${options.scenarioId}`);
if (entry.status === "tutorial_exception") {
  fail("tutorial_exception does not require a competitive human-review packet");
}

const evidenceEntry = evidence.entries.find(
  (candidate) => candidate.scenarioId === options.scenarioId,
);
if (!evidenceEntry) {
  fail(`source evidence is missing: ${options.scenarioId}`);
}

const scenarioPath = resolve(root, entry.file);
if (!existsSync(scenarioPath)) fail(`scenario file is missing: ${entry.file}`);

const scenarioContent = readFileSync(scenarioPath, "utf8");
const contentSha256 = sha256Content(scenarioContent);
const scenario = ScenarioSchema.parse(JSON.parse(scenarioContent));
const simulation = simulateScenarioPaths(scenario);

const defaultOutput = `scenarios/research/generated/${entry.scenarioId}_HUMAN_REVIEW.md`;
const outputRelative = options.output ?? defaultOutput;
const outputPath = resolve(root, outputRelative);

const sources = evidenceEntry.sources
  .map((source) => {
    const rights = source.rights.license
      ? `${source.rights.status} · ${source.rights.license}`
      : source.rights.status;
    return `| ${source.authority} | ${source.sourceClass} | ${source.eventSpecific ? "사건 직접근거" : "탐색/보조"} | ${source.purpose.join(", ")} | ${rights} | ${source.url} |`;
  })
  .join("\n");

const blockers =
  entry.blockers && entry.blockers.length > 0
    ? entry.blockers.map((blocker) => `- ${blocker}`).join("\n")
    : "- 없음";

const warnings =
  simulation.warnings.length > 0
    ? simulation.warnings
        .map(
          (warning) =>
            `- **${warning.severity.toUpperCase()} ${warning.code}** — ${warning.message}`,
        )
        .join("\n")
    : "- 없음";

const endings = [
  ["safe_complete", simulation.endingCounts.safe_complete, simulation.endingRates.safe_complete],
  ["safe_stop", simulation.endingCounts.safe_stop, simulation.endingRates.safe_stop],
  ["near_miss", simulation.endingCounts.near_miss, simulation.endingRates.near_miss],
  ["event", simulation.endingCounts.event, simulation.endingRates.event],
]
  .map(([ending, count, rate]) => `| ${ending} | ${count} | ${pct(Number(rate))} |`)
  .join("\n");

const checklist = reviewerChecklist().join("\n");
const scenarioSpecificSupport =
  entry.scenarioId === "s03_procedure_reality_gap"
    ? "- S03 원인-근거-방어막-재발방지대책 추적표: `scenarios/research/S03_CAUSE_TRACEABILITY_MATRIX_V1.md`\\n"
    : "";

const promotionCommand = `pnpm promote:scenario -- \\\n  --scenario=${entry.scenarioId} \\\n  --approved-by="검토자 성명 또는 공식 역할" \\\n  --approved-at=YYYY-MM-DD \\\n  --confirm-hf \\\n  --confirm-anonymization \\\n  --confirm-debrief \\\n  --apply`;

const markdown = `# HERO Human Review Packet — ${scenario.title}

> **사람 검토용 패킷 / 자동 승인 문서가 아님**  
> Scenario ID: \`${entry.scenarioId}\`  
> Version: \`${scenario.version}\`  
> Source file: \`${entry.file}\`  
> Review content SHA-256: \`${contentSha256}\`

## 1. 현재 승격 상태

| 항목 | 값 |
|---|---|
| promotion status | **${entry.status.toUpperCase()}** |
| sourceRightsComplete | \`${entry.sourceRightsComplete}\` |
| source verdict | \`${evidenceEntry.sourceVerdict}\` |
| rights verdict | \`${evidenceEntry.rightsVerdict}\` |
| HF review | \`${entry.hfReviewComplete}\` |
| anonymization review | \`${entry.anonymizationReviewComplete}\` |
| human review | \`${entry.humanReview.status}\` |
| approved content SHA-256 | \`${entry.approvedContentSha256 ?? "not approved"}\` |

### 현재 blocker

${blockers}

## 2. 시나리오 기본정보

| 항목 | 값 |
|---|---|
| 제목 | ${scenario.title} |
| 기본 관점 | \`${scenario.defaultPerspectiveRole}\` |
| 대상 직무 | ${scenario.audienceJobs.join(", ")} |
| 예상 소요 | 약 ${scenario.estimatedMinutes}분 |
| 지급 카드 | ${scenario.cards.join(", ") || "없음"} |
| incidentDebrief | ${scenario.incidentDebrief ? "있음" : "없음"} |

> 검토자는 **위 SHA-256과 일치하는 JSON**을 기준으로 검토해야 한다. 승인 이후 JSON이 변경되면 기존 승인은 자동 승계되지 않는다.

## 3. 공식 근거·권리

| 기관 | source class | 범위 | 용도 | 권리 상태 | URL |
|---|---|---|---|---|---|
${sources}

### 아직 부족한 근거

${evidenceEntry.missing.length > 0 ? evidenceEntry.missing.map((item) => `- ${item}`).join("\n") : "- 없음"}

## 4. 자동 기술검증 스냅샷

| 항목 | 결과 |
|---|---|
| Schema parse | PASS |
| Path exploration | ${simulation.complete ? "COMPLETE" : "INCOMPLETE"} |
| explored states | ${simulation.exploredStates.toLocaleString("en-US")} |
| terminal paths | ${simulation.terminalPaths.toLocaleString("en-US")} |
| HP min / mean / max | ${simulation.hp.min ?? "-"} / ${simulation.hp.mean ?? "-"} / ${simulation.hp.max ?? "-"} |
| dominant choice warning | ${simulation.warnings.filter((w) => w.code === "dominant_choice_bias").length} |
| ending imbalance warning | ${simulation.warnings.filter((w) => w.code === "ending_imbalance").length} |

### 엔딩 분포

| ending | paths | rate |
|---|---:|---:|
${endings}

### 자동 경고

${warnings}

자동검증은 HF·익명화·운전정보 과노출·출처 해석을 승인하지 않는다.

## 5. 사람 검토 체크리스트

${checklist}

### 검토 기록

| 검토 영역 | 검토자/역할 | 결과 | 일자 | 비고 |
|---|---|---|---|---|
| HF 정확성·HU Tool |  | HOLD / PASS |  |  |
| 원자력 운전/정비 맥락 |  | HOLD / PASS |  |  |
| 익명화·운전정보 과노출 |  | HOLD / PASS |  |  |
| 교육·Just Culture |  | HOLD / PASS |  |  |
| incidentDebrief·출처 경계 |  | HOLD / PASS |  |  |
| 최종 콘텐츠 승인 |  | HOLD / PASS |  |  |

최종 결론: [ ] 승인  [ ] 수정 후 재검토  [ ] 보류

의견:

## 6. 보조 검토자료

- 공통 HF 체크리스트: \`scenarios/research/T3_HF_REVIEW_CHECKLIST_V1.md\`
- 사람 검토 증거 기록 가이드: \`scenarios/research/HUMAN_REVIEW_EVIDENCE_GUIDE.md\`
- 공통 사람 검토 패킷: \`scenarios/research/T3_HUMAN_REVIEW_PACKET_V1.md\`
- 시나리오별 AI 사전검토가 있는 경우: \`scenarios/research/S03_AI_PRE_REVIEW_V1.md\`
${scenarioSpecificSupport}- source evidence: \`scenarios/research/source-evidence.json\`
- promotion manifest: \`scenarios/research/promotion-status.json\`

## 7. 승인 후 안전한 승격

먼저 preflight에서 현재 SHA-256을 다시 확인한다.

\`\`\`bash
pnpm promote:scenario -- --scenario=${entry.scenarioId}
\`\`\`

각 검토영역의 결과를 current SHA에 기록하고 확인한다.

\`\`\`bash
pnpm check:human-review-evidence
\`\`\`

사람 검토 5개 영역이 **동일한 current SHA에 대해 모두 PASS**이고 preflight의 \`draftSha256\`이 이 문서의 SHA-256과 같을 때만 아래를 실행한다.

\`\`\`bash
${promotionCommand}
\`\`\`

승격 후:

\`\`\`bash
pnpm check:scenario-promotion
pnpm check:source-evidence
pnpm validate:scenario
pnpm simulate:scenario
pnpm analyze:hp-balance
pnpm check:mvp-readiness
\`\`\`

> 승인 명령은 사람 검토의 **기록 수단**일 뿐 검토 자체를 대신하지 않는다.
`;

if (options.stdout) {
  process.stdout.write(markdown);
}

if (options.check) {
  if (!existsSync(outputPath)) {
    fail(`generated packet is missing: ${outputRelative}`);
  }

  const current = readFileSync(outputPath, "utf8");
  if (current !== markdown) {
    fail(
      `generated packet is stale: ${outputRelative}. Run pnpm build:review-packet -- --scenario=${entry.scenarioId}`,
    );
  }

  console.log(
    `REVIEW_PACKET_CHECK_PASS: ${entry.scenarioId} ${contentSha256}`,
  );
  process.exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown, "utf8");
console.log(
  `REVIEW_PACKET_WRITTEN: ${outputRelative} SHA-256=${contentSha256}`,
);
