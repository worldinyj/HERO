import { sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { guardRateLimit, requestFingerprint } from "../_shared/rateLimit.ts";
import { adminClient } from "../_shared/supabase.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const body = await readJsonObject(req);
    const token = body?.token;
    if (typeof token !== "string" || token.length < 20) {
      return json(req, { error: "invalid_token" }, 400);
    }

    const admin = adminClient();

    const sourceLimited = await guardRateLimit(req, admin, {
      scope: "peek-invite:source",
      subject: requestFingerprint(req),
      limit: 60,
      windowSeconds: 600,
    });
    if (sourceLimited) return sourceLimited;

    const tokenHash = await sha256Hex(token);
    const tokenLimited = await guardRateLimit(req, admin, {
      scope: "peek-invite:token",
      subject: tokenHash,
      limit: 10,
      windowSeconds: 600,
    });
    if (tokenLimited) return tokenLimited;

    const { data, error } = await admin
      .from("invitations")
      .select("id, invitee_name, target_role, job_role, team_name, expires_at, canceled_at, accepted_at, plant_invitation_epoch, plants!inner(display_name, is_active, invitation_epoch)")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error || !data) {
      return json(req, { error: "invitation_not_found" }, 404);
    }

    const plant = Array.isArray(data.plants) ? data.plants[0] : data.plants;
    const now = Date.now();
    const expired = new Date(data.expires_at).getTime() <= now;

    const revoked = Boolean(plant && data.plant_invitation_epoch !== plant.invitation_epoch);
    if (data.canceled_at || data.accepted_at || expired || !plant?.is_active || revoked) {
      return json(req, {
        valid: false,
        reason: data.canceled_at
          ? "canceled"
          : data.accepted_at
            ? "already_used"
            : expired
              ? "expired"
              : !plant?.is_active
                ? "plant_inactive"
                : "plant_invitation_revoked",
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
