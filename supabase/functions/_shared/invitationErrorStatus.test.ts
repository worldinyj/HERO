import { classifyInvitationError } from "./invitationErrorStatus.ts";

Deno.test("pre-mutation validation failures expose actionable 4xx responses", () => {
  const cases: Array<[string, number]> = [
    ["invalid_request", 400],
    ["job_role_required", 400],
    ["invalid_invitee_name", 400],
    ["invalid_team_name", 400],
    ["invalid_invitation_token_hash", 400],
    ["invalid_invitation_expiration", 400],
    ["manager_job_role_forbidden", 400],
    ["unauthorized", 401],
    ["admin_can_only_invite_manager", 403],
    ["manager_or_admin_required", 403],
    ["manager_scope_violation", 403],
    ["admin_invitation_scope_violation", 403],
    ["plant_not_found", 404],
    ["invitation_not_found", 404],
    ["invitation_already_accepted", 409],
    ["invitation_already_canceled", 409],
    ["player_role_required", 403],
    ["nickname_length", 409],
    ["nickname_characters", 409],
    ["nickname_forbidden", 409],
    ["nickname_taken", 409],
    ["nickname_change_limit_reached", 409],
    ["no_open_season", 409],
  ];
  for (const [code, status] of cases) {
    const actual = classifyInvitationError(new Error(code));
    if (actual.error !== code || actual.status !== status) {
      throw new Error(`unexpected rejection response for ${code}`);
    }
  }
});

Deno.test("PostgREST P0001 objects expose only allowlisted rejection codes", () => {
  const permitted = [
    ["invitation_already_canceled", 409],
    ["invitation_not_found", 404],
    ["player_not_found", 404],
    ["nickname_change_limit_reached", 409],
    ["nickname_taken", 409],
  ] as const;
  for (const [message, status] of permitted) {
    const actual = classifyInvitationError({
      code: "P0001",
      message,
      details: "internal SQL details must not be surfaced",
      hint: "secret",
    });
    if (actual.status !== status || actual.error !== message) {
      throw new Error("known PostgREST database rejection not classified");
    }
  }
});

Deno.test("malformed or unexpected DB error objects stay opaque", () => {
  const inherited = Object.create({ message: "invitation_not_found", code: "P0001" });
  const accessor = Object.defineProperty({ code: "P0001" }, "message", {
    get() { throw new Error("must not invoke SQL message getters"); },
  });
  for (const value of [
    { code: "23505", message: "nickname_taken" },
    { code: "XX000", message: "invitation_not_found" },
    { code: "P0001", message: "invitation_not_found: secret" },
    { code: "P0001", message: "__proto__" },
    { code: "P0001", message: "toString" },
    { code: "P0001", message: 123 },
    { message: "invitation_not_found" },
    inherited,
    accessor,
  ]) {
    const actual = classifyInvitationError(value);
    if (actual.status !== 500 || actual.error !== "internal_error") {
      throw new Error("opaque DB failure leaked or mapped to client rejection");
    }
  }
});

Deno.test("unknown or potentially committed requests remain 500", () => {
  for (const cause of [
    new Error("reissue_result_unknown"),
    new Error("cancel_result_unknown"),
    new Error("invite_creation_outcome_unknown"),
    new Error("nickname_reset_outcome_unknown"),
    new Error("nickname_change_outcome_unknown"),
    new Error("audit_log_write_failed: database connection lost"),
    new Error("duplicate key value violates unique constraint"),
    new Error("missing_site_url"),
    new Error("invitation_not_found: untrusted suffix"),
    new Error("toString"),
    new Error("__proto__"),
    null,
    undefined,
    "manager_scope_violation",
  ]) {
    const actual = classifyInvitationError(cause);
    if (actual.error !== "internal_error" || actual.status !== 500) {
      throw new Error("unsafe 4xx classification or internal error leakage");
    }
  }
});
