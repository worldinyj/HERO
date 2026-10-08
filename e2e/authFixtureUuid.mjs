/** Fail closed when fixed Supabase Auth fixture IDs are not UUID v4. */
export function requireFixtureAuthUuidV4(id) {
  if (typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw Error("E2E_FIXTURE_PREFLIGHT_BLOCKED: invalid_auth_user_uuid_v4");
  }
  return id;
}
