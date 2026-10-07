import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { simulateScenarioPaths } from "../packages/engine/src/simulator.ts";
import { ScenarioSchema } from "../packages/schema/src/scenario.ts";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const strict = args.includes("--strict");
const scenarioArg = args.find((arg) => arg.startsWith("--scenario="));
const scenarioPath = scenarioArg?.slice("--scenario=".length);

const files = scenarioPath
  ? [resolve(process.cwd(), scenarioPath)]
  : readdirSync(resolve(process.cwd(), "scenarios/data"))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => resolve(process.cwd(), "scenarios/data", name));

const reports = files.map((file) => {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const scenario = ScenarioSchema.parse(raw);
  return simulateScenarioPaths(scenario);
});

if (jsonOutput) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const report of reports) {
    console.log(
      `\n[${report.complete ? "COMPLETE" : "INCOMPLETE"}] ${report.scenarioId} v${report.scenarioVersion}`,
    );
    console.log(
      `  states=${report.exploredStates} terminalPaths=${report.terminalPaths} HP=${report.hp.min ?? "-"}..${report.hp.max ?? "-"} mean=${report.hp.mean ?? "-"}`,
    );

    const endings = Object.entries(report.endingCounts)
      .filter(([, count]) => count > 0)
      .map(([ending, count]) => {
        const rate = report.endingRates[ending] ?? 0;
        return `${ending}=${count}(${Math.round(rate * 100)}%)`;
      })
      .join(" · ");

    console.log(`  endings: ${endings || "none"}`);

    for (const nodeId of [...new Set(report.choices.map((choice) => choice.nodeId))]) {
      console.log(`  decision ${nodeId}`);
      for (const choice of report.choices.filter((item) => item.nodeId === nodeId)) {
        const favorable =
          choice.favorableEndingRate === null
            ? "-"
            : `${Math.round(choice.favorableEndingRate * 100)}%`;
        console.log(
          `    - ${choice.actionId}: samples=${choice.samples} meanHP=${choice.meanHp ?? "-"} favorable=${favorable}`,
        );
      }
    }

    for (const warning of report.warnings) {
      console.log(
        `  ${warning.severity.toUpperCase()} ${warning.code}: ${warning.message}`,
      );
    }
  }
}

const hasError = reports.some((report) =>
  report.warnings.some((warning) => warning.severity === "error")
);
const hasWarning = reports.some((report) =>
  report.warnings.some((warning) => warning.severity === "warning")
);

if (hasError || (strict && hasWarning)) {
  process.exitCode = 1;
}
