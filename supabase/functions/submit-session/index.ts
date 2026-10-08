import {
  act,
  createGame,
  evaluate,
  isFinished,
  metricAverage,
} from "@hero/engine";
import { ScenarioSchema } from "@hero/schema";
import { handleOptions, json } from "../_shared/http.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { readCommittedCompletion } from "../_shared/completionReceipt.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";
import { isUuid } from "../_shared/uuid.ts";
import { parseSessionSubmission } from "../_shared/submissionInput.ts";
import { singleLookupOutcome } from "../_shared/lookupOutcome.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

interface StoredDecision {
  action_type: "continue" | "choice" | "info" | "card";
  action_id: string | null;
}

function storedDecisionToAction(decision: StoredDecision): GameAction {
  switch (decision.action_type) {
    case "continue":
      return { type: "continue" };
    case "choice":
      if (!decision.action_id) throw new Error("stored_choice_action_id_missing");
      return { type: "choice", actionId: decision.action_id };
    case "info":
      if (!decision.action_id) throw new Error("stored_info_action_id_missing");
      return { type: "info", actionId: decision.action_id };
    case "card":
      if (!decision.action_id) throw new Error("stored_card_id_missing");
      return { type: "card", cardId: decision.action_id };
  }
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
      scope: "submit-session",
      subject: user.id,
      limit: 60,
      windowSeconds: 300,
    });
    if (limited) return limited;

    const raw = await readJsonObject(req);
    if (!raw) return json(req, { error: "invalid_request" }, 400);
    const body = parseSessionSubmission(raw);
    if (!body || !isUuid(body.sessionId)) {
      return json(req, { error: "invalid_submission" }, 400);
    }
    const sessionId = body.sessionId;
    const submittedActions = body.actions;

    if (profile.role !== "player") {
      return json(req, { error: "player_role_required" }, 403);
    }

    const { data: session, error: sessionError } = await admin
      .from("play_sessions")
      .select("id, user_id, season_id, scenario_version_id, simulation_seed, presentation_seed, replay_of, replay_from_node, status, ending, hp_point, score_rule_version, evaluation")
      .eq("id", sessionId)
      .maybeSingle();

    const sessionOutcome = singleLookupOutcome(session, sessionError);
    if (sessionOutcome === "failed") throw new Error("session_lookup_unavailable");
    if (!session) {
      return json(req, { error: "session_not_found" }, 404);
    }

    if (session.user_id !== user.id) {
      return json(req, { error: "session_owner_mismatch" }, 403);
    }

    if (session.status === "completed") {
      return json(req, {
        alreadyCompleted: true,
        sessionId: session.id,
        ending: session.ending,
        hpPoint: session.hp_point,
        scoreRuleVersion: session.score_rule_version,
        evaluation: session.evaluation,
      });
    }

    if (session.status !== "in_progress") {
      return json(req, { error: "session_not_in_progress" }, 409);
    }

    const { data: version, error: versionError } = await admin
      .from("scenario_versions")
      .select("id, scenario_id, content")
      .eq("id", session.scenario_version_id)
      .maybeSingle();

    const versionOutcome = singleLookupOutcome(version, versionError);
    if (versionOutcome === "failed") throw new Error("scenario_version_lookup_unavailable");
    if (!version) {
      return json(req, { error: "scenario_version_not_found" }, 404);
    }

    const parsed = ScenarioSchema.safeParse(version.content);
    if (!parsed.success) {
      return json(req, { error: "stored_scenario_schema_invalid" }, 500);
    }

    let state = createGame(parsed.data, {
      simulationSeed: session.simulation_seed,
      presentationSeed: session.presentation_seed,
    });

    try {
      if (session.replay_of || session.replay_from_node) {
        if (!session.replay_of || !session.replay_from_node) {
          return json(req, { error: "invalid_replay_session_metadata" }, 409);
        }

        const { data: sourceDecisions, error: sourceDecisionError } = await admin
          .from("session_decisions")
          .select("action_type, action_id")
          .eq("session_id", session.replay_of)
          .order("seq", { ascending: true });

        if (sourceDecisionError) {
          throw sourceDecisionError;
        }

        for (const decision of (sourceDecisions ?? []) as StoredDecision[]) {
          if (state.nodeId === session.replay_from_node) {
            break;
          }

          state = act(parsed.data, state, storedDecisionToAction(decision));
        }

        if (state.nodeId !== session.replay_from_node) {
          return json(req, { error: "replay_target_not_reachable" }, 409);
        }
      }

      for (const submitted of submittedActions) {
        state = act(parsed.data, state, submitted);
      }
    } catch {
      // Engine exceptions can contain internal graph identifiers or stored
      // scenario details; clients get a stable rejection without that data.
      return json(req, { error: "action_log_rejected" }, 409);
    }

    if (!isFinished(parsed.data, state)) {
      return json(req, { error: "scenario_not_finished" }, 409);
    }

    const { data: previousSessions, error: previousError } = await admin
      .from("play_sessions")
      .select("metrics")
      .eq("user_id", user.id)
      .eq("season_id", session.season_id)
      .eq("scenario_version_id", session.scenario_version_id)
      .eq("status", "completed");

    if (previousError) {
      throw previousError;
    }

    const previousMetricAverages = (previousSessions ?? [])
      .map((item) => item.metrics)
      .filter((metrics): metrics is Record<string, number> =>
        Boolean(metrics) && typeof metrics === "object"
      )
      .map((metrics) => {
        const values = Object.values(metrics).filter(
          (value): value is number => typeof value === "number",
        );
        return values.length === 0
          ? 0
          : values.reduce((sum, value) => sum + value, 0) / values.length;
      });

    const previousBestMetricAvg =
      session.replay_of && previousMetricAverages.length > 0
        ? Math.max(...previousMetricAverages)
        : undefined;

    const evaluation = evaluate(parsed.data, state, {
      reflectionAnswered: body.reflectionAnswered === true,
      swissCheeseViewed: body.swissCheeseViewed === true,
      ...(previousBestMetricAvg === undefined
        ? {}
        : { previousBestMetricAvg }),
    });

    const userDecisions = state.log
      .filter((entry) => entry.actionType !== "hazard_check")
      .map((entry) => ({
        seq: entry.step,
        node_id: entry.nodeId,
        action_type: entry.actionType,
        action_id: entry.actionId ?? "",
        clock_before: entry.clockBefore,
        clock_after: entry.clockAfter,
      }));

    const { data: completed, error: completionError } = await admin.rpc(
      "complete_play_session_atomic",
      {
        p_session_id: session.id,
        p_user_id: user.id,
        p_ending: evaluation.ending,
        p_metrics: evaluation.metrics,
        p_hp_point: evaluation.hpPoint,
        p_score_rule_version: evaluation.scoreRuleVersion,
        p_evaluation: evaluation,
        p_decisions: userDecisions,
      },
    );

    if (completionError) {
      throw completionError;
    }
    // The DB transaction may report a concurrent winner. Never return this
    // request's calculated evaluation when another result was committed.
    const committed = readCommittedCompletion(completed, session.id);
    if (!committed) throw new Error("session_completion_result_unknown");

    return json(req, {
      alreadyCompleted: committed.alreadyCompleted,
      sessionId: committed.sessionId,
      evaluation: committed.evaluation,
      ...(committed.alreadyCompleted
        ? {}
        : { serverMetricAverage: metricAverage(state) }),
    });
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
