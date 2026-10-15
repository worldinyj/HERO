import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const manifestPath = resolve(
  process.cwd(),
  "apps/web/dist/.vite/manifest.json",
);

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

const expectedDynamicModules = [
  "src/features/invite/InvitationPage.tsx",
  "src/features/legal/LegalPage.tsx",
  "src/features/exploration/ExplorationPage.tsx",
  "src/features/play/GamePage.tsx",
  "src/features/play/TutorialGamePage.tsx",
  "src/features/play/CompetitiveGamePage.tsx",
  "src/features/play/CompetitiveBriefingPage.tsx",
  "src/features/leaderboard/LeaderboardPage.tsx",
  "src/features/profile/ProfilePage.tsx",
  "src/features/manager/ManagerDashboardPage.tsx",
  "src/features/admin/AdminOrgPage.tsx",
  "src/features/admin/AdminAuditPage.tsx",
  "src/features/admin/AdminOverviewPage.tsx",
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

function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen;
  seen.add(key);
  for (const dependency of manifest[key]?.imports ?? []) staticClosure(dependency, seen);
  return seen;
}
const tutorial = "src/features/play/TutorialGamePage.tsx";
const competitive = "src/features/play/CompetitiveGamePage.tsx";
const initial = staticClosure("index.html");
if (initial.has(tutorial) || initial.has(competitive) ||
    staticClosure(tutorial).has(competitive) || staticClosure(competitive).has(tutorial)) {
  throw new Error("Play modes must remain outside the initial static graph and independent of each other");
}
console.log("PLAY_MODE_SPLIT_PASS tutorial and competitive load independently");

const queue = "src/lib/submissionQueue.ts";
if (manifest[queue]?.isDynamicEntry !== true || initial.has(queue)) {
  throw new Error("Participant submission queue must remain a dynamic module outside the initial static graph");
}
console.log("PARTICIPANT_QUEUE_SPLIT_PASS queue processing loads after participant authentication");
