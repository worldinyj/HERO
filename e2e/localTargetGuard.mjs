/**
 * Guard ALL persistent E2E fixture writes against remote Supabase.
 * This project uses a dedicated local API port (unlike Johnny Fiction).
 * Keep this module pure and dependency-free so Node can test it without DB.
 */
export const HERO_E2E_LOCAL_API = "http://127.0.0.1:55321";

export function localE2eSeedGate(env) {
  if (env.HERO_E2E_ALLOW_FIXTURE_SEED !== "1") {
    return { ok: false, reason: "explicit_fixture_seed_confirmation_required" };
  }
  const url = env.SUPABASE_URL || env.API_URL;
  if (!url || (env.SUPABASE_URL && env.API_URL &&
    env.SUPABASE_URL !== env.API_URL)) {
    return { ok: false, reason: "missing_or_conflicting_supabase_url" };
  }
  let parsed;
  try { parsed = new URL(url); }
  catch { return { ok: false, reason: "invalid_supabase_url" }; }
  if (parsed.href !== HERO_E2E_LOCAL_API + "/" ||
      parsed.origin !== HERO_E2E_LOCAL_API ||
      parsed.hostname !== "127.0.0.1" ||
      parsed.protocol !== "http:" ||
      parsed.port !== "55321" ||
      parsed.username || parsed.password ||
      parsed.search || parsed.hash) {
    return { ok: false, reason: "non_hero_local_supabase_target" };
  }
  if (env.SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY &&
      env.SERVICE_ROLE_KEY !== env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "conflicting_service_role_keys" };
  }
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY)) {
    return { ok: false, reason: "missing_local_service_role_key" };
  }
  for (const name of ["HERO_E2E_PASSWORD_A", "HERO_E2E_PASSWORD_B",
    "HERO_E2E_PASSWORD_MANAGER"]) {
    if (!env[name] || env[name].length < 12) {
      return { ok: false, reason: "missing_or_short_e2e_password" };
    }
  }
  const passwords = [
    env.HERO_E2E_PASSWORD_A, env.HERO_E2E_PASSWORD_B,
    env.HERO_E2E_PASSWORD_MANAGER,
  ];
  if (new Set(passwords).size !== passwords.length) {
    return { ok: false, reason: "non_unique_e2e_passwords" };
  }
  return { ok: true, reason: "hero_local_seed_permitted" };
}
