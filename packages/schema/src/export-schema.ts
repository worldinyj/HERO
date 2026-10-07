import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { scenarioJsonSchema } from "./scenario";

const output = process.argv[2] ?? "scenarios/schema/hero-scenario.schema.json";
await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(scenarioJsonSchema(), null, 2)}\n`,
  "utf8",
);
console.log(`Wrote ${output}`);
