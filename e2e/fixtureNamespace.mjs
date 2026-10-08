/**
 * Local E2E fixture isolation: read-only namespace audit before writes.
 * Never reuse, delete, overwrite, or reset existing test or user data.
 * The caller must first enforce localTargetGuard.mjs's exact loopback URL.
 */
export const HERO_E2E_SEASON_KEY = "e2e-season";
export async function assertFreshLocalE2eNamespace(client, scope) {
  const { data: users, error: authError } =
    await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError || !Array.isArray(users?.users)) {
    throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: auth_lookup_failed");
  }
  if ((Number.isFinite(users.lastPage) && users.lastPage > 1) ||
      (Number.isFinite(users.total) && users.total > users.users.length)) {
    throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: auth_inventory_incomplete");
  }
  const authIds = new Set(scope.authIds);
  const emails = new Set(scope.emails.map(x => x.toLowerCase()));
  if (users.users.some(u => authIds.has(u.id) ||
    (typeof u.email === "string" && emails.has(u.email.toLowerCase())))) {
    throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: auth_fixture_already_exists");
  }

  const queries = [
    ["plants", [scope.ids.plant]],
    ["profiles", scope.authIds],
    ["invitations", [scope.ids.inviteA, scope.ids.inviteB]],
    ["scenarios", [scope.ids.scenario]],
    ["scenario_versions", [scope.ids.version]],
  ];
  for (const [table, ids] of queries) {
    const { data, error } =
      await client.from(table).select("id").in("id", ids).limit(1);
    if (error || !Array.isArray(data)) {
      throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: " + table + "_lookup_failed");
    }
    if (data.length) {
      throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: " + table + "_fixture_already_exists");
    }
  }

  for (const [table, column, value] of [
    ["plants", "code", "E2E"],
    ["scenarios", "slug", scope.scenarioSlug],
    ["seasons", "season_key", HERO_E2E_SEASON_KEY],
  ]) {
    const { data, error } =
      await client.from(table).select("id").eq(column, value).limit(1);
    if (error || !Array.isArray(data)) {
      throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: " + table + "_lookup_failed");
    }
    if (data.length) {
      throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: " + table + "_fixture_already_exists");
    }
  }
  return { ok: true, reason: "fresh_hero_local_fixture_namespace" };
}
