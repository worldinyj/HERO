import { handleOptions, json } from "../_shared/http.ts";
import { validateNickname } from "../_shared/nickname.ts";
import {
  adminClient,
  requireActiveProfile,
  requireUser,
} from "../_shared/supabase.ts";

type Action = "check" | "change-self" | "force-reset";

interface RequestBody {
  action?: Action;
  nickname?: string;
  profileId?: string;
}

async function currentSeason(admin: ReturnType<typeof adminClient>) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("seasons")
    .select("id, season_key, title")
    .eq("status", "open")
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function checkNickname(req: Request, rawNickname: string) {
  const admin = adminClient();
  const user = await requireUser(req, admin);
  const result = await validateNickname(admin, rawNickname, user.id);

  return json(req, {
    available: result.valid,
    nickname: result.nickname,
    error: result.error ?? null,
  });
}

async function changeSelf(req: Request, rawNickname: string) {
  const admin = adminClient();
  const { user, profile } = await requireActiveProfile(req, admin);

  if (profile.role !== "player") {
    return json(req, { error: "player_role_required" }, 403);
  }

  const season = await currentSeason(admin);
  if (!season) {
    return json(req, { error: "no_open_season" }, 409);
  }

  const validation = await validateNickname(admin, rawNickname, user.id);
  if (!validation.valid) {
    return json(req, { error: validation.error }, 409);
  }

  if (validation.nickname === profile.nickname) {
    return json(req, {
      changed: false,
      nickname: profile.nickname,
      resetRequired: Boolean(profile.nickname_reset_required),
    });
  }

  if (!profile.nickname_reset_required) {
    const { data: existingChange, error: changeError } = await admin
      .from("nickname_change_events")
      .select("id")
      .eq("user_id", user.id)
      .eq("season_id", season.id)
      .eq("event_type", "self_change")
      .limit(1)
      .maybeSingle();

    if (changeError) throw changeError;

    if (existingChange) {
      return json(req, { error: "nickname_change_limit_reached" }, 409);
    }
  }

  const oldNickname = profile.nickname;

  const { error: updateError } = await admin
    .from("profiles")
    .update({
      nickname: validation.nickname,
      nickname_reset_required: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    if (updateError.code === "23505") {
      return json(req, { error: "nickname_taken" }, 409);
    }
    throw updateError;
  }

  await admin.from("nickname_change_events").insert({
    user_id: user.id,
    season_id: season.id,
    actor_user_id: user.id,
    event_type: "self_change",
    old_nickname: oldNickname,
    new_nickname: validation.nickname,
  });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    plant_id: profile.plant_id,
    action: "nickname.changed",
    entity_type: "profile",
    entity_id: user.id,
    metadata: {
      season_id: season.id,
      season_key: season.season_key,
      forced_reset_recovery: Boolean(profile.nickname_reset_required),
    },
  });

  return json(req, {
    changed: true,
    nickname: validation.nickname,
    seasonKey: season.season_key,
    resetRequired: false,
  });
}

async function forceReset(req: Request, profileId: string) {
  const admin = adminClient();
  const { user, profile } = await requireActiveProfile(req, admin);

  if (profile.role !== "plant_manager" || !profile.plant_id) {
    return json(req, { error: "plant_manager_required" }, 403);
  }

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, plant_id, role, nickname")
    .eq("id", profileId)
    .eq("plant_id", profile.plant_id)
    .eq("role", "player")
    .maybeSingle();

  if (targetError || !target) {
    return json(req, { error: "player_not_found" }, 404);
  }

  const season = await currentSeason(admin);
  const oldNickname = target.nickname;
  let resetNickname = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    resetNickname = `PLAYER${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;

    const { error: updateError } = await admin
      .from("profiles")
      .update({
        nickname: resetNickname,
        nickname_reset_required: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    if (!updateError) break;

    if (updateError.code !== "23505" || attempt === 4) {
      throw updateError;
    }
  }

  await admin.from("nickname_change_events").insert({
    user_id: target.id,
    season_id: season?.id ?? null,
    actor_user_id: user.id,
    event_type: "manager_reset",
    old_nickname: oldNickname,
    new_nickname: resetNickname,
  });

  await admin.from("audit_logs").insert({
    actor_user_id: user.id,
    plant_id: profile.plant_id,
    action: "nickname.force_reset",
    entity_type: "profile",
    entity_id: target.id,
    metadata: {
      old_nickname: oldNickname,
      reset_nickname: resetNickname,
      season_id: season?.id ?? null,
    },
  });

  return json(req, {
    reset: true,
    profileId: target.id,
    nickname: resetNickname,
    resetRequired: true,
  });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;

    if (body.action === "check") {
      if (!body.nickname) {
        return json(req, { error: "nickname_required" }, 400);
      }
      return await checkNickname(req, body.nickname);
    }

    if (body.action === "change-self") {
      if (!body.nickname) {
        return json(req, { error: "nickname_required" }, 400);
      }
      return await changeSelf(req, body.nickname);
    }

    if (body.action === "force-reset") {
      if (!body.profileId) {
        return json(req, { error: "profile_id_required" }, 400);
      }
      return await forceReset(req, body.profileId);
    }

    return json(req, { error: "unknown_action" }, 400);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    return json(req, { error: message }, message === "unauthorized" ? 401 : 500);
  }
});
