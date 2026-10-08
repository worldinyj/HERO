import { handleOptions, json } from "../_shared/http.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { isUuid } from "../_shared/uuid.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";
import { validateNickname } from "../_shared/nickname.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import {
  adminClient,
  requireActiveProfile,
  requireUser,
} from "../_shared/supabase.ts";

type Action = "check" | "status" | "change-self" | "force-reset";

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
  const limited = await guardRateLimit(req, admin, {
    scope: "nickname:check",
    subject: user.id,
    limit: 120,
    windowSeconds: 300,
  });
  if (limited) return limited;

  const result = await validateNickname(admin, rawNickname, user.id);

  return json(req, {
    available: result.valid,
    nickname: result.nickname,
    error: result.error ?? null,
  });
}

async function nicknameStatus(req: Request) {
  const admin = adminClient();
  const { user, profile } = await requireActiveProfile(req, admin);
  const limited = await guardRateLimit(req, admin, {
    scope: "nickname:status",
    subject: user.id,
    limit: 120,
    windowSeconds: 300,
  });
  if (limited) return limited;

  if (profile.role !== "player") {
    return json(req, {
      canChange: false,
      resetRequired: false,
      changedThisSeason: false,
      seasonKey: null,
      reason: "player_role_required",
    });
  }

  const season = await currentSeason(admin);
  if (!season) {
    return json(req, {
      canChange: false,
      resetRequired: Boolean(profile.nickname_reset_required),
      changedThisSeason: false,
      seasonKey: null,
      reason: "no_open_season",
    });
  }

  const { data: existingChange, error } = await admin
    .from("nickname_change_events")
    .select("id")
    .eq("user_id", user.id)
    .eq("season_id", season.id)
    .eq("event_type", "self_change")
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const changedThisSeason = Boolean(existingChange);
  const resetRequired = Boolean(profile.nickname_reset_required);

  return json(req, {
    canChange: resetRequired || !changedThisSeason,
    resetRequired,
    changedThisSeason,
    seasonKey: season.season_key,
    seasonTitle: season.title,
    nickname: profile.nickname,
  });
}

async function changeSelf(req: Request, rawNickname: string) {
  const admin = adminClient();
  const { user, profile } = await requireActiveProfile(req, admin);
  const limited = await guardRateLimit(req, admin, {
    scope: "nickname:change-self",
    subject: user.id,
    limit: 10,
    windowSeconds: 600,
  });
  if (limited) return limited;

  if (profile.role !== "player") {
    return json(req, { error: "player_role_required" }, 403);
  }

  const validation = await validateNickname(admin, rawNickname, user.id);
  if (!validation.valid) {
    return json(req, { error: validation.error }, 409);
  }

  // The database repeats validation, locks the current player profile,
  // enforces the season quota and writes profile/history/audit atomically.
  const { data, error } = await admin.rpc("change_nickname_self_atomic", {
    p_user_id: user.id,
    p_nickname: validation.nickname,
  });
  if (error) {
    if (error.code === "23505") {
      return json(req, { error: "nickname_taken" }, 409);
    }
    throw new Error(error.message);
  }

  const result = data as {
    changed?: boolean;
    nickname?: string;
    seasonKey?: string;
    resetRequired?: boolean;
  } | null;

  if (
    !result ||
    typeof result.changed !== "boolean" ||
    typeof result.nickname !== "string" ||
    typeof result.seasonKey !== "string" ||
    typeof result.resetRequired !== "boolean"
  ) {
    throw new Error("nickname_change_outcome_unknown");
  }

  return json(req, result);
}

async function forceReset(req: Request, profileId: string) {
  const admin = adminClient();
  const { user, profile } = await requireActiveProfile(req, admin);
  const limited = await guardRateLimit(req, admin, {
    scope: "nickname:force-reset",
    subject: user.id,
    limit: 30,
    windowSeconds: 600,
  });
  if (limited) return limited;

  if (profile.role !== "plant_manager" || !profile.plant_id) {
    return json(req, { error: "plant_manager_required" }, 403);
  }

  // PostgreSQL re-authorizes the actor/plant and serializes resets on
  // the target profile. The event and audit either commit together or roll back.
  const { data, error } = await admin.rpc("force_reset_nickname_atomic", {
    p_actor_user_id: user.id,
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message);

  const result = data as {
    reset?: boolean;
    profileId?: string;
    nickname?: string;
    resetRequired?: boolean;
  } | null;
  if (
    result?.reset !== true ||
    result.profileId !== profileId ||
    typeof result.nickname !== "string" ||
    result.resetRequired !== true
  ) {
    throw new Error("nickname_reset_outcome_unknown");
  }

  return json(req, result);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const parsed = await readJsonObject(req);
    if (!parsed) return json(req, { error: "invalid_request" }, 400);
    const body = parsed as RequestBody;

    if (body.action === "check") {
      if (typeof body.nickname !== "string" || body.nickname.trim() === "") {
        return json(req, { error: "nickname_required" }, 400);
      }
      return await checkNickname(req, body.nickname);
    }

    if (body.action === "status") {
      return await nicknameStatus(req);
    }

    if (body.action === "change-self") {
      if (typeof body.nickname !== "string" || body.nickname.trim() === "") {
        return json(req, { error: "nickname_required" }, 400);
      }
      return await changeSelf(req, body.nickname);
    }

    if (body.action === "force-reset") {
      if (!isUuid(body.profileId)) {
        return json(req, { error: "profile_id_required" }, 400);
      }
      return await forceReset(req, body.profileId);
    }

    return json(req, { error: "unknown_action" }, 400);
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
