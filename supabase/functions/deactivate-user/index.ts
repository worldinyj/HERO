import { handleOptions, json } from "../_shared/http.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

interface DeactivateBody {
  userId?: string;
  reason?: string;
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
    const body = (await req.json()) as DeactivateBody;
    const targetUserId = body.userId?.trim();
    const reason = body.reason?.trim() || "manager_deactivation";

    if (!targetUserId) {
      return json(req, { error: "user_id_required" }, 400);
    }

    if (profile.role !== "admin" && profile.role !== "plant_manager") {
      return json(req, { error: "forbidden" }, 403);
    }

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, plant_id, role, real_name, nickname, is_active")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetError || !target) {
      return json(req, { error: "target_not_found" }, 404);
    }

    if (target.role !== "player") {
      return json(req, { error: "only_player_can_be_deactivated_here" }, 409);
    }

    if (
      profile.role === "plant_manager" &&
      (!profile.plant_id || target.plant_id !== profile.plant_id)
    ) {
      return json(req, { error: "manager_scope_violation" }, 403);
    }

    if (!target.is_active) {
      return json(req, { deactivated: true, alreadyInactive: true });
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (updateError) throw updateError;

    const { error: sessionError } = await admin
      .from("play_sessions")
      .update({
        status: "abandoned",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", targetUserId)
      .eq("status", "in_progress");

    if (sessionError) throw sessionError;

    const { error: auditError } = await admin
      .from("audit_logs")
      .insert({
        actor_user_id: user.id,
        plant_id: target.plant_id,
        action: "profile.deactivated",
        entity_type: "profile",
        entity_id: targetUserId,
        metadata: {
          reason,
          target_role: target.role,
          target_nickname: target.nickname,
        },
      });

    if (auditError) throw auditError;

    return json(req, {
      deactivated: true,
      userId: targetUserId,
      displayName: target.real_name,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    const status = message === "unauthorized" ? 401 : 500;
    return json(req, { error: message }, status);
  }
});
