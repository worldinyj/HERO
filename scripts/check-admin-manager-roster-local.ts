import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { EMPTY_MANAGER_FILTERS, ManagerPageOutOfRangeError, readManagerPage, readPlantManagerCounts } from "../apps/web/src/features/admin/managerRosterQueries.ts";

import { readOrgListSnapshot } from "../apps/web/src/features/admin/orgListSnapshot.ts";

async function main() {
  const config = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], { stdio: ["ignore", "pipe", "pipe"] }).toString());
  if (config.API_URL !== "http://127.0.0.1:55321" || (new URL(config.DB_URL).port !== "55322" || !["127.0.0.1", "localhost"].includes(new URL(config.DB_URL).hostname))) throw Error("wrong_local_target");
  const localFetch: typeof fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (url.origin !== config.API_URL || !["GET", "HEAD"].includes(method.toUpperCase())) throw Error("read_only_local_guard");
    const signal = AbortSignal.any([AbortSignal.timeout(15_000), ...(init?.signal ? [init.signal] : [])]);
    return fetch(input, { ...init, signal });
  };
  const makeClient = (key: string, token?: string) => createClient(config.API_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: localFetch, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) },
  });
  const service = makeClient(config.SERVICE_ROLE_KEY);
  const { data: admins, error: adminError } = await service.from("profiles").select("id").eq("role", "admin").eq("is_active", true).limit(1);
  if (adminError) throw Error("local_admin_lookup_failed");
  if (!config.JWT_SECRET || !admins?.[0]) throw Error("existing_local_admin_or_jwt_secret_missing");
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: admins[0].id, role: "authenticated", aud: "authenticated", iat: now, exp: now + 120 })}`;
  const jwt = `${payload}.${createHmac("sha256", config.JWT_SECRET).update(payload).digest("base64url")}`;
  const admin = makeClient(config.ANON_KEY, jwt);
  const expected = await service.from("profiles").select("id", { count: "exact", head: true }).eq("role", "plant_manager").eq("is_active", true);
  const total = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "plant_manager").eq("is_active", true);
  if (expected.error || total.error || typeof expected.count !== "number" || expected.count !== total.count) throw Error("admin_exact_head_count_mismatch");
  const plants = await admin.from("plants").select("id, profiles(count)").eq("profiles.role", "plant_manager").eq("profiles.is_active", true).order("display_name");
  if (plants.error) throw Error(`embedded_count_query_failed:${plants.error.code}`);
  const counts = readPlantManagerCounts(plants.data);
  for (const [id, count] of counts) {
    const check = await service.from("profiles").select("id", { count: "exact", head: true }).eq("role", "plant_manager").eq("plant_id", id).eq("is_active", true);
    if (check.error || check.count !== count) throw Error("plant_embedded_count_mismatch");
  }
  const plantSnapshot = await readOrgListSnapshot((from, to) => admin.from("plants")
    .select("id", { count: "exact" }).order("display_name").order("id").range(from, to));
  const nowIso = new Date().toISOString();
  const pendingSnapshot = await readOrgListSnapshot((from, to) => admin.from("invitations")
    .select("id", { count: "exact" }).eq("target_role", "plant_manager").is("accepted_at", null)
    .is("canceled_at", null).gt("expires_at", nowIso).order("created_at", { ascending: false }).order("id").range(from, to));
  const pendingCount = await service.from("invitations").select("id", { count: "exact", head: true })
    .eq("target_role", "plant_manager").is("accepted_at", null).is("canceled_at", null).gt("expires_at", nowIso);
  if (plantSnapshot.length !== counts.size || pendingCount.error || pendingCount.count !== pendingSnapshot.length) throw Error("org_snapshot_count_mismatch");
  const page = await readManagerPage(admin, EMPTY_MANAGER_FILTERS, 0);
  let filterChecks = 0;
  for (const plantId of counts.keys()) for (const status of ["active", "inactive"] as const) {
    const filtered = await readManagerPage(admin, { name: "", plantId, status }, 0);
    if (filtered.rows.some(row => row.plant_id !== plantId || row.is_active !== (status === "active"))) throw Error("server_filter_mismatch");
    filterChecks++;
  }
  let outOfRangeVerified = false;
  if (page.total > 0) {
    try { await readManagerPage(admin, EMPTY_MANAGER_FILTERS, Math.ceil(page.total / 20) + 1); }
    catch (error) {
      if (!(error instanceof ManagerPageOutOfRangeError)) throw error;
      outOfRangeVerified = true;
    }
    if (!outOfRangeVerified) throw Error("postgrest_range_error_missing");
  }
  console.log(JSON.stringify({ outOfRangeVerified, plantSnapshotRows: plantSnapshot.length, pendingSnapshotRows: pendingSnapshot.length, result: "PASS", target: "127.0.0.1:55321", authenticatedAdminRls: true, activeManagers: total.count, checkedPlantCounts: counts.size, firstPageRows: page.rows.length, totalManagers: page.total, filterChecks, writes: 0 }));
}
main().catch(error => { console.error(error instanceof Error && /^[a-z_]+(?::[A-Z0-9]+)?$/.test(error.message) ? error.message : "local_read_verification_failed"); process.exitCode = 1; });
