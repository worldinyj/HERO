#!/usr/bin/env node
/**
 * HERO Mac/local alternative to GitHub Actions.
 *
 * sync              Fetch and fast-forward the protected batch branch.
 * doctor            Print the local prerequisites without changing anything.
 * qa [--with-db]    Run local CI gates and save same-SHA evidence.
 * preview           Deploy a verified build to a NON-production Pages branch.
 * smoke             Smoke-check an explicitly supplied preview URL.
 *
 * This tool NEVER runs git push, supabase db push/reset, Supabase remote
 * function deployment, Cloudflare production branch deployment, or gh actions.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BRANCH = "work/actions-paused-batch-20261008";
// Confirmed by Wrangler project list: project slug differs from pages.dev host.
export const PAGES_PROJECT = "hero";
export const PAGES_DOMAIN = "hero-dnr.pages.dev";
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const EVIDENCE = join(ROOT, ".hero-local", "qa-pass.json");
const PREVIEW_ENV = join(ROOT, "apps/web/.env.production.local");
const DIST = join(ROOT, "apps/web/dist");
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function safeOrigin(origin) {
  return /(?:^|[/:@])github\.com[:/]worldinyj\/HERO(?:\.git)?\/?$/i.test(origin.trim());
}
export function safePreviewBranch(branch) {
  return /^qa-[a-z0-9][a-z0-9-]{0,32}$/.test(branch);
}
export function safeProject(project) {
  return /^[a-z0-9](?:[a-z0-9-]{0,59}[a-z0-9])?$/.test(project);
}
export function previewAppUrl(branch) {
  if (!safePreviewBranch(branch)) throw Error("Invalid preview branch: require qa- prefix");
  return "https://" + branch + "." + PAGES_DOMAIN;
}
export function safePreviewOrigin(value) {
  try {
    const parsed = new URL(value);
    const suffix = "." + PAGES_DOMAIN;
    const branch = parsed.hostname.endsWith(suffix)
      ? parsed.hostname.slice(0, -suffix.length) : "";
    return parsed.protocol === "https:" && safePreviewBranch(branch) &&
      !parsed.username && !parsed.password && !parsed.port &&
      parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}
export function isValidEvidence(record, expected, now = Date.now()) {
  return Boolean(record && record.version === 1 &&
    record.branch === BRANCH && record.sha === expected.sha &&
    record.withDb === true && record.envHash === expected.envHash &&
    record.distHash === expected.distHash &&
    typeof record.passedAt === "string" &&
    Number.isFinite(Date.parse(record.passedAt)) &&
    now >= Date.parse(record.passedAt) &&
    now - Date.parse(record.passedAt) <= MAX_AGE_MS);
}
export function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function treeHash(dir) {
  if (!existsSync(dir)) throw Error("Missing build output: " + relative(ROOT, dir));
  const paths = [];
  function walk(base) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const target = join(base, entry.name);
      if (entry.isSymbolicLink()) throw Error("Symlink in release output: " + target);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) paths.push(target);
    }
  }
  walk(dir);
  if (!paths.length) throw Error("No files in release build output");
  const hash = createHash("sha256");
  for (const path of paths.sort()) {
    hash.update(relative(dir, path) + "\0" + fileHash(path) + "\n");
  }
  return hash.digest("hex");
}
function exec(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    const hint = capture ? String(result.stderr ?? "").trim().slice(0, 300) : "";
    throw Error(command + " " + args.join(" ") + " FAILED" +
      (hint ? ": " + hint : "") + (result.error ? ": " + result.error.message : ""));
  }
  return capture ? String(result.stdout ?? "").trim() : "";
}
function git(...args) { return exec("git", args, true); }
function checkRepo() {
  if (resolve(git("rev-parse", "--show-toplevel")) !== ROOT) {
    throw Error("Not the HERO Git root");
  }
  if (!safeOrigin(git("remote", "get-url", "origin"))) {
    throw Error("origin must be the worldinyj/HERO repository");
  }
  if (git("branch", "--show-current") !== BRANCH) {
    throw Error("Switch to batch branch first: " + BRANCH);
  }
}
function checkClean() {
  const lines = git("status", "--porcelain", "--untracked-files=all")
    .split("\n").filter(Boolean)
    // This repository currently has no tracked lockfile. pnpm install may
    // create this single untracked file, but tracked changes still block.
    .filter((line) => line !== "?? pnpm-lock.yaml");
  if (lines.length) throw Error("Working tree has changes; preserve them first:\n" +
    lines.slice(0, 20).join("\n"));
}
function sha() { return git("rev-parse", "HEAD"); }
function checkSynced() {
  const tracking = git("rev-parse", "refs/remotes/origin/" + BRANCH);
  if (tracking !== sha()) {
    throw Error("Local HEAD differs from origin tracking branch. Run sync.");
  }
}
function prerequisite(program) {
  exec(program, ["--version"], true);
}
function option(name) {
  const prefix = "--" + name + "=";
  const found = process.argv.slice(3).find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}
function hasFlag(name) { return process.argv.slice(3).includes("--" + name); }
function describe(command, args) {
  console.log("\n==> " + [command, ...args].join(" "));
  // supabase status --output json contains local JWT secrets and service keys.
  // Verify the command succeeds but never print its credentials to QA logs.
  if (command === "supabase" && args[0] === "status") {
    exec(command, args, true);
    console.log("SUPABASE_LOCAL_STATUS_PASS (credentials hidden)");
    return;
  }
  exec(command, args);
}
function doctor() {
  checkRepo();
  console.log("Repository: worldinyj/HERO");
  console.log("Branch: " + BRANCH);
  console.log("HEAD: " + sha());
  console.log("node: " + process.version);
  for (const name of ["git", "pnpm", "supabase", "wrangler"]) {
    try { console.log(name + ": " + exec(name, ["--version"], true).split("\n")[0]); }
    catch { console.log(name + ": NOT INSTALLED"); }
  }
  console.log("Local QA evidence: " + (existsSync(EVIDENCE) ? "present" : "absent"));
  console.log("No deployment or remote database command was run.");
}
function sync() {
  checkRepo();
  checkClean();
  describe("git", ["fetch", "origin", "--prune"]);
  describe("git", ["merge", "--ff-only", "origin/" + BRANCH]);
  console.log("SYNC_PASS: " + sha());
}
function qa() {
  checkRepo();
  checkClean();
  checkSynced();
  prerequisite("pnpm");
  if (!existsSync(join(ROOT, "node_modules"))) {
    throw Error("Missing dependencies: run pnpm install --no-frozen-lockfile first");
  }
  const withDb = hasFlag("with-db");
  mkdirSync(dirname(EVIDENCE), { recursive: true });
  // A failed or interrupted QA must never leave earlier green evidence.
  writeFileSync(EVIDENCE, "", { mode: 0o600 });
  const steps = [
    ["node", ["--test", "scripts/hero-local.test.mjs"]],
    ["pnpm", ["lint"]],
    ["pnpm", ["typecheck"]],
    ["pnpm", ["check:tasklist-progress"]],
    ["pnpm", ["check:batch-db-contracts"]],
    ["pnpm", ["test"]],
    ["pnpm", ["build"]],
    ["pnpm", ["exec", "playwright", "test",
      "e2e/atomic-indexeddb-submission.spec.ts", "--project=mobile-390x844"]],
  ];
  if (withDb) {
    prerequisite("supabase");
    // Both commands target the local stack, NEVER a linked remote project.
    steps.push(["supabase", ["status", "--output", "json"]]);
    steps.push(["supabase", ["test", "db", "--local"]]);
  }
  for (const [command, args] of steps) describe(command, args);
  checkClean();
  checkSynced();
  const result = {
    version: 1,
    branch: BRANCH,
    sha: sha(),
    passedAt: new Date().toISOString(),
    withDb,
    distHash: treeHash(DIST),
    envHash: existsSync(PREVIEW_ENV) ? fileHash(PREVIEW_ENV) : null,
    passedCommands: steps.map(([command, args]) => [command, ...args].join(" ")),
  };
  writeFileSync(EVIDENCE, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("\nLOCAL_QA_PASS sha=" + result.sha +
    " db=" + (withDb ? "tested" : "NOT_RUN"));
  if (!withDb) console.log("Preview deployment requires a new qa --with-db run.");
}
function preview() {
  checkRepo();
  checkClean();
  checkSynced();
  if (!hasFlag("confirm-preview")) throw Error("Missing --confirm-preview");
  const project = option("project");
  const branch = option("preview-branch");
  if (project !== PAGES_PROJECT || !safePreviewBranch(branch ?? "")) {
    throw Error("Only confirmed Pages project " + PAGES_PROJECT +
      " with --preview-branch=qa-<name> is allowed");
  }
  if (!existsSync(PREVIEW_ENV)) {
    throw Error("Create ignored apps/web/.env.production.local BEFORE local QA");
  }
  if (!existsSync(EVIDENCE)) throw Error("Run qa --with-db first");
  let record;
  try { record = JSON.parse(readFileSync(EVIDENCE, "utf8")); }
  catch { throw Error("No valid local QA evidence: rerun qa --with-db"); }
  const expected = { sha: sha(), envHash: fileHash(PREVIEW_ENV),
    distHash: treeHash(DIST) };
  if (!isValidEvidence(record, expected)) {
    throw Error("QA is stale, not DB-tested, or build/env differs. Rerun qa --with-db.");
  }
  // Check the actual preview URL's public frontend config and legal origins.
  const appUrl = previewAppUrl(branch);
  describe("node", ["scripts/check-deployment-preflight.mjs",
    "--env-file=apps/web/.env.production.local",
    "--app-url=" + appUrl, "--strict"]);
  prerequisite("wrangler");
  console.log("Deploying PREVIEW ONLY to " + appUrl + " at " + sha());
  describe("wrangler", ["pages", "deploy", "apps/web/dist",
    "--project-name=" + project, "--branch=" + branch]);
  console.log("PREVIEW_UPLOAD_DONE " + appUrl);
  console.log("Verify preview via: node scripts/hero-local.mjs smoke --url=" + appUrl);
}
function smoke() {
  checkRepo();
  const url = option("url");
  if (!url) throw Error("Provide --url=https://qa-local." + PAGES_DOMAIN);
  if (!safePreviewOrigin(url)) {
    throw Error("Smoke checks accept only HTTPS qa-*." + PAGES_DOMAIN +
      " preview origins (no path, query, port or credentials)");
  }
  const parsed = new URL(url);
  describe("node", ["scripts/check-staging-http.mjs",
    "--app-url=" + parsed.origin, "--strict"]);
}
function main() {
  const command = process.argv[2] ?? "doctor";
  switch (command) {
    case "doctor": doctor(); break;
    case "sync": sync(); break;
    case "qa": qa(); break;
    case "preview": preview(); break;
    case "smoke": smoke(); break;
    default: throw Error("Usage: node scripts/hero-local.mjs doctor|sync|qa|preview|smoke");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error("HERO_LOCAL_FAIL: " + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
