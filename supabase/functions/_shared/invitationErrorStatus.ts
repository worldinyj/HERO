/**
 * Edge Function responses must distinguish a deterministic DB rejection from
 * a transport/server failure that could follow a committed invitation.
 *
 * Never infer a 4xx status from a PostgreSQL SQLSTATE alone: a transaction
 * might have failed for a reason not covered by the invitation contract.
 * Only precise, allowlisted public error codes are safe to expose.
 */
const CLIENT_REJECTIONS: Readonly<Record<string, number>> = {
  invalid_request: 400,
  invitation_id_required: 400,
  profile_id_and_active_required: 400,
  job_role_required: 400,
  manager_job_role_forbidden: 400,
  invalid_invitee_name: 400,
  invalid_team_name: 400,
  invalid_invitation_token_hash: 400,
  invalid_invitation_expiration: 400,
  unknown_action: 400,

  unauthorized: 401,

  forbidden: 403,
  admin_can_only_invite_manager: 403,
  admin_invitation_scope_violation: 403,
  manager_scope_violation: 403,
  manager_or_admin_required: 403,
  plant_manager_required: 403,

  invitation_not_found: 404,
  player_not_found: 404,
  plant_not_found: 404,

  invitation_already_accepted: 409,
  invitation_already_canceled: 409,

  nickname_length: 409,
  nickname_characters: 409,
  nickname_forbidden: 409,
  nickname_taken: 409,
  nickname_change_limit_reached: 409,
  no_open_season: 409,
  player_role_required: 403,
};

export function classifyInvitationError(
  cause: unknown,
): { error: string; status: number } {
  // PostgREST may reject with a plain { code: "P0001", message: "..." }
  // object rather than an Error instance. Accept only an *own*, data-property
  // message from the explicit PostgreSQL RAISE EXCEPTION SQLSTATE. Unknown
  // SQL errors, object prototypes and synthetic accessors stay opaque 500.
  let message = cause instanceof Error ? cause.message : "";
  if (!message && cause !== null && typeof cause === "object") {
    const code = Object.getOwnPropertyDescriptor(cause, "code")?.value;
    const rawMessage = Object.getOwnPropertyDescriptor(cause, "message")?.value;
    if (code === "P0001" && typeof rawMessage === "string") {
      message = rawMessage;
    }
  }
  // This intentionally checks exact messages, rather than substring matches.
  // Unknown DB/transport/response errors stay 5xx and therefore trigger the
  // client's "outcome uncertain" retry lock for issuance/reissuance.
  if (Object.hasOwn(CLIENT_REJECTIONS, message)) {
    const status = CLIENT_REJECTIONS[message];
    if (typeof status === "number") {
      return { error: message, status };
    }
  }
  return { error: "internal_error", status: 500 };
}
