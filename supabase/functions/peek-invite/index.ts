import { sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const { token } = (await req.json()) as { token?: string };

    if (!token || token.length < 20) {
      return json(req, { error: "invalid_token" }, 400);
    }

    const admin = adminClient();
    const tokenHash = await sha256Hex(token);

    const { data, error } = await admin
      .from("invitations")
      .select("id, invitee_name, target_role, job_role, team_name, expires_at, canceled_at, accepted_at, plants!inner(display_name, is_active)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) {
      return json(req, { error: "invitation_not_found" }, 404);
    }

    const plant = Array.isArray(data.plants) ? data.plants[0] : data.plants;
    const now = Date.now();
    const expired = new Date(data.expires_at).getTime() <= now;

    if (data.canceled_at || data.accepted_at || expired || !plant?.is_active) {
      return json(req, {
        valid: false,
        reason: data.canceled_at
          ? "canceled"
          : data.accepted_at
            ? "already_used"
            : expired
              ? "expired"
              : "plant_inactive",
      });
    }

    return json(req, {
      valid: true,
      invitationId: data.id,
      inviteeName: data.invitee_name,
      targetRole: data.target_role,
      jobRole: data.job_role,
      teamName: data.team_name,
      plantDisplayName: plant.display_name,
      expiresAt: data.expires_at,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    return json(req, { error: message }, 500);
  }
});
