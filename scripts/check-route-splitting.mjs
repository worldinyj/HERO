import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(
  process.cwd(),
  "apps/web/dist/.vite/manifest.json",
);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const expectedDynamicModules = [
  "src/features/play/GamePage.tsx",
  "src/features/play/CompetitiveBriefingPage.tsx",
  "src/features/leaderboard/LeaderboardPage.tsx",
  "src/features/profile/ProfilePage.tsx",
  "src/features/manager/ManagerDashboardPage.tsx",
  "src/features/admin/AdminOrgPage.tsx",
  "src/features/admin/AdminScenarioPage.tsx",
];

const missing = [];

for (const moduleId of expectedDynamicModules) {
  const entry = Object.entries(manifest).find(([key]) =>
    key.endsWith(moduleId),
  );

  if (!entry || entry[1]?.isDynamicEntry !== true) {
    missing.push(moduleId);
    continue;
  }

  const outputFile = resolve(process.cwd(), "apps/web/dist", entry[1].file);
  const sizeKb = Math.round(statSync(outputFile).size / 1024);
  console.log(
    `ROUTE_CHUNK_OK ${moduleId} -> ${entry[1].file} (${sizeKb} KiB)`,
  );
}

if (missing.length > 0) {
  console.error(
    `Expected dynamic route chunks are missing: ${missing.join(", ")}`,
  );
  process.exit(1);
}

const jsChunks = Object.values(manifest).filter(
  (entry) => typeof entry.file === "string" && entry.file.endsWith(".js"),
);

if (jsChunks.length < expectedDynamicModules.length + 1) {
  console.error(
    `Unexpectedly low JavaScript chunk count: ${jsChunks.length}`,
  );
  process.exit(1);
}

console.log(`ROUTE_SPLIT_PASS chunks=${jsChunks.length}`);
