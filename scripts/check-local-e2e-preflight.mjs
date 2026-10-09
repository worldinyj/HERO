#!/usr/bin/env node
// Local HERO E2E preflight: default read-only; --prepare-web-env is create-only.
// Never show supabase CLI status, credentials, or server-role keys in logs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_ENV = join(ROOT, "apps/web/.env.e2e.local");
export const E2E_API = "http://127.0.0.1:55321";

export function inspectE2eStatus(status) {
  if (!status || status.API_URL !== E2E_API) {
    return { ok: false, code: "api_not_hero_local" };
  }
  let db;
  try { db = new URL(status.DB_URL); }
  catch { return { ok: false, code: "db_address_missing" }; }
  if (!["postgresql:", "postgres:"].includes(db.protocol) ||
    db.hostname !== "127.0.0.1" || db.port !== "55322" ||
    db.pathname !== "/postgres" || db.search || db.hash) {
    return { ok: false, code: "db_not_hero_local" };
  }
  if (typeof status.ANON_KEY !== "string" || !status.ANON_KEY.trim() ||
      typeof status.SERVICE_ROLE_KEY !== "string" ||
      !status.SERVICE_ROLE_KEY.trim()) {
    return { ok: false, code: "local_supabase_credentials_missing" };
  }
  return { ok: true, code: "hero_local_supabase_ready" };
}

export function buildE2eWebEnv(status) {
  if (!inspectE2eStatus(status).ok) throw Error("unsafe_status");
  if (/[\r\n]/.test(status.API_URL + status.ANON_KEY)) {
    throw Error("invalid_web_env_value");
  }
  return [
    "# HERO ignored E2E browser config. Do not commit.",
    "VITE_SUPABASE_URL=" + status.API_URL,
    "VITE_SUPABASE_ANON_KEY=" + status.ANON_KEY,
    "VITE_E2E_MODE=true",
    "",
  ].join("\n");
}

export function inspectE2eWebEnv(content, status) {
  if (typeof content !== "string") {
    return { ok: false, code: "web_env_missing" };
  }
  const vars = new Map();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const pos = line.indexOf("=");
    if (pos < 1) return { ok: false, code: "web_env_invalid" };
    const name = line.slice(0, pos).trim();
    if (!/^[A-Za-z_]\w*$/.test(name) || vars.has(name)) {
      return { ok: false, code: "web_env_duplicate_or_invalid_name" };
    }
    if (/(SERVICE_ROLE|SECRET_KEY|SB_SECRET)/i.test(name)) {
      return { ok: false, code: "web_env_server_secret_forbidden" };
    }
    let value = line.slice(pos + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    vars.set(name, value);
  }
  if (vars.get("VITE_SUPABASE_URL") !== E2E_API ||
      vars.get("VITE_SUPABASE_URL") !== status?.API_URL) {
    return { ok: false, code: "web_api_not_hero_local" };
  }
  if (!status?.ANON_KEY ||
      vars.get("VITE_SUPABASE_ANON_KEY") !== status.ANON_KEY) {
    return { ok: false, code: "web_anon_key_mismatch" };
  }
  if (vars.get("VITE_E2E_MODE") !== "true") {
    return { ok: false, code: "web_e2e_mode_not_enabled" };
  }
  return { ok: true, code: "hero_local_web_ready" };
}

function main() {
  const options = process.argv.slice(2);
  if (options.length > 1 ||
      (options.length === 1 && options[0] !== "--prepare-web-env")) {
    throw Error("usage: check-local-e2e-preflight.mjs [--prepare-web-env]");
  }
  const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
  if (!/^project_id = "hero"$/m.test(config) ||
      !/^\[api\]\s*\nport = 55321$/m.test(config) ||
      !/^\[db\]\s*\nport = 55322$/m.test(config)) {
    throw Error("E2E_PREFLIGHT_BLOCKED hero_local_config_mismatch");
  }
  const cli = spawnSync("supabase", ["status", "--output", "json"],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (cli.error || cli.status !== 0) {
    throw Error("E2E_PREFLIGHT_BLOCKED hero_local_supabase_unavailable");
  }
  let status;
  try { status = JSON.parse(cli.stdout); }
  catch { throw Error("E2E_PREFLIGHT_BLOCKED local_cli_status_invalid"); }
  const result = inspectE2eStatus(status);
  if (!result.ok) throw Error("E2E_PREFLIGHT_BLOCKED " + result.code);
  if (options.includes("--prepare-web-env")) {
    try {
      writeFileSync(WEB_ENV, buildE2eWebEnv(status),
        { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (err) {
      if (err?.code === "EEXIST") {
        throw Error("E2E_PREFLIGHT_BLOCKED web_env_exists_no_overwrite");
      }
      throw Error("E2E_PREFLIGHT_BLOCKED web_env_write_failed");
    }
    console.log("HERO_E2E_WEB_ENV_CREATED (keys hidden)");
  }
  const env = existsSync(WEB_ENV) ? readFileSync(WEB_ENV, "utf8") : null;
  const web = inspectE2eWebEnv(env, status);
  if (!web.ok) throw Error("E2E_PREFLIGHT_BLOCKED " + web.code);
  console.log("HERO_E2E_PREFLIGHT_PASS api=127.0.0.1:55321 db=127.0.0.1:55322");
  console.log("fixtures=NOT_CREATED edge_http=NOT_CHECKED external_writes=NONE");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (e) {
    console.error(e instanceof Error ? e.message : "E2E_PREFLIGHT_BLOCKED");
    process.exitCode = 1;
  }
}
