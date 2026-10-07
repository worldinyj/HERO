import { writeAuditLog } from "../_shared/audit.ts";
import { randomToken, sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

type JobRole = "sro" | "ro" | "field_operator" | "supervisor" | "worker";
type TargetRole = "plant_manager" | "player";

interface CreateInviteBody {
  plantId?: string;
  targetRole?: TargetRole;
  inviteeName?: string;
  jobRole?: JobRole;
  teamName?: string;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const admin = adminClient();
    const { user, profile } = await requireActiveProfile(req, admin);
    const body = (await req.json()) as CreateInviteBody;

    const plantId = body.plantId?.trim();
    const inviteeName = body.inviteeName?.trim();
    const targetRole = body.targetRole;

    if (!plantId || !inviteeName || !targetRole) {
      return json(req, { error: "invalid_request" }, 400);
    }

    if (profile.role === "admin") {
      if (targetRole !== "plant_manager") {
        return json(req, { error: "admin_can_only_invite_manager" }, 403);
      }
    } else if (profile.role === "plant_manager") {
      if (targetRole !== "player" || profile.plant_id !== plantId) {
        return json(req, { error: "manager_scope_violation" }, 403);
      }
    } else {
      return json(req, { error: "forbidden" }, 403);
    }

    if (targetRole === "player" && !body.jobRole) {
      return json(req, { error: "job_role_required" }, 400);
    }

    const { data: plant, error: plantError } = await admin
      .from("plants")
      .select("id, display_name, is_active")
      .eq("id", plantId)
      .maybeSingle();

    if (plantError || !plant || !plant.is_active) {
      return json(req, { error: "plant_not_found" }, 404);
    }

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invitation, error: insertError } = await admin
      .from("invitations")
      .insert({
        token_hash: tokenHash,
        plant_id: plantId,
        target_role: targetRole,
        invitee_name: inviteeName,
        job_role: targetRole === "player" ? body.jobRole : null,
        team_name: body.teamName?.trim() || null,
        created_by: user.id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (insertError) {
      throw insertError;
    }

    await writeAuditLog(admin, {
      actorUserId: user.id,
      plantId,
      action: "invitation.created",
      entityType: "invitation",
      entityId: invitation.id,
      metadata: {
        target_role: targetRole,
        job_role: targetRole === "player" ? body.jobRole : null,
      },
    });

    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) {
      throw new Error("missing_site_url");
    }

    const inviteUrl = new URL(`/i/${token}`, siteUrl).toString();

    return json(req, {
      invitationId: invitation.id,
      inviteUrl,
      expiresAt,
      plantDisplayName: plant.display_name,
    }, 201);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    const status = message === "unauthorized" ? 401 : 500;
    return json(req, { error: message }, status);
  }
});
