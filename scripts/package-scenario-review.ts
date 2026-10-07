import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";

interface SourceEntry {
  id: string;
  scenarioIds: string[];
  authority: string;
  sourceType: string;
  title: string;
  publishedDate: string;
  url: string;
  evidenceUse: string;
  verificationStatus: string;
  usageReviewStatus: string;
}

interface ReviewEntry {
  scenarioId: string;
  draftPath: string;
  hfBriefPath: string;
  evidenceStatus: string;
  sourceIds: string[];
  blockers: string[];
}

interface ReviewManifest {
  version: number;
  generatedPackageDir: string;
  scenarios: ReviewEntry[];
}

interface SourceRegister {
  version: number;
  checkedAt: string;
  sources: SourceEntry[];
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
const selectedScenarioId = scenarioArg?.slice("--scenario=".length);

function countNodes(nodes: Record<string, { type: string }>) {
  const result: Record<string, number> = {};
  for (const node of Object.values(nodes)) {
    result[node.type] = (result[node.type] ?? 0) + 1;
  }
  return result;
}

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderPackage(
  entry: ReviewEntry,
  scenario: ReturnType<typeof ScenarioSchema.parse>,
  sources: SourceEntry[],
): string {
  const counts = countNodes(scenario.nodes);
  const decisions = Object.entries(scenario.nodes)
    .filter(([, node]) => node.type === "decision")
    .map(([nodeId, node]) => {
      if (node.type !== "decision") return "";
      const actions = node.choices
        .map((choice) => `${choice.actionId} — ${choice.label}`)
        .join("; ");
      return `- ${nodeId}: ${node.prompt}\n  - actions: ${actions}`;
    })
    .filter(Boolean)
    .join("\n");

  const debrief = scenario.incidentDebrief;
  if (!debrief) {
    throw new Error(`incident_debrief_required:${scenario.id}`);
  }

  const sourceRows = sources.map((source) =>
    `| ${source.id} | ${source.authority} | ${source.sourceType} | ${source.verificationStatus} | ${source.usageReviewStatus} | ${source.url} |`,
  ).join("\n");

  const lessons = debrief.lessons.map((lesson) =>
    `- **${lesson.title}**${lesson.toolId ? ` (HU: ${lesson.toolId})` : ""}: ${lesson.detail}`,
  ).join("\n");

  return `# ${scenario.title} — Human Review Package

> **자동 생성 검토자료 / publish 승인서가 아님**  
> Scenario ID: \`${scenario.id}\` · Version: ${scenario.version}  
> Evidence status: **${entry.evidenceStatus}**

## 1. 검토 대상

- Draft JSON: \`${entry.draftPath}\`
- HF Brief: \`${entry.hfBriefPath}\`
- 관점: \`${scenario.defaultPerspectiveRole}\`
- 대상 직무: ${scenario.audienceJobs.join(", ")}
- 예상 소요: ${scenario.estimatedMinutes}분
- 지급 HU Tool: ${scenario.cards.join(", ") || "없음"}
- 노드: scene ${counts.scene ?? 0} / event ${counts.event ?? 0} / decision ${counts.decision ?? 0} / hazard ${counts.hazard ?? 0} / ending ${counts.ending ?? 0}

## 2. 익명화 실사건 공개문안

**사건유형**  
${debrief.caseType}

**개요**  
${debrief.overview}

### 근본원인
${bullets(debrief.rootCauses)}

### 기여요인
${bullets(debrief.contributingFactors)}

### 학습 교훈
${lessons}

## 3. 주요 결정지점

${decisions}

## 4. 근거 출처

| ID | 기관 | 유형 | 확인상태 | 이용검토 | URL |
|---|---|---|---|---|---|
${sourceRows}

> 출처 URL은 내부 검토 추적용이다. 공개 게임 화면에는 사건번호·발전소·호기·개인·고유 설비정보를 노출하지 않는다.

## 5. 현재 Blocker

${entry.blockers.map((item) => `- [ ] ${item}`).join("\n")}

## 6. 사람 승인

| 검토 | 결과 | 검토자/역할 | 일자 | 비고 |
|---|---|---|---|---|
| HF 정확성 | HOLD |  |  |  |
| 운전/정비 맥락 | HOLD |  |  |  |
| 익명화·정보보안 | HOLD |  |  |  |
| 교육·Just Culture | HOLD |  |  |  |
| 최종 콘텐츠 승인 | HOLD |  |  |  |

**모든 필수 검토가 PASS하기 전에는 \`scenarios/data\` 이동 및 관리자 \`published\` 전환 금지.**
`;
}

async function main() {
  const manifest = JSON.parse(
    await readFile("scenarios/research/review-manifest.json", "utf8"),
  ) as ReviewManifest;
  const sourceRegister = JSON.parse(
    await readFile("scenarios/research/source-register.json", "utf8"),
  ) as SourceRegister;

  const selected = selectedScenarioId
    ? manifest.scenarios.filter((entry) => entry.scenarioId === selectedScenarioId)
    : manifest.scenarios;

  if (selected.length === 0) {
    throw new Error(`review_scenario_not_found:${selectedScenarioId}`);
  }

  const sourceById = new Map(
    sourceRegister.sources.map((source) => [source.id, source]),
  );

  await mkdir(manifest.generatedPackageDir, { recursive: true });
  let drift = false;

  for (const entry of selected) {
    const raw = JSON.parse(await readFile(entry.draftPath, "utf8")) as unknown;
    const scenario = ScenarioSchema.parse(raw);

    if (scenario.id !== entry.scenarioId) {
      throw new Error(
        `review_manifest_scenario_mismatch:${entry.scenarioId}:${scenario.id}`,
      );
    }

    await readFile(entry.hfBriefPath, "utf8");

    const sources = entry.sourceIds.map((sourceId) => {
      const source = sourceById.get(sourceId);
      if (!source) throw new Error(`review_source_missing:${sourceId}`);
      if (!source.scenarioIds.includes(entry.scenarioId)) {
        throw new Error(
          `review_source_scenario_mismatch:${sourceId}:${entry.scenarioId}`,
        );
      }
      return source;
    });

    const output = renderPackage(entry, scenario, sources);
    const outputPath = path.join(
      manifest.generatedPackageDir,
      `${entry.scenarioId}_REVIEW.md`,
    );

    if (checkOnly) {
      let existing = "";
      try {
        existing = await readFile(outputPath, "utf8");
      } catch {
        drift = true;
        console.error(`MISSING ${outputPath}`);
        continue;
      }

      if (existing !== output) {
        drift = true;
        console.error(`STALE ${outputPath}`);
      } else {
        console.log(`PASS ${outputPath}`);
      }
    } else {
      await writeFile(outputPath, output, "utf8");
      console.log(`WROTE ${outputPath}`);
    }
  }

  if (drift) {
    console.error("Review packages are stale. Run: pnpm package:scenario-review");
    process.exitCode = 1;
  }
}

await main();
