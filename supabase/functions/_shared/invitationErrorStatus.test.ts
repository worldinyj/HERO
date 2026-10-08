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
  ];
  for (const [code, status] of cases) {
    const actual = classifyInvitationError(new Error(code));
    if (actual.error !== code || actual.status !== status) {
      throw new Error(`unexpected rejection response for ${code}`);
    }
  }
});

Deno.test("unknown or potentially committed requests remain 500", () => {
  for (const cause of [
    new Error("reissue_result_unknown"),
    new Error("cancel_result_unknown"),
    new Error("invite_creation_outcome_unknown"),
    new Error("audit_log_write_failed: database connection lost"),
    new Error("duplicate key value violates unique constraint"),
    new Error("missing_site_url"),
    new Error("invitation_not_found: untrusted suffix"),
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
