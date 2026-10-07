import { handleOptions, json } from "../_shared/http.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

interface StartSessionBody {
  scenarioId?: string;
  replayOf?: string;
  replayFromNode?: string;
}

function nowIso(): string {
  return new Date().toISOString();
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
    const body = (await req.json()) as StartSessionBody;
    const scenarioSlug = body.scenarioId?.trim();

    if (profile.role !== "player") {
      return json(req, { error: "player_role_required" }, 403);
    }

    if (!profile.plant_id || !scenarioSlug || !profile.job_role) {
      return json(req, { error: "profile_or_scenario_incomplete" }, 400);
    }

    const now = nowIso();

    const { data: season, error: seasonError } = await admin
      .from("seasons")
      .select("id, season_key, starts_at, ends_at")
      .eq("status", "open")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seasonError || !season) {
      return json(req, { error: "no_open_season" }, 409);
    }

    const { data: scenario, error: scenarioError } = await admin
      .from("scenarios")
      .select("id, slug, title, is_active, is_competitive")
      .eq("slug", scenarioSlug)
      .eq("is_active", true)
      .eq("is_competitive", true)
      .maybeSingle();

    if (scenarioError || !scenario) {
      return json(req, { error: "competitive_scenario_not_found" }, 404);
    }

    const { data: version, error: versionError } = await admin
      .from("scenario_versions")
      .select("id, version, content, default_perspective_role")
      .eq("scenario_id", scenario.id)
      .eq("status", "published")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError || !version) {
      return json(req, { error: "published_scenario_version_not_found" }, 404);
    }

    const { data: seasonScenario, error: seasonScenarioError } = await admin
      .from("season_scenarios")
      .select("simulation_seed")
      .eq("season_id", season.id)
      .eq("scenario_version_id", version.id)
      .eq("is_active", true)
      .maybeSingle();

    if (seasonScenarioError || !seasonScenario) {
      return json(req, { error: "scenario_not_enabled_for_season" }, 409);
    }

    const { data: existing } = await admin
      .from("play_sessions")
      .select("id, simulation_seed, presentation_seed, replay_of, replay_from_node, started_at")
      .eq("user_id", user.id)
      .eq("scenario_version_id", version.id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (existing) {
      return json(req, {
        resumed: true,
        sessionId: existing.id,
        seasonId: season.id,
        seasonKey: season.season_key,
        scenarioId: scenario.slug,
        scenarioVersionId: version.id,
        scenarioVersion: version.version,
        scenario: version.content,
        simulationSeed: existing.simulation_seed,
        presentationSeed: existing.presentation_seed,
        perspectiveRole: version.default_perspective_role,
        startedAt: existing.started_at,
      });
    }

    if (body.replayOf) {
      const { data: sourceReplay, error: replayError } = await admin
        .from("play_sessions")
        .select("id, user_id, scenario_version_id, status")
        .eq("id", body.replayOf)
        .maybeSingle();

      if (
        replayError ||
        !sourceReplay ||
        sourceReplay.user_id !== user.id ||
        sourceReplay.scenario_version_id !== version.id ||
        sourceReplay.status !== "completed"
      ) {
        return json(req, { error: "invalid_replay_source" }, 409);
      }
    }

    const presentationSeed = crypto.randomUUID();

    const { data: created, error: createError } = await admin
      .from("play_sessions")
      .insert({
        user_id: user.id,
        plant_id: profile.plant_id,
        player_job_role: profile.job_role,
        perspective_role: version.default_perspective_role,
        season_id: season.id,
        scenario_version_id: version.id,
        simulation_seed: seasonScenario.simulation_seed,
        presentation_seed: presentationSeed,
        replay_of: body.replayOf ?? null,
        replay_from_node: body.replayFromNode?.trim() || null,
        status: "in_progress",
      })
      .select("id, started_at")
      .single();

    if (createError || !created) {
      if (createError?.code === "23505") {
        return json(req, { error: "session_start_race_retry" }, 409);
      }
      throw createError ?? new Error("session_create_failed");
    }

    return json(req, {
      resumed: false,
      sessionId: created.id,
      seasonId: season.id,
      seasonKey: season.season_key,
      scenarioId: scenario.slug,
      scenarioVersionId: version.id,
      scenarioVersion: version.version,
      scenario: version.content,
      simulationSeed: seasonScenario.simulation_seed,
      presentationSeed,
      perspectiveRole: version.default_perspective_role,
      startedAt: created.started_at,
    }, 201);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    const status = message === "unauthorized" ? 401 : 500;
    return json(req, { error: message }, status);
  }
});
