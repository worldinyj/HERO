import { writeAuditLog, writeAuditLogs } from "../_shared/audit.ts";
import { randomToken, sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { buildInviteUrl } from "../_shared/inviteUrl.ts";
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

  if (error || !data) {
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
  const invitation = await loadPendingInvite(
    operator.admin,
    operator,
    invitationId,
  );
  const canceledAt = new Date().toISOString();

  const { error } = await operator.admin
    .from("invitations")
    .update({ canceled_at: canceledAt })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("canceled_at", null);

  if (error) throw error;

  await writeAuditLog(operator.admin, {
    actorUserId: operator.userId,
    plantId: invitation.plant_id,
    action: "invitation.canceled",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: {
      target_role: invitation.target_role,
      invitee_name: invitation.invitee_name,
      job_role: invitation.job_role,
      operator_role: operator.role,
    },
  });

  return { canceled: true, invitationId: invitation.id, canceledAt };
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
  const canceledAt = new Date().toISOString();

  const { error: cancelError } = await operator.admin
    .from("invitations")
    .update({ canceled_at: canceledAt })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("canceled_at", null);

  if (cancelError) throw cancelError;

  const { data: replacement, error: insertError } = await operator.admin
    .from("invitations")
    .insert({
      token_hash: tokenHash,
      plant_id: invitation.plant_id,
      target_role: invitation.target_role,
      invitee_name: invitation.invitee_name,
      job_role: invitation.target_role === "player" ? invitation.job_role : null,
      team_name: invitation.team_name,
      created_by: operator.userId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !replacement) {
    throw insertError ?? new Error("replacement_invitation_create_failed");
  }

  await writeAuditLogs(operator.admin, [
    {
      actorUserId: operator.userId,
      plantId: invitation.plant_id,
      action: "invitation.canceled_for_reissue",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {
        replacement_invitation_id: replacement.id,
        operator_role: operator.role,
      },
    },
    {
      actorUserId: operator.userId,
      plantId: invitation.plant_id,
      action: "invitation.reissued",
      entityType: "invitation",
      entityId: replacement.id,
      metadata: {
        replaced_invitation_id: invitation.id,
        target_role: invitation.target_role,
        job_role: invitation.job_role,
        operator_role: operator.role,
      },
    },
  ]);

  return {
    reissued: true,
    oldInvitationId: invitation.id,
    invitationId: replacement.id,
    inviteUrl,
    expiresAt,
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

  const { data: target, error: targetError } = await operator.admin
    .from("profiles")
    .select("id, plant_id, role, real_name, nickname, is_active")
    .eq("id", profileId)
    .eq("plant_id", operator.plantId)
    .eq("role", "player")
    .maybeSingle();

  if (targetError || !target) {
    throw new Error("player_not_found");
  }

  if (target.is_active === isActive) {
    return {
      changed: false,
      profileId: target.id,
      isActive: target.is_active,
    };
  }

  const { error: updateError } = await operator.admin
    .from("profiles")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("plant_id", operator.plantId)
    .eq("role", "player");

  if (updateError) throw updateError;

  await writeAuditLog(operator.admin, {
    actorUserId: operator.userId,
    plantId: operator.plantId,
    action: isActive ? "player.reactivated" : "player.deactivated",
    entityType: "profile",
    entityId: target.id,
    metadata: {
      real_name: target.real_name,
      nickname: target.nickname,
    },
  });

  return {
    changed: true,
    profileId: target.id,
    isActive,
  };
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
    const message = cause instanceof Error ? cause.message : "internal_error";
    const status =
      message === "unauthorized"
        ? 401
        : [
            "manager_or_admin_required",
            "plant_manager_required",
            "admin_invitation_scope_violation",
            "manager_scope_violation",
          ].includes(message)
          ? 403
          : ["invitation_not_found", "player_not_found"].includes(message)
            ? 404
            : [
                "invitation_already_accepted",
                "invitation_already_canceled",
              ].includes(message)
              ? 409
              : 500;

    return json(req, { error: message }, status);
  }
});
