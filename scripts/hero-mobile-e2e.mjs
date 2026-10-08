#!/usr/bin/env node
/**
 * HERO local full-mobile E2E gate.
 *
 * edge-check  : read-only local environment and Edge HTTP check.
 * run --confirm-local-fixture-seed : create local E2E fixtures exactly once,
 * then run both real mobile journeys. Never resets or touches hosted data.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { E2E_API, inspectE2eStatus, inspectE2eWebEnv } from "./check-local-e2e-preflight.mjs";
import { BRANCH, EVIDENCE, ROOT, fileHash, treeHash, isValidEvidence,
  safeOrigin } from "./hero-local.mjs";

export const E2E_WEB_ORIGIN = "http://127.0.0.1:4173";
export const E2E_EDGE_URL = E2E_API + "/functions/v1/peek-invite";
const WEB_ENV_PATH = join(ROOT, "apps/web/.env.e2e.local");
const RELEASE_ENV_PATH = join(ROOT, "apps/web/.env.production.local");
const DIST_PATH = join(ROOT, "apps/web/dist");

/**
 * Local Supabase's API gateway may return '*' although the function's
 * corsHeaders() returns the requested origin. This is NOT an authorization
 * for production wildcard CORS. Callers must separately verify loopback API.
 */
export function edgeProbeVerdict(status, json, origin, { localLoopback = false } = {}) {
  if (status !== 400 || !json || json.error !== "invalid_token") {
    return { ok: false, reason: "edge_handler_not_verified" };
  }
  if (origin === E2E_WEB_ORIGIN) {
    return { ok: true, reason: "local_edge_exact_origin_verified" };
  }
  if (origin === "*" && localLoopback) {
    return { ok: true, reason: "local_edge_gateway_wildcard_observed" };
  }
  return { ok: false, reason: "edge_cors_site_url_mismatch" };
}

/** Confirm real browser CORS preflight without accepting wildcard credentials. */
export function edgeOptionsVerdict(status, origin, methods, headers, credentials,
  { localLoopback = false } = {}) {
  if (status !== 200 && status !== 204) {
    return { ok: false, reason: "edge_cors_options_failed" };
  }
  if (origin !== E2E_WEB_ORIGIN && !(localLoopback && origin === "*")) {
    return { ok: false, reason: "edge_cors_options_origin_mismatch" };
  }
  if (origin === "*" && String(credentials).toLowerCase() === "true") {
    return { ok: false, reason: "edge_cors_wildcard_credentials_forbidden" };
  }
  const methodNames = String(methods || "").split(",").map(x => x.trim().toLowerCase());
  const headerNames = new Set(String(headers || "")
    .split(",").map(x => x.trim().toLowerCase()));
  if (!methodNames.includes("post")) {
    return { ok: false, reason: "edge_cors_post_not_allowed" };
  }
  if (!["authorization", "apikey", "content-type", "x-client-info"]
    .every(x => headerNames.has(x))) {
    return { ok: false, reason: "edge_cors_required_headers_missing" };
  }
  return { ok: true, reason: origin === "*"
    ? "local_edge_options_wildcard_verified"
    : "local_edge_options_exact_verified" };
}

export function e2eArgsVerdict(args) {
  if (args.length === 1 && args[0] === "edge-check") {
    return { ok: true, run: false };
  }
  if (args.length === 2 && args[0] === "run" &&
      args[1] === "--confirm-local-fixture-seed") {
    return { ok: true, run: true };
  }
  return { ok: false, reason: "usage_edge_check_or_explicit_local_run" };
}

/** Strip inherited browser config and all server-role secrets from Playwright. */
export function browserTestEnv(source, status, passwords) {
  const output = { ...source };
  for (const name of Object.keys(output)) {
    if (name.startsWith("VITE_") || name === "SERVICE_ROLE_KEY" ||
        name === "SUPABASE_SERVICE_ROLE_KEY" ||
        name === "SUPABASE_DB_PASSWORD" || name === "DATABASE_URL") {
      delete output[name];
    }
  }
  output.VITE_SUPABASE_URL = E2E_API;
  output.VITE_SUPABASE_ANON_KEY = status.ANON_KEY;
  output.VITE_E2E_MODE = "true";
  output.HERO_LOCAL_FULL_E2E = "1";
  output.HERO_E2E_PASSWORD_A = passwords.a;
  output.HERO_E2E_PASSWORD_B = passwords.b;
  output.HERO_E2E_PASSWORD_MANAGER = passwords.manager;
  return output;
}

function command(cmd, args, { env = process.env, capture = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT, env, encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 1024 * 1024 * 10,
  });
  // Caller may print only our fixed reason codes: CLI output could contain JWTs.
  if (result.error || result.status !== 0) {
    throw Error("local_command_failed: " + cmd + " (" + args[0] + ")");
  }
  return capture ? result.stdout.trim() : "";
}

function assertGitAndFreshQa() {
  if (resolve(command("git", ["rev-parse", "--show-toplevel"],
    { capture: true })) !== ROOT) throw Error("wrong_repo");
  if (!safeOrigin(command("git", ["remote", "get-url", "origin"],
    { capture: true }))) throw Error("wrong_origin");
  if (command("git", ["branch", "--show-current"],
    { capture: true }) !== BRANCH) throw Error("wrong_branch");
  const head = command("git", ["rev-parse", "HEAD"], { capture: true });
  const remote = command("git", ["rev-parse", "refs/remotes/origin/" + BRANCH],
    { capture: true });
  if (head !== remote) throw Error("branch_not_synced");
  const dirty = command("git", ["status", "--porcelain", "--untracked-files=all"],
    { capture: true }).split("\n").filter(x => x && x !== "?? pnpm-lock.yaml");
  if (dirty.length) throw Error("dirty_worktree");
  let evidence;
  try { evidence = JSON.parse(readFileSync(EVIDENCE, "utf8")); }
  catch { throw Error("same_commit_qa_required"); }
  const expected = {
    sha: head,
    distHash: treeHash(DIST_PATH),
    envHash: existsSync(RELEASE_ENV_PATH) ? fileHash(RELEASE_ENV_PATH) : null,
  };
  if (!isValidEvidence(evidence, expected) || !evidence.deep ||
      !evidence.withDeno) {
    throw Error("fresh_deep_deno_db_qa_required");
  }
}

function localStatus() {
  // The full preflight also checks supabase/config.toml. Never print CLI status.
  command("node", ["scripts/check-local-e2e-preflight.mjs"]);
  let status;
  try {
    status = JSON.parse(command("supabase", ["status", "--output", "json"],
      { capture: true }));
  } catch {
    throw Error("local_supabase_status_unavailable");
  }
  if (!inspectE2eStatus(status).ok) throw Error("not_hero_local_supabase");
  if (!existsSync(WEB_ENV_PATH) ||
      !inspectE2eWebEnv(readFileSync(WEB_ENV_PATH, "utf8"), status).ok) {
    throw Error("unsafe_local_web_e2e_env");
  }
  return status;
}

async function checkEdge() {
  let response, payload;
  try {
    response = await fetch(E2E_EDGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: E2E_WEB_ORIGIN,
      },
      body: JSON.stringify({ token: "short" }),
      signal: AbortSignal.timeout(5000),
    });
    payload = await response.json();
  } catch {
    throw Error("edge_unreachable_start_supabase_functions_serve");
  }
  // localStatus() already verified this exact API resolves only to the HERO
  // loopback stack; allow '*' for that local gateway, never remote deploys.
  const verdict = edgeProbeVerdict(response.status, payload,
    response.headers.get("access-control-allow-origin"),
    { localLoopback: true });
  if (!verdict.ok) throw Error(verdict.reason);

  let optionsResponse;
  try {
    optionsResponse = await fetch(E2E_EDGE_URL, {
      method: "OPTIONS",
      headers: {
        origin: E2E_WEB_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "authorization,apikey,content-type,x-client-info",
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw Error("edge_cors_options_unreachable");
  }
  const optionsVerdict = edgeOptionsVerdict(optionsResponse.status,
    optionsResponse.headers.get("access-control-allow-origin"),
    optionsResponse.headers.get("access-control-allow-methods"),
    optionsResponse.headers.get("access-control-allow-headers"),
    optionsResponse.headers.get("access-control-allow-credentials"),
    { localLoopback: true });
  if (!optionsVerdict.ok) throw Error(optionsVerdict.reason);

  console.log("HERO_EDGE_CHECK_PASS invalid_token=400 cors=" +
    (verdict.reason === "local_edge_gateway_wildcard_observed"
      ? "wildcard-local" : "exact-origin") + " options=PASS");
  if (verdict.reason === "local_edge_gateway_wildcard_observed") {
    console.log("EDGE_CORS_NOTE local_wildcard_observed (NOT production approval)");
  }
  console.log("fixture_seed=NOT_RUN requests_write=NONE");
}

async function assertWebPortAvailable() {
  // Reject a running Vite server before fixture seeding. Never reuse a
  // browser server with unknown Supabase targets.
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(Error("vite_port_4173_unavailable")));
    server.listen(4173, "127.0.0.1", () => {
      server.close((error) => error
        ? reject(Error("vite_port_4173_close_failed")) : resolve());
    });
  });
}

async function main() {
  const parsed = e2eArgsVerdict(process.argv.slice(2));
  if (!parsed.ok) throw Error(parsed.reason);
  const status = localStatus();
  await checkEdge();
  if (!parsed.run) return;
  assertGitAndFreshQa();
  await assertWebPortAvailable();
  const passwords = {
    a: "hero-e2e-" + randomBytes(24).toString("hex"),
    b: "hero-e2e-" + randomBytes(24).toString("hex"),
    manager: "hero-e2e-" + randomBytes(24).toString("hex"),
  };
  const seedEnv = {
    ...process.env,
    API_URL: E2E_API,
    SUPABASE_URL: E2E_API,
    SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    HERO_E2E_ALLOW_FIXTURE_SEED: "1",
    HERO_E2E_PASSWORD_A: passwords.a,
    HERO_E2E_PASSWORD_B: passwords.b,
    HERO_E2E_PASSWORD_MANAGER: passwords.manager,
  };
  // The fixture seed itself checks fixed UUID/email/season collisions BEFORE
  // the first database write; it never reuses, resets or deletes local data.
  console.log("HERO_LOCAL_FIXTURE_SEED_START (no DB reset, local API only)");
  command("pnpm", ["e2e:setup"], { env: seedEnv });
  console.log("HERO_LOCAL_FIXTURE_SEED_PASS");
  const testEnv = browserTestEnv(process.env, status, passwords);
  console.log("HERO_MOBILE_E2E_START projects=390x844,360x800 workers=1");
  command("pnpm", ["exec", "playwright", "test",
    "e2e/invite-play-leaderboard.spec.ts",
    "--project=mobile-390x844", "--project=mobile-360x800",
    "--workers=1"], { env: testEnv });
  console.log("HERO_FULL_MOBILE_E2E_PASS (local only)");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    // Intentionally do not echo nested CLI stdout or stderr containing keys.
    console.error("HERO_MOBILE_E2E_FAIL: " +
      (error instanceof Error ? error.message : "unknown_failure"));
    console.error("No automatic fixture cleanup or DB reset. Inspect before retry.");
    process.exitCode = 1;
  });
}
