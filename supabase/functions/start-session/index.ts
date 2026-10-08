import { handleOptions, json } from "../_shared/http.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";
import { isUuid } from "../_shared/uuid.ts";
import { singleLookupOutcome, listLookupOutcome } from "../_shared/lookupOutcome.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

interface StartSessionBody {
  scenarioId?: string;
  replayOf?: string;
  replayFromNode?: string;
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
      scope: "start-session",
      subject: user.id,
      limit: 30,
      windowSeconds: 300,
    });
    if (limited) return limited;

    const raw = await readJsonObject(req);
    if (!raw) return json(req, { error: "invalid_request" }, 400);
    const body = raw as StartSessionBody;
    const scenarioSlug = typeof body.scenarioId === "string" ? body.scenarioId.trim() : null;
    const replayFromNode = typeof body.replayFromNode === "string" ? body.replayFromNode.trim() : null;
    if (body.replayOf != null && !isUuid(body.replayOf)) {
      return json(req, { error: "invalid_request" }, 400);
    }

    if (profile.role !== "player") {
      return json(req, { error: "player_role_required" }, 403);
    }

    if (!profile.plant_id || !scenarioSlug || !profile.job_role) {
      return json(req, { error: "profile_or_scenario_incomplete" }, 400);
    }

    if (Boolean(body.replayOf) !== Boolean(replayFromNode)) {
      return json(req, { error: "replay_source_and_target_required_together" }, 400);
    }

    const now = new Date().toISOString();

    const { data: season, error: seasonError } = await admin
      .from("seasons")
      .select("id, season_key, starts_at, ends_at")
      .eq("status", "open")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const seasonOutcome = singleLookupOutcome(season, seasonError);
    if (seasonOutcome === "failed") throw new Error("season_lookup_unavailable");
    if (seasonOutcome === "missing") {
      return json(req, { error: "no_open_season" }, 409);
    }

    const { data: scenario, error: scenarioError } = await admin
      .from("scenarios")
      .select("id, slug, title, is_active, is_competitive")
      .eq("slug", scenarioSlug)
      .eq("is_active", true)
      .eq("is_competitive", true)
      .maybeSingle();

    const scenarioOutcome = singleLookupOutcome(scenario, scenarioError);
    if (scenarioOutcome === "failed") throw new Error("scenario_lookup_unavailable");
    if (scenarioOutcome === "missing") {
      return json(req, { error: "competitive_scenario_not_found" }, 404);
    }

    const { data: bindings, error: bindingError } = await admin
      .from("season_scenarios")
      .select("scenario_version_id, simulation_seed")
      .eq("season_id", season.id)
      .eq("is_active", true);

    const bindingOutcome = listLookupOutcome(bindings, bindingError);
    if (bindingOutcome === "failed") throw new Error("scenario_binding_lookup_unavailable");
    if (bindingOutcome === "empty") {
      return json(req, { error: "scenario_not_enabled_for_season" }, 409);
    }

    const boundVersionIds = bindings.map((item) => item.scenario_version_id);

    const { data: version, error: versionError } = await admin
      .from("scenario_versions")
      .select("id, version, content, default_perspective_role")
      .eq("scenario_id", scenario.id)
      .eq("status", "published")
      .in("id", boundVersionIds)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const versionOutcome = singleLookupOutcome(version, versionError);
    if (versionOutcome === "failed") throw new Error("scenario_version_lookup_unavailable");
    if (versionOutcome === "missing") {
      return json(req, { error: "scenario_not_enabled_for_season" }, 409);
    }

    const seasonScenario = bindings.find(
      (item) => item.scenario_version_id === version.id,
    );

    if (!seasonScenario) {
      return json(req, { error: "scenario_seed_missing" }, 500);
    }

    const { data: existing, error: existingError } = await admin
      .from("play_sessions")
      .select("id, simulation_seed, presentation_seed, replay_of, replay_from_node, started_at")
      .eq("user_id", user.id)
      .eq("season_id", season.id)
      .eq("scenario_version_id", version.id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (singleLookupOutcome(existing, existingError) === "failed") {
      throw new Error("existing_session_lookup_unavailable");
    }
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
        replayOf: existing.replay_of,
        replayFromNode: existing.replay_from_node,
        startedAt: existing.started_at,
      });
    }

    if (body.replayOf && replayFromNode) {
      const { data: sourceReplay, error: replayError } = await admin
        .from("play_sessions")
        .select("id, user_id, season_id, scenario_version_id, status")
        .eq("id", body.replayOf)
        .maybeSingle();

      if (singleLookupOutcome(sourceReplay, replayError) === "failed") {
        throw new Error("replay_source_lookup_unavailable");
      }
      if (
        !sourceReplay ||
        sourceReplay.user_id !== user.id ||
        sourceReplay.season_id !== season.id ||
        sourceReplay.scenario_version_id !== version.id ||
        sourceReplay.status !== "completed"
      ) {
        return json(req, { error: "invalid_replay_source" }, 409);
      }

      const { data: replayDecision, error: replayDecisionError } = await admin
        .from("session_decisions")
        .select("id")
        .eq("session_id", sourceReplay.id)
        .eq("node_id", replayFromNode)
        .eq("action_type", "choice")
        .limit(1)
        .maybeSingle();

      const replayDecisionOutcome = singleLookupOutcome(replayDecision, replayDecisionError);
      if (replayDecisionOutcome === "failed") throw new Error("replay_target_lookup_unavailable");
      if (replayDecisionOutcome === "missing") {
        return json(req, { error: "invalid_replay_target" }, 409);
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
        replay_from_node: replayFromNode ?? null,
        status: "in_progress",
      })
      .select("id, started_at")
      .single();

    if (createError || !created) {
      if (createError?.code === "23505") {
        const { data: racedExisting, error: racedExistingError } = await admin
          .from("play_sessions")
          .select(
            "id, simulation_seed, presentation_seed, replay_of, replay_from_node, started_at",
          )
          .eq("user_id", user.id)
          .eq("season_id", season.id)
          .eq("scenario_version_id", version.id)
          .eq("status", "in_progress")
          .maybeSingle();

        if (racedExistingError || !racedExisting) {
          throw racedExistingError ?? new Error("session_start_race_recovery_failed");
        }

        return json(req, {
          resumed: true,
          sessionId: racedExisting.id,
          seasonId: season.id,
          seasonKey: season.season_key,
          scenarioId: scenario.slug,
          scenarioVersionId: version.id,
          scenarioVersion: version.version,
          scenario: version.content,
          simulationSeed: racedExisting.simulation_seed,
          presentationSeed: racedExisting.presentation_seed,
          perspectiveRole: version.default_perspective_role,
          replayOf: racedExisting.replay_of,
          replayFromNode: racedExisting.replay_from_node,
          startedAt: racedExisting.started_at,
        });
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
      replayOf: body.replayOf ?? null,
      replayFromNode: replayFromNode ?? null,
      startedAt: created.started_at,
    }, 201);
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
