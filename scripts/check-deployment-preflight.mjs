import {
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  console.error(`DEPLOYMENT_PREFLIGHT_FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const value = (prefix) =>
    argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;

  return {
    envFile: value("--env-file="),
    appUrl: value("--app-url="),
    live: argv.includes("--live"),
    strict: argv.includes("--strict"),
    json: argv.includes("--json"),
    selfTest: argv.includes("--self-test"),
  };
}

function parseEnv(content) {
  const out = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function readEnvFile(path) {
  if (!path) return {};
  const absolute = resolve(process.cwd(), path);
  if (!existsSync(absolute)) {
    fail(`env file does not exist: ${path}`);
  }
  return parseEnv(readFileSync(absolute, "utf8"));
}

function validUrl(value, { httpsRequired = false } = {}) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (httpsRequired && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function looksPlaceholder(value) {
  return (
    !value ||
    /^(changeme|example|placeholder|todo|your[_-]?|<.*>)$/iu.test(value) ||
    /YOUR_|PROJECT_REF|KAKAO_KEY|SUPABASE_KEY/iu.test(value)
  );
}

function classifySupabaseKey(value) {
  if (looksPlaceholder(value)) {
    return { ok: false, kind: "missing_or_placeholder" };
  }

  if (
    /service[_-]?role/iu.test(value) ||
    /^sb_secret_/u.test(value) ||
    /SUPABASE_SERVICE_ROLE_KEY/u.test(value)
  ) {
    return { ok: false, kind: "secret_key_forbidden" };
  }

  if (/^sb_publishable_/u.test(value)) {
    return { ok: true, kind: "publishable_key" };
  }

  if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)) {
    return { ok: true, kind: "legacy_anon_jwt" };
  }

  return { ok: true, kind: "unrecognized_public_key_format" };
}

function checkStaticRepoContract(root) {
  const required = [
    "apps/web/.env.example",
    "apps/web/public/_headers",
    "apps/web/public/manifest.webmanifest",
    "apps/web/src/lib/supabase.ts",
    "apps/web/src/lib/kakaoShare.ts",
    "docs/09_DEPLOYMENT_BOOTSTRAP.md",
  ];

  const checks = required.map((path) => ({
    id: `file:${path}`,
    status: existsSync(resolve(root, path)) ? "pass" : "blocked",
    detail: existsSync(resolve(root, path))
      ? "present"
      : "required deployment file is missing",
  }));

  const envExample = resolve(root, "apps/web/.env.example");
  if (existsSync(envExample)) {
    const parsed = parseEnv(readFileSync(envExample, "utf8"));
    for (const key of [
      "VITE_SUPABASE_URL",
      "VITE_SUPABASE_ANON_KEY",
      "VITE_KAKAO_JS_KEY",
    ]) {
      checks.push({
        id: `env-example:${key}`,
        status: Object.hasOwn(parsed, key) ? "pass" : "blocked",
        detail: Object.hasOwn(parsed, key)
          ? "declared"
          : "missing from apps/web/.env.example",
      });
    }
  }

  return checks;
}

function buildConfigChecks(config) {
  const checks = [];

  const appUrl = validUrl(config.appUrl ?? "", { httpsRequired: true });
  checks.push({
    id: "app_url",
    status: appUrl ? "pass" : "blocked",
    detail: appUrl
      ? appUrl.origin
      : "Provide --app-url=https://<staging-or-production-domain>",
  });

  const supabaseUrl = validUrl(config.VITE_SUPABASE_URL ?? "", {
    httpsRequired: true,
  });
  checks.push({
    id: "supabase_url",
    status: supabaseUrl ? "pass" : "blocked",
    detail: supabaseUrl
      ? supabaseUrl.origin
      : "VITE_SUPABASE_URL must be a valid HTTPS project URL",
  });

  const keyCheck = classifySupabaseKey(config.VITE_SUPABASE_ANON_KEY ?? "");
  checks.push({
    id: "supabase_client_key",
    status: keyCheck.ok ? "pass" : "blocked",
    detail: keyCheck.kind,
  });

  const kakaoKey = String(config.VITE_KAKAO_JS_KEY ?? "").trim();
  checks.push({
    id: "kakao_js_key",
    status: looksPlaceholder(kakaoKey) ? "blocked" : "pass",
    detail: looksPlaceholder(kakaoKey)
      ? "VITE_KAKAO_JS_KEY is missing or placeholder"
      : "client-visible JavaScript key is present",
  });

  if (kakaoKey && /\s/u.test(kakaoKey)) {
    checks.push({
      id: "kakao_js_key_whitespace",
      status: "blocked",
      detail: "Kakao JavaScript key must not contain whitespace",
    });
  }

  const derived =
    appUrl && supabaseUrl
      ? {
          appOrigin: appUrl.origin,
          kakaoJavaScriptSdkDomain: appUrl.origin,
          kakaoProductLinkWebDomain: appUrl.origin,
          kakaoRestApiRedirectUri: `${supabaseUrl.origin}/auth/v1/callback`,
          supabaseSiteUrl: appUrl.origin,
          supabaseRedirectAllowPattern: `${appUrl.origin}/**`,
        }
      : null;

  return { checks, derived };
}

async function liveCheck(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      ...options,
    });

    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
    };
  } catch (cause) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      error: cause instanceof Error ? cause.message : "network_error",
    };
  }
}

async function runSelfTest() {
  const good = buildConfigChecks({
    appUrl: "https://hero.example.com",
    VITE_SUPABASE_URL: "https://abc123.supabase.co",
    VITE_SUPABASE_ANON_KEY:
      "sb_publishable_0123456789abcdefghijklmnopqrstuvwxyz",
    VITE_KAKAO_JS_KEY: "0123456789abcdef0123456789abcdef",
  });

  if (good.checks.some((check) => check.status === "blocked")) {
    fail("self-test good fixture unexpectedly blocked");
  }

  if (
    good.derived?.kakaoRestApiRedirectUri !==
    "https://abc123.supabase.co/auth/v1/callback"
  ) {
    fail("self-test callback derivation failed");
  }

  const bad = buildConfigChecks({
    appUrl: "http://hero.example.com",
    VITE_SUPABASE_URL: "https://abc123.supabase.co",
    VITE_SUPABASE_ANON_KEY: "sb_secret_do_not_ship",
    VITE_KAKAO_JS_KEY: "",
  });

  const blockedIds = new Set(
    bad.checks
      .filter((check) => check.status === "blocked")
      .map((check) => check.id),
  );

  for (const id of ["app_url", "supabase_client_key", "kakao_js_key"]) {
    if (!blockedIds.has(id)) {
      fail(`self-test expected blocked check: ${id}`);
    }
  }

  console.log("DEPLOYMENT_PREFLIGHT_SELF_TEST_PASS");
}

const options = parseArgs(process.argv.slice(2));

if (options.selfTest) {
  await runSelfTest();
  process.exit(0);
}

const root = process.cwd();
const fileEnv = readEnvFile(options.envFile);
const config = {
  ...fileEnv,
  appUrl: options.appUrl ?? fileEnv.HERO_APP_URL ?? process.env.HERO_APP_URL,
  VITE_SUPABASE_URL:
    fileEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY:
    fileEnv.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
  VITE_KAKAO_JS_KEY:
    fileEnv.VITE_KAKAO_JS_KEY ?? process.env.VITE_KAKAO_JS_KEY,
};

const staticChecks = checkStaticRepoContract(root);
const { checks: configChecks, derived } = buildConfigChecks(config);
const checks = [...staticChecks, ...configChecks];

if (options.live && derived) {
  const app = await liveCheck(derived.appOrigin);
  checks.push({
    id: "live_app",
    status: app.ok ? "pass" : "blocked",
    detail: app.ok
      ? `HTTP ${app.status} ${app.finalUrl}`
      : `app probe failed: ${app.status ?? "network"} ${app.error ?? ""}`.trim(),
  });

  const supabaseHealth = await liveCheck(
    `${new URL(config.VITE_SUPABASE_URL).origin}/auth/v1/health`,
    {
      headers: {
        apikey: String(config.VITE_SUPABASE_ANON_KEY ?? ""),
        Authorization: `Bearer ${String(config.VITE_SUPABASE_ANON_KEY ?? "")}`,
      },
    },
  );

  checks.push({
    id: "live_supabase_auth",
    status: supabaseHealth.ok ? "pass" : "blocked",
    detail: supabaseHealth.ok
      ? `HTTP ${supabaseHealth.status}`
      : `Supabase Auth health probe failed: ${supabaseHealth.status ?? "network"} ${supabaseHealth.error ?? ""}`.trim(),
  });
}

const blocked = checks.filter((check) => check.status === "blocked");
const report = {
  verdict: blocked.length === 0 ? "ready_for_external_smoke" : "configuration_incomplete",
  envFile: options.envFile,
  live: options.live,
  checks,
  derived,
};

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("HERO deployment preflight");
  console.log("=========================");
  console.log(`verdict: ${report.verdict}`);
  console.log("");

  for (const check of checks) {
    console.log(
      `[${check.status.toUpperCase()}] ${check.id} — ${check.detail}`,
    );
  }

  if (derived) {
    console.log("");
    console.log("Register / verify these values:");
    console.log(
      `- Kakao JavaScript SDK domain: ${derived.kakaoJavaScriptSdkDomain}`,
    );
    console.log(
      `- Kakao Product Link Web domain: ${derived.kakaoProductLinkWebDomain}`,
    );
    console.log(
      `- Kakao REST API Redirect URI for Supabase: ${derived.kakaoRestApiRedirectUri}`,
    );
    console.log(`- Supabase Site URL: ${derived.supabaseSiteUrl}`);
    console.log(
      `- Supabase Redirect allow-list: ${derived.supabaseRedirectAllowPattern}`,
    );
  }
}

if (options.strict && blocked.length > 0) {
  process.exitCode = 2;
}
