import { randomToken, sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { buildInviteUrl } from "../_shared/inviteUrl.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
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
    const limited = await guardRateLimit(req, admin, {
      scope: "create-invite",
      subject: user.id,
      limit: 30,
      windowSeconds: 600,
    });
    if (limited) return limited;

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
    // Validate SITE_URL and construct the one-time link BEFORE inserting the
    // invitation. A missing/bad URL must never create an unrecoverable token.
    const inviteUrl = buildInviteUrl(Deno.env.get("SITE_URL"), token);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // DB authorization is checked again inside this service-role-only RPC.
    // A failed audit write rolls back the invitation INSERT.
    const { data: invitation, error: issueError } = await admin.rpc(
      "create_invitation_atomic",
      {
        p_actor_user_id: user.id,
        p_plant_id: plantId,
        p_target_role: targetRole,
        p_invitee_name: inviteeName,
        p_job_role: targetRole === "player" ? body.jobRole : null,
        p_team_name: body.teamName?.trim() || null,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      },
    );
    if (issueError) throw new Error(issueError.message);

    const issued = invitation as {
      invitationId?: string;
      expiresAt?: string;
      plantDisplayName?: string;
    } | null;
    if (
      !issued?.invitationId ||
      !issued.expiresAt ||
      !issued.plantDisplayName
    ) {
      // A malformed response may follow a committed issuance.
      throw new Error("invite_creation_outcome_unknown");
    }

    return json(req, {
      invitationId: issued.invitationId,
      inviteUrl,
      expiresAt: issued.expiresAt,
      plantDisplayName: issued.plantDisplayName,
    }, 201);
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
