import { writeAuditLog, writeAuditLogs } from "../_shared/audit.ts";
import { randomToken, sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

type Action = "cancel-invite" | "reissue-invite" | "set-player-active";

interface RequestBody {
  action?: Action;
  invitationId?: string;
  profileId?: string;
  isActive?: boolean;
}

async function requireManager(req: Request) {
  const admin = adminClient();
  const auth = await requireActiveProfile(req, admin);

  if (auth.profile.role !== "plant_manager" || !auth.profile.plant_id) {
    throw new Error("plant_manager_required");
  }

  return {
    admin,
    user: auth.user,
    plantId: auth.profile.plant_id as string,
  };
}

async function loadPendingInvite(
  admin: ReturnType<typeof adminClient>,
  plantId: string,
  invitationId: string,
) {
  const { data, error } = await admin
    .from("invitations")
    .select("id, plant_id, target_role, invitee_name, job_role, team_name, accepted_at, canceled_at, expires_at")
    .eq("id", invitationId)
    .eq("plant_id", plantId)
    .eq("target_role", "player")
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

  return data;
}

async function cancelInvite(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  plantId: string,
  invitationId: string,
) {
  const invitation = await loadPendingInvite(admin, plantId, invitationId);
  const canceledAt = new Date().toISOString();

  const { error } = await admin
    .from("invitations")
    .update({ canceled_at: canceledAt })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("canceled_at", null);

  if (error) throw error;

  await writeAuditLog(admin, {
    actorUserId: userId,
    plantId,
    action: "invitation.canceled",
    entityType: "invitation",
    entityId: invitation.id,
    metadata: {
      target_role: invitation.target_role,
      invitee_name: invitation.invitee_name,
      job_role: invitation.job_role,
    },
  });

  return { canceled: true, invitationId: invitation.id, canceledAt };
}

async function reissueInvite(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  plantId: string,
  invitationId: string,
) {
  const invitation = await loadPendingInvite(admin, plantId, invitationId);
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const canceledAt = new Date().toISOString();

  const { error: cancelError } = await admin
    .from("invitations")
    .update({ canceled_at: canceledAt })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("canceled_at", null);

  if (cancelError) throw cancelError;

  const { data: replacement, error: insertError } = await admin
    .from("invitations")
    .insert({
      token_hash: tokenHash,
      plant_id: plantId,
      target_role: "player",
      invitee_name: invitation.invitee_name,
      job_role: invitation.job_role,
      team_name: invitation.team_name,
      created_by: userId,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !replacement) {
    throw insertError ?? new Error("replacement_invitation_create_failed");
  }

  const { data: plant, error: plantError } = await admin
    .from("plants")
    .select("display_name")
    .eq("id", plantId)
    .single();

  if (plantError || !plant) {
    throw plantError ?? new Error("plant_not_found");
  }

  await writeAuditLogs(admin, [
    {
      actorUserId: userId,
      plantId,
      action: "invitation.canceled_for_reissue",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {
        replacement_invitation_id: replacement.id,
      },
    },
    {
      actorUserId: userId,
      plantId,
      action: "invitation.reissued",
      entityType: "invitation",
      entityId: replacement.id,
      metadata: {
        replaced_invitation_id: invitation.id,
        job_role: invitation.job_role,
      },
    },
  ]);

  const siteUrl = Deno.env.get("SITE_URL");
  if (!siteUrl) {
    throw new Error("missing_site_url");
  }

  return {
    reissued: true,
    oldInvitationId: invitation.id,
    invitationId: replacement.id,
    inviteUrl: new URL(`/i/${token}`, siteUrl).toString(),
    expiresAt,
    plantDisplayName: plant.display_name,
  };
}

async function setPlayerActive(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  plantId: string,
  profileId: string,
  isActive: boolean,
) {
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, plant_id, role, real_name, nickname, is_active")
    .eq("id", profileId)
    .eq("plant_id", plantId)
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

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("plant_id", plantId)
    .eq("role", "player");

  if (updateError) throw updateError;

  await writeAuditLog(admin, {
    actorUserId: userId,
    plantId,
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
    const { admin, user, plantId } = await requireManager(req);
    const body = (await req.json()) as RequestBody;
    const limited = await guardRateLimit(req, admin, {
      scope: `manager-user-action:${body.action ?? "unknown"}`,
      subject: user.id,
      limit: 40,
      windowSeconds: 600,
    });
    if (limited) return limited;

    switch (body.action) {
      case "cancel-invite": {
        if (!body.invitationId) {
          return json(req, { error: "invitation_id_required" }, 400);
        }
        return json(
          req,
          await cancelInvite(admin, user.id, plantId, body.invitationId),
        );
      }

      case "reissue-invite": {
        if (!body.invitationId) {
          return json(req, { error: "invitation_id_required" }, 400);
        }
        return json(
          req,
          await reissueInvite(admin, user.id, plantId, body.invitationId),
          201,
        );
      }

      case "set-player-active": {
        if (!body.profileId || typeof body.isActive !== "boolean") {
          return json(req, { error: "profile_id_and_active_required" }, 400);
        }
        return json(
          req,
          await setPlayerActive(
            admin,
            user.id,
            plantId,
            body.profileId,
            body.isActive,
          ),
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
        : message === "plant_manager_required"
          ? 403
          : [
              "invitation_not_found",
              "player_not_found",
            ].includes(message)
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
