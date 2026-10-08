import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { HERO_E2E_LOCAL_API, localE2eSeedGate } from "../e2e/localTargetGuard.mjs";
import { assertFreshLocalE2eNamespace } from "../e2e/fixtureNamespace.mjs";
import { requireFixtureAuthUuidV4 } from "../e2e/authFixtureUuid.mjs";
import { E2E_API, inspectE2eStatus, inspectE2eWebEnv, buildE2eWebEnv } from "./check-local-e2e-preflight.mjs";
import { E2E_WEB_ORIGIN, edgeProbeVerdict, e2eArgsVerdict,
  browserTestEnv } from "./hero-mobile-e2e.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BRANCH, PAGES_PROJECT, PAGES_DOMAIN, safeOrigin,
  safePreviewBranch, safeProject, previewAppUrl, safePreviewOrigin,
  checkPreviewBackendEnv, qaSteps, isValidEvidence } from "./hero-local.mjs";

test("GitHub origin accepts the exact repo over HTTPS and SSH", () => {
  for (const remote of ["https://github.com/worldinyj/HERO.git",
    "git@github.com:worldinyj/HERO.git", "ssh://git@github.com/worldinyj/HERO"]) {
    assert.equal(safeOrigin(remote), true);
  }
  for (const remote of ["https://github.com/other/HERO",
    "https://evilgithub.com/worldinyj/HERO", "file:///tmp/worldinyj/HERO"]) {
    assert.equal(safeOrigin(remote), false);
  }
});
test("preview name requires qa- prefix and project slug", () => {
  for (const value of ["qa-local", "qa-hero-1"]) assert.equal(safePreviewBranch(value), true);
  for (const value of ["main", "master", "production", "prod", "release",
    "work/actions-paused-batch-20261008", "QA-local", "qa-../evil"]) {
    assert.equal(safePreviewBranch(value), false);
  }
  assert.equal(safeProject("hero"), true);
  assert.equal(safeProject("../prod"), false);
});
test("Cloudflare project slug and pages.dev domain are deliberately different", () => {
  assert.equal(PAGES_PROJECT, "hero");
  assert.equal(PAGES_DOMAIN, "hero-dnr.pages.dev");
  assert.equal(previewAppUrl("qa-local"), "https://qa-local.hero-dnr.pages.dev");
  assert.throws(() => previewAppUrl("main"), /Invalid preview branch/);
  for (const origin of [
    "https://qa-local.hero-dnr.pages.dev",
    "https://qa-local.hero-dnr.pages.dev/",
    "https://qa-build-1.hero-dnr.pages.dev",
  ]) assert.equal(safePreviewOrigin(origin), true, origin);
  for (const origin of [
    "https://hero-dnr.pages.dev",
    "https://qa-local.hero.pages.dev",
    "https://qa-local.attacker.pages.dev",
    "http://qa-local.hero-dnr.pages.dev",
    "https://qa-local.hero-dnr.pages.dev:444",
    "https://qa-local.hero-dnr.pages.dev/other",
    "https://qa-local.hero-dnr.pages.dev/?x=1",
    "https://qa-local.hero-dnr.pages.dev/#frag",
    "https://user:pass@qa-local.hero-dnr.pages.dev",
    "https://qa-local.hero-dnr.pages.dev.attacker.invalid",
  ]) assert.equal(safePreviewOrigin(origin), false, origin);
});


test("preview backend requires a new staging Supabase project, never an existing app", () => {
  const app = "https://qa-local.hero-dnr.pages.dev";
  const staging = "abcdefghijklmnopqrst";
  const compose = (ref, api, dest = app) =>
    "HERO_STAGING_SUPABASE_REF=" + ref + "\n" +
    "VITE_SUPABASE_URL=" + api + "\n" +
    "HERO_APP_URL=" + dest + "\n";
  const healthy = compose(staging, "https://" + staging + ".supabase.co");
  assert.deepEqual(checkPreviewBackendEnv(healthy, app),
    { ok: true, reason: "staging_target_isolated" });
  assert.equal(checkPreviewBackendEnv(
    healthy.replace("HERO_STAGING_SUPABASE_REF=", "HERO_STAGING_SUPABASE_REF=\n# "),
    app).ok, false);
  for (const ref of ["alhpooapiokyuxysdzzp", "puqfyyzhxeaumtzfbdwb"]) {
    assert.deepEqual(checkPreviewBackendEnv(
      compose(ref, "https://" + ref + ".supabase.co"), app),
      { ok: false, reason: "existing_supabase_project_forbidden" });
  }
  for (const api of [
    "https://alhpooapiokyuxysdzzp.supabase.co",
    "https://" + staging + ".supabase.co.evil.test",
    "http://" + staging + ".supabase.co",
    "https://" + staging + ".supabase.co/rest/v1",
    "https://" + staging + ".supabase.co?x=1",
    "https://user:pass@" + staging + ".supabase.co",
  ]) assert.equal(checkPreviewBackendEnv(compose(staging, api), app).ok, false, api);
  assert.deepEqual(checkPreviewBackendEnv(
    compose(staging, "https://" + staging + ".supabase.co", "https://hero-dnr.pages.dev"),
    app), { ok: false, reason: "preview_app_url_mismatch" });
  assert.equal(checkPreviewBackendEnv(healthy +
    "HERO_STAGING_SUPABASE_REF=" + staging + "\n", app).ok, false);
  assert.deepEqual(checkPreviewBackendEnv(
    "HERO_STAGING_SUPABASE_REF=\"abcdefghijklmnopqrst\"\n" +
    "VITE_SUPABASE_URL='https://abcdefghijklmnopqrst.supabase.co'\n" +
    "HERO_APP_URL=" + app + "\n", app),
    { ok: true, reason: "staging_target_isolated" });
});

test("preview evidence requires DB, exact SHA/env/dist, and recent success", () => {
  const now = Date.parse("2026-10-08T09:00:00.000Z");
  const expected = { sha: "1".repeat(40), envHash: "env-hash", distHash: "dist-hash" };
  const record = {
    version: 1, branch: BRANCH, sha: expected.sha, passedAt: new Date(now).toISOString(),
    withDb: true, envHash: expected.envHash, distHash: expected.distHash,
  };
  assert.equal(isValidEvidence(record, expected, now + 1000), true);
  assert.equal(isValidEvidence({ ...record, withDb: false }, expected, now), false);
  assert.equal(isValidEvidence({ ...record, sha: "2".repeat(40) }, expected, now), false);
  assert.equal(isValidEvidence({ ...record, envHash: "other" }, expected, now), false);
  assert.equal(isValidEvidence({ ...record, distHash: "other" }, expected, now), false);
  assert.equal(isValidEvidence(record, expected, now + 25 * 60 * 60 * 1000), false);
  assert.equal(isValidEvidence(record, expected, now - 1), false);
  assert.equal(isValidEvidence(null, expected, now), false);
});

// Supabase CLI creates this metadata after a local stack starts. It must
// never cause checkClean() to reject an otherwise clean QA run.
test("Supabase local CLI branch metadata is excluded by Git", () => {
  const actual = spawnSync("git", [
    "check-ignore", "--no-index", "--quiet", "--",
    "supabase/.branches/_current_branch",
  ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(actual.status, 0, actual.stderr || "Git must ignore Supabase CLI state");
});

test("deep QA adds local-only scenario, legal, and bundle secret checks", () => {
  const commands = (options) => qaSteps(options).map(([cmd, args]) =>
    [cmd, ...args].join(" "));
  const basic = commands({});
  const deep = commands({ deep: true });
  assert.ok(basic.includes("pnpm test"));
  assert.ok(basic.includes("pnpm build"));
  assert.ok(!basic.some(x => x.includes("check:legal-release")));
  for (const expected of [
    "pnpm check:source-evidence", "pnpm check:cause-traceability",
    "pnpm check:human-review-evidence", "pnpm check:approval-hash",
    "pnpm check:legal-release", "pnpm check:audio-manifest",
    "pnpm check:deployment-preflight -- --self-test",
    "node scripts/check-client-secrets.mjs",
    "node scripts/check-route-splitting.mjs",
  ]) assert.ok(deep.includes(expected), expected);
  assert.ok(deep.indexOf("node scripts/check-client-secrets.mjs") >
    deep.indexOf("pnpm build"));
  for (const forbidden of ["git push", "supabase db push", "supabase db reset",
    "wrangler pages deploy", "pnpm promote:scenario --", "--strict"]) {
    assert.equal(deep.some(command => command.includes(forbidden)), false,
      "deep QA must not mutate outside local test fixtures: " + forbidden);
  }
});

test("Deno and database test stages require their explicit options", () => {
  const basic = qaSteps({});
  assert.equal(basic.some(([name]) => name === "deno" || name === "supabase"), false);
  const complete = qaSteps({ withDb: true, deep: true, withDeno: true });
  const names = complete.map(([name]) => name);
  assert.equal(names.filter(name => name === "deno").length, 16);
  assert.deepEqual(complete.slice(-2), [
    ["supabase", ["status", "--output", "json"]],
    ["supabase", ["test", "db", "--local"]],
  ]);
  const denoCommands = complete.filter(([name]) => name === "deno");
  assert.ok(denoCommands.some(([, args]) => args.includes(
    "supabase/functions/_shared/submissionInput.test.ts")));
  assert.ok(denoCommands.some(([, args]) => args.includes(
    "supabase/functions/submit-session/index.ts")));
  assert.equal(names.includes("wrangler"), false);
});

test("E2E fixture seeding is explicitly local-only and requires opt-in", () => {
  const good = {
    HERO_E2E_ALLOW_FIXTURE_SEED: "1",
    API_URL: HERO_E2E_LOCAL_API,
    SERVICE_ROLE_KEY: "test-local-secret-never-published",
    HERO_E2E_PASSWORD_A: "e2e-password-aaaaaaaa",
    HERO_E2E_PASSWORD_B: "e2e-password-bbbbbbbb",
    HERO_E2E_PASSWORD_MANAGER: "e2e-password-manager",
  };
  assert.deepEqual(localE2eSeedGate(good),
    { ok: true, reason: "hero_local_seed_permitted" });
  for (const [field, value, errorCode] of [
    ["HERO_E2E_ALLOW_FIXTURE_SEED", undefined,
      "explicit_fixture_seed_confirmation_required"],
    ["API_URL", "https://alhpooapiokyuxysdzzp.supabase.co",
      "non_hero_local_supabase_target"],
    ["API_URL", "http://localhost:55321",
      "non_hero_local_supabase_target"],
    ["API_URL", "http://127.0.0.1:54321",
      "non_hero_local_supabase_target"],
    ["API_URL", "http://127.0.0.1:55321/rest/v1",
      "non_hero_local_supabase_target"],
    ["API_URL", "http://127.0.0.1:55321?override=1",
      "non_hero_local_supabase_target"],
    ["SERVICE_ROLE_KEY", undefined, "missing_local_service_role_key"],
    ["HERO_E2E_PASSWORD_A", "tiny", "missing_or_short_e2e_password"],
  ]) {
    const changed = { ...good, [field]: value };
    assert.equal(localE2eSeedGate(changed).reason, errorCode,
      field + "=" + String(value));
  }
  assert.equal(localE2eSeedGate({ ...good, SUPABASE_URL:
    "https://alhpooapiokyuxysdzzp.supabase.co" }).reason,
    "missing_or_conflicting_supabase_url");
  assert.equal(localE2eSeedGate({ ...good, SUPABASE_SERVICE_ROLE_KEY:
    "other-key" }).reason, "conflicting_service_role_keys");
  assert.equal(localE2eSeedGate({ ...good, HERO_E2E_PASSWORD_B:
    good.HERO_E2E_PASSWORD_A }).reason, "non_unique_e2e_passwords");
});

test("E2E CI artifact collection must never archive Supabase credential dumps", () => {
  const content = readFileSync(new URL("../.github/workflows/e2e.yml",
    import.meta.url), "utf8");
  assert.ok(content.includes('HERO_E2E_ALLOW_FIXTURE_SEED: "1"'));
  assert.ok(!content.includes("cat /tmp/hero-supabase.env"));
  assert.ok(!content.includes("cp /tmp/hero-supabase.json "));
  assert.ok(!content.includes("hero-supabase-status.json"));
});

test("Deno local lockfile outputs do not block final QA Git clean check", () => {
  const expected = [
    "supabase/functions/deno.lock",
    "supabase/functions/submit-session/deno.lock",
    "supabase/functions/admin-scenario/deno.lock",
  ];
  for (const path of expected) {
    const result = spawnSync("git", [
      "check-ignore", "--no-index", "--quiet", "--", path,
    ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.equal(result.status, 0,
      path + ": Deno-generated lockfile must be Git-ignored");
  }
  // Other dependency lockfiles should not become silently ignored.
  for (const path of [
    "supabase/functions/create-invite/deno.lock",
    "supabase/deno.lock",
    "docs/deno.lock",
  ]) {
    const result = spawnSync("git", [
      "check-ignore", "--no-index", "--quiet", "--", path,
    ], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
    assert.equal(result.status, 1,
      path + ": scope Deno ignoring to the three known QA outputs");
  }
});

test("E2E fixture namespace checks existing accounts and rows before writes", async () => {
  const scope = {
    ids: { plant:"plant1", manager:"u1", inviteA:"i1", inviteB:"i2",
      scenario:"s1", version:"v1" },
    authIds:["u1", "u2"], emails:["first@example.test"],
    scenarioSlug:"e2e_competitive",
  };
  const calls = [];
  function mock({ authUsers = [], collision = null, readError = null,
    authError = null, total = null } = {}) {
    return {
      auth:{admin:{listUsers:async()=>{
        calls.push("listUsers");
        return {data:{users:authUsers,total},error:authError};
      }}},
      from(table) {
        return {select(){
          const answer=async()=>{
            calls.push(table);
            return {data:collision===table?[{id:"existing"}]:[],
              error:readError===table?{message:"read error"}:null};
          };
          return {in(){return{limit:answer}},eq(){return{limit:answer}}};
        }};
      },
    };
  }
  assert.deepEqual(await assertFreshLocalE2eNamespace(mock(),scope),
    {ok:true,reason:"fresh_hero_local_fixture_namespace"});
  assert.equal(calls[0],"listUsers");
  assert.ok(calls.includes("seasons"));
  for(const users of [
    [{id:"u1",email:"other@example.test"}],
    [{id:"no-collision",email:"FIRST@example.test"}],
  ]) {
    await assert.rejects(
      ()=>assertFreshLocalE2eNamespace(mock({authUsers:users}),scope),
      /auth_fixture_already_exists/);
  }
  for(const table of ["plants","profiles","invitations","scenarios",
    "scenario_versions","seasons"]) {
    await assert.rejects(
      ()=>assertFreshLocalE2eNamespace(mock({collision:table}),scope),
      /fixture_already_exists/);
    await assert.rejects(
      ()=>assertFreshLocalE2eNamespace(mock({readError:table}),scope),
      /lookup_failed/);
  }
  await assert.rejects(
    ()=>assertFreshLocalE2eNamespace(mock({authError:{message:"fail"}}),scope),
    /auth_lookup_failed/);
  await assert.rejects(
    ()=>assertFreshLocalE2eNamespace(mock({total:1001}),scope),
    /auth_inventory_incomplete/);
});

test("E2E setup has safe fixture guard and never reuses monthly season", () => {
  const source=readFileSync(new URL("../e2e/setup-local.ts",
    import.meta.url),"utf8");
  const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  assert.equal(pkg.scripts["e2e:setup"],"tsx e2e/setup-local.ts");
  assert.ok(source.indexOf("await assertFreshLocalE2eNamespace")>0);
  assert.ok(source.indexOf("await assertFreshLocalE2eNamespace")<
    source.indexOf("await createUser({"));
  assert.ok(source.includes("season_key: HERO_E2E_SEASON_KEY"));
  assert.ok(!source.includes('from("seasons")\n  .select("id")\n  .eq("status", "open")'));
});

test("HERO E2E local preflight validates API/DB and browser public config only", () => {
  const st = {
    API_URL: E2E_API,
    DB_URL: "postgresql://postgres:local@127.0.0.1:55322/postgres",
    ANON_KEY: "test-local-anon-key",
    SERVICE_ROLE_KEY: "test-only-server-key",
  };
  assert.equal(inspectE2eStatus(st).ok, true);
  assert.equal(inspectE2eStatus({ ...st,
    API_URL: "https://alhpooapiokyuxysdzzp.supabase.co" }).ok, false);
  assert.equal(inspectE2eStatus({ ...st,
    API_URL: "http://127.0.0.1:54321" }).ok, false);
  assert.equal(inspectE2eStatus({ ...st,
    DB_URL: "postgresql://postgres:x@127.0.0.1:54322/postgres" }).ok, false);
  assert.equal(inspectE2eStatus({ ...st, SERVICE_ROLE_KEY: "" }).ok, false);
  const web = buildE2eWebEnv(st);
  assert.equal(web.includes(st.SERVICE_ROLE_KEY), false);
  assert.equal(inspectE2eWebEnv(web, st).ok, true);
  assert.equal(inspectE2eWebEnv(web.replace("true", "false"), st).ok, false);
  assert.equal(inspectE2eWebEnv(web.replace(E2E_API,
    "http://127.0.0.1:54321"), st).ok, false);
  assert.equal(inspectE2eWebEnv(web + "VITE_SERVICE_ROLE_KEY=bad\n", st).ok, false);
  assert.equal(inspectE2eWebEnv(web + "VITE_E2E_MODE=true\n", st).ok, false);
  assert.equal(inspectE2eWebEnv(null, st).ok, false);
});

test("HERO E2E env generator is create-only with no fixture or deploy side effects", () => {
  const s = readFileSync(new URL("./check-local-e2e-preflight.mjs",
    import.meta.url), "utf8");
  assert.ok(s.includes('flag: "wx"'));
  assert.ok(s.includes("hero_local_supabase_unavailable"));
  for (const forbidden of [
    "supabase db reset", "supabase db push", "wrangler pages deploy",
    "pnpm e2e:setup", "console.log(cli.stdout)",
  ]) assert.equal(s.includes(forbidden), false, forbidden);
});

test("HERO local Edge probe requires exact handler response and site-origin CORS", () => {
  assert.deepEqual(edgeProbeVerdict(400, {error:"invalid_token"}, E2E_WEB_ORIGIN),
    {ok:true,reason:"local_edge_invalid_token_guard_verified"});
  for (const [code, body, origin] of [
    [200, {error:"invalid_token"}, E2E_WEB_ORIGIN],
    [404, {error:"not_found"}, E2E_WEB_ORIGIN],
    [400, {error:"invalid_token"}, "null"],
    [400, {error:"invalid_token"}, "http://127.0.0.1:5173"],
    [400, {error:"something_else"}, E2E_WEB_ORIGIN],
  ]) assert.equal(edgeProbeVerdict(code, body, origin).ok, false);
});

test("HERO full mobile E2E requires explicit fixture-write confirmation", () => {
  assert.deepEqual(e2eArgsVerdict(["edge-check"]), {ok:true,run:false});
  assert.deepEqual(e2eArgsVerdict(["run","--confirm-local-fixture-seed"]),
    {ok:true,run:true});
  for (const args of [
    [], ["run"], ["run","--confirm-preview"], ["edge-check","--unsafe"],
    ["run","--confirm-local-fixture-seed","--reset"],
  ]) assert.equal(e2eArgsVerdict(args).ok,false);
});

test("HERO full mobile E2E never injects server-role keys into Vite", () => {
  const inherited = {
    VITE_SUPABASE_URL: "https://alhpooapiokyuxysdzzp.supabase.co",
    VITE_SERVICE_ROLE_KEY: "must-not-leak",
    SERVICE_ROLE_KEY: "server-secret",
    SUPABASE_SERVICE_ROLE_KEY: "server-secret-2",
    DATABASE_URL: "postgres://remote",
    SAFE_FLAG: "preserved",
  };
  const keys = { a:"test-player-a", b:"test-player-b", manager:"test-manager" };
  const result = browserTestEnv(inherited, {ANON_KEY:"only-local-anon"}, keys);
  assert.equal(result.VITE_SUPABASE_URL, E2E_API);
  assert.equal(result.VITE_SUPABASE_ANON_KEY, "only-local-anon");
  assert.equal(result.VITE_E2E_MODE, "true");
  assert.equal(result.HERO_LOCAL_FULL_E2E, "1");
  assert.equal(result.HERO_E2E_PASSWORD_A, keys.a);
  assert.equal(result.VITE_SERVICE_ROLE_KEY, undefined);
  assert.equal(result.SERVICE_ROLE_KEY, undefined);
  assert.equal(result.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(result.DATABASE_URL, undefined);
  assert.equal(result.SAFE_FLAG, "preserved");
  const pw = readFileSync(new URL("../playwright.config.ts",import.meta.url),"utf8");
  assert.ok(pw.includes('process.env.HERO_LOCAL_FULL_E2E !== "1"'));
});

test("E2E Auth IDs use UUID v4 and admin returns the exact requested identity", () => {
  const source = readFileSync(new URL("../e2e/setup-local.ts", import.meta.url), "utf8");
  const ids = [...source.matchAll(/70000000-[0-9a-f-]{27}/g)].map(x => x[0]);
  assert.equal(ids.length, 11);
  assert.equal(new Set(ids).size, 11);
  for (const id of ids) assert.equal(requireFixtureAuthUuidV4(id), id);
  for (const bad of [
    "70000000-0000-0000-0000-000000000001",
    "70000000-0000-1000-8000-000000000001",
    "70000000-0000-4000-0000-000000000001", null,
  ]) assert.throws(() => requireFixtureAuthUuidV4(bad),
    /invalid_auth_user_uuid_v4/);
  assert.ok(source.includes("if (data?.user?.id !== input.id)"));
  assert.ok(source.indexOf("for (const id of [") <
    source.indexOf("await assertFreshLocalE2eNamespace"));
});

test("Full mobile run checks for busy Vite port before any fixture creation", () => {
  const runner = readFileSync(new URL("./hero-mobile-e2e.mjs",
    import.meta.url), "utf8");
  const before = runner.indexOf("await assertWebPortAvailable();");
  const seed = runner.indexOf("command(\"pnpm\", [\"e2e:setup\"]");
  assert.ok(before > 0);
  assert.ok(seed > before);
  assert.ok(runner.includes('server.listen(4173, "127.0.0.1"'));
  assert.ok(runner.includes("vite_port_4173_unavailable"));
});
