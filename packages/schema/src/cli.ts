import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ScenarioSchema } from "./scenario";
import { validateScenarioGraph } from "./validation";

async function collectJsonFiles(target: string): Promise<string[]> {
  const stat = await import("node:fs/promises").then(({ stat }) => stat(target));

  if (stat.isFile()) {
    return target.endsWith(".json") ? [target] : [];
  }

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const child = path.join(target, entry.name);

      if (entry.isDirectory()) {
        return collectJsonFiles(child);
      }

      return entry.isFile() && entry.name.endsWith(".json") ? [child] : [];
    }),
  );

  return nested.flat();
}

async function validateFile(file: string): Promise<boolean> {
  try {
    const raw = await readFile(file, "utf8");
    const json = JSON.parse(raw) as unknown;
    const parsed = ScenarioSchema.safeParse(json);

    if (!parsed.success) {
      console.error(`FAIL ${file}`);
      for (const issue of parsed.error.issues) {
        console.error(`  [schema] ${issue.path.join(".") || "<root>"}: ${issue.message}`);
      }
      return false;
    }

    const graphIssues = validateScenarioGraph(parsed.data);
    const errors = graphIssues.filter((issue) => issue.severity === "error");
    const warnings = graphIssues.filter((issue) => issue.severity === "warning");

    if (errors.length > 0) {
      console.error(`FAIL ${file}`);
      for (const issue of errors) {
        console.error(`  [${issue.code}] ${issue.path}: ${issue.message}`);
      }
      return false;
    }

    console.log(`PASS ${file}`);
    for (const issue of warnings) {
      console.warn(`  WARN [${issue.code}] ${issue.path}: ${issue.message}`);
    }

    return true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`FAIL ${file}: ${message}`);
    return false;
  }
}

async function main() {
  const target = process.argv[2] ?? "scenarios/data";
  let files: string[];

  try {
    files = (await collectJsonFiles(target)).sort();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    console.error(`Scenario path error: ${message}`);
    process.exitCode = 1;
    return;
  }

  if (files.length === 0) {
    console.error(`No scenario JSON files found under '${target}'.`);
    process.exitCode = 1;
    return;
  }

  const results = await Promise.all(files.map(validateFile));
  const failed = results.filter((result) => !result).length;

  console.log(`\nScenario validation: ${files.length - failed}/${files.length} passed.`);
  process.exitCode = failed > 0 ? 1 : 0;
}

await main();
