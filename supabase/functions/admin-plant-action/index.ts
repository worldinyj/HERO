import { handleOptions, json } from "../_shared/http.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";
import { isUuid } from "../_shared/uuid.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const admin = adminClient();
    const { user, profile } = await requireActiveProfile(req, admin);
    if (profile.role !== "admin") {
      return json(req, { error: "admin_required" }, 403);
    }
    const body = await readJsonObject(req);
    if (!body) return json(req, { error: "invalid_request" }, 400);
    if (body.action !== "create-plant" && body.action !== "set-plant-active") {
      return json(req, { error: "unknown_action" }, 400);
    }

    const limited = await guardRateLimit(req, admin, {
      scope: `admin-plant-action:${body.action}`,
      subject: user.id, limit: 40, windowSeconds: 600,
    });
    if (limited) return limited;

    if (body.action === "create-plant") {
      if (
        typeof body.code !== "string" ||
        typeof body.name !== "string" ||
        typeof body.displayName !== "string" ||
        !/^[A-Z0-9_-]{1,20}$/.test(body.code.trim().toUpperCase()) ||
        !body.name.trim() || body.name.trim().length > 100 ||
        !body.displayName.trim() || body.displayName.trim().length > 100
      ) return json(req, { error: "invalid_request" }, 400);

      const { data, error } = await admin.rpc("create_plant_atomic", {
        p_actor_user_id: user.id,
        p_code: body.code.trim(),
        p_name: body.name.trim(),
        p_display_name: body.displayName.trim(),
      });
      if (error) throw new Error(error.message);
      const result = data as {
        created?: boolean; plantId?: string; code?: string;
        displayName?: string; isActive?: boolean;
      } | null;
      if (
        result?.created !== true || !isUuid(result.plantId) ||
        result.code !== body.code.trim().toUpperCase() ||
        result.displayName !== body.displayName.trim() || result.isActive !== true
      ) throw new Error("plant_creation_outcome_unknown");
      return json(req, result, 201);
    }

    if (!isUuid(body.plantId) || typeof body.isActive !== "boolean") {
      return json(req, { error: "invalid_request" }, 400);
    }

    const { data, error } = await admin.rpc("set_plant_active_atomic", {
      p_actor_user_id: user.id,
      p_plant_id: body.plantId,
      p_is_active: body.isActive,
    });
    if (error) throw new Error(error.message);
    const result = data as {
      changed?: boolean; plantId?: string; isActive?: boolean;
    } | null;
    if (!result || typeof result.changed !== "boolean" ||
        result.plantId !== body.plantId || result.isActive !== body.isActive) {
      throw new Error("plant_status_outcome_unknown");
    }
    return json(req, result);
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
