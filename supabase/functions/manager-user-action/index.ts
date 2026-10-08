import { randomToken, sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { buildInviteUrl } from "../_shared/inviteUrl.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

type Action = "cancel-invite" | "reissue-invite" | "set-player-active";
type OperatorRole = "admin" | "plant_manager";

interface RequestBody {
  action?: Action;
  invitationId?: string;
  profileId?: string;
  isActive?: boolean;
}

interface OperatorContext {
  admin: ReturnType<typeof adminClient>;
  userId: string;
  role: OperatorRole;
  plantId: string | null;
}

async function requireOperator(req: Request): Promise<OperatorContext> {
  const admin = adminClient();
  const auth = await requireActiveProfile(req, admin);

  if (auth.profile.role === "admin") {
    return {
      admin,
      userId: auth.user.id,
      role: "admin",
      plantId: null,
    };
  }

  if (auth.profile.role === "plant_manager" && auth.profile.plant_id) {
    return {
      admin,
      userId: auth.user.id,
      role: "plant_manager",
      plantId: auth.profile.plant_id as string,
    };
  }

  throw new Error("manager_or_admin_required");
}

async function loadPendingInvite(
  admin: ReturnType<typeof adminClient>,
  operator: Pick<OperatorContext, "role" | "plantId">,
  invitationId: string,
) {
  const { data, error } = await admin
    .from("invitations")
    .select(
      "id, plant_id, target_role, invitee_name, job_role, team_name, accepted_at, canceled_at, expires_at",
    )
    .eq("id", invitationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("invitation_not_found");
  }

  if (data.accepted_at) {
    throw new Error("invitation_already_accepted");
  }

  if (data.canceled_at) {
    throw new Error("invitation_already_canceled");
  }

  if (operator.role === "admin") {
    if (data.target_role !== "plant_manager") {
      throw new Error("admin_invitation_scope_violation");
    }
  } else if (
    data.target_role !== "player" ||
    !operator.plantId ||
    data.plant_id !== operator.plantId
  ) {
    throw new Error("manager_scope_violation");
  }

  return data;
}

async function cancelInvite(
  operator: OperatorContext,
  invitationId: string,
) {
  // The DB function rechecks role/plant, locks the invitation against
  // acceptance/reissue, and writes the cancellation and audit atomically.
  const { data, error } = await operator.admin.rpc(
    "cancel_invitation_atomic",
    {
      p_invitation_id: invitationId,
      p_actor_user_id: operator.userId,
    },
  );
  if (error) throw new Error(error.message);

  const result = data as {
    canceled?: boolean;
    invitationId?: string;
    canceledAt?: string;
  } | null;

  if (
    result?.canceled !== true ||
    result.invitationId !== invitationId ||
    !result.canceledAt
  ) {
    // A malformed HTTP response cannot prove the request was rolled back.
    throw new Error("cancel_result_unknown");
  }

  return {
    canceled: true,
    invitationId: result.invitationId,
    canceledAt: result.canceledAt,
  };
}

async function reissueInvite(
  operator: OperatorContext,
  invitationId: string,
) {
  const invitation = await loadPendingInvite(
    operator.admin,
    operator,
    invitationId,
  );
  const token = randomToken();
  // Resolve all read/configuration dependencies before changing either
  // invitation. A failed plant lookup must not revoke the original token.
  const inviteUrl = buildInviteUrl(Deno.env.get("SITE_URL"), token);
  const { data: plant, error: plantError } = await operator.admin
    .from("plants")
    .select("display_name")
    .eq("id", invitation.plant_id)
    .single();

  if (plantError || !plant) {
    throw plantError ?? new Error("plant_not_found");
  }

  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  // A single PostgreSQL function owns cancellation, replacement and audit.
  // Partial failures (including token collision) leave the old token valid.
  const { data: replacement, error: reissueError } = await operator.admin.rpc(
    "reissue_invitation_atomic",
    {
      p_invitation_id: invitation.id,
      p_actor_user_id: operator.userId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
    },
  );

  if (reissueError) throw new Error(reissueError.message);

  const result = replacement as {
    reissued?: boolean;
    oldInvitationId?: string;
    invitationId?: string;
    expiresAt?: string;
  } | null;

  if (
    result?.reissued !== true ||
    result.oldInvitationId !== invitation.id ||
    !result.invitationId ||
    !result.expiresAt
  ) {
    // A malformed response is not proof the transaction failed. The admin
    // interface must not auto-retry an uncertain reissue.
    throw new Error("reissue_result_unknown");
  }

  return {
    reissued: true,
    oldInvitationId: invitation.id,
    invitationId: result.invitationId,
    inviteUrl,
    expiresAt: result.expiresAt,
    plantDisplayName: plant.display_name,
  };
}

async function setPlayerActive(
  operator: OperatorContext,
  profileId: string,
  isActive: boolean,
) {
  if (operator.role !== "plant_manager" || !operator.plantId) {
    throw new Error("plant_manager_required");
  }

  const { data, error } = await operator.admin.rpc(
    "set_player_active_atomic",
    {
      p_actor_user_id: operator.userId,
      p_profile_id: profileId,
      p_is_active: isActive,
    },
  );
  if (error) throw new Error(error.message);

  const result = data as {
    changed?: boolean;
    profileId?: string;
    isActive?: boolean;
  } | null;

  if (
    !result ||
    typeof result.changed !== "boolean" ||
    result.profileId !== profileId ||
    result.isActive !== isActive
  ) {
    // HTTP failure after a committed state change is still uncertain.
    // The operator should inspect the participant list before retrying.
    throw new Error("player_status_result_unknown");
  }

  return result;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const operator = await requireOperator(req);
    const body = (await req.json()) as RequestBody;
    const limited = await guardRateLimit(req, operator.admin, {
      scope: `manager-user-action:${body.action ?? "unknown"}`,
      subject: operator.userId,
      limit: 40,
      windowSeconds: 600,
    });
    if (limited) return limited;

    switch (body.action) {
      case "cancel-invite": {
        if (!body.invitationId) {
          return json(req, { error: "invitation_id_required" }, 400);
        }
        return json(req, await cancelInvite(operator, body.invitationId));
      }

      case "reissue-invite": {
        if (!body.invitationId) {
          return json(req, { error: "invitation_id_required" }, 400);
        }
        return json(
          req,
          await reissueInvite(operator, body.invitationId),
          201,
        );
      }

      case "set-player-active": {
        if (!body.profileId || typeof body.isActive !== "boolean") {
          return json(req, { error: "profile_id_and_active_required" }, 400);
        }
        return json(
          req,
          await setPlayerActive(operator, body.profileId, body.isActive),
        );
      }

      default:
        return json(req, { error: "unknown_action" }, 400);
    }
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
