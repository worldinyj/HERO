import { writeAuditLog } from "../_shared/audit.ts";
import {
  ScenarioSchema,
  validateScenarioGraph,
  type Scenario,
} from "@hero/schema";
import { handleOptions, json } from "../_shared/http.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";
import { isUuid } from "../_shared/uuid.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";

type ScenarioStatus = "draft" | "review" | "approved" | "published" | "archived";

interface RequestBody {
  action?: "list" | "preview" | "upload" | "set-status" | "season-overview" | "set-season-scenario";
  scenario?: unknown;
  scenarioVersionId?: string;
  status?: ScenarioStatus;
  expectedStatus?: ScenarioStatus;
  seasonId?: string;
  scenarioId?: string;
  versionId?: string | null;
  expectedRevision?: string;
}

const STATUSES: readonly string[] = ["draft", "review", "approved", "published", "archived"];

async function requireAdmin(req: Request) {
  const admin = adminClient();
  const auth = await requireActiveProfile(req, admin);

  if (auth.profile.role !== "admin") {
    throw new Error("admin_required");
  }

  return { admin, user: auth.user, profile: auth.profile };
}

async function listVersions(admin: ReturnType<typeof adminClient>) {
  const { data, error } = await admin
    .from("scenario_versions")
    .select(
      "id, version, status, default_perspective_role, approved_at, published_at, created_at, scenarios!inner(id, slug, title, is_active, is_competitive)",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function saveScenario(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  scenario: Scenario,
  warnings: ReturnType<typeof validateScenarioGraph>,
) {
  const { data: existingScenario, error: lookupError } = await admin
    .from("scenarios")
    .select("id")
    .eq("slug", scenario.id)
    .maybeSingle();

  if (lookupError) throw lookupError;

  let scenarioId = existingScenario?.id as string | undefined;

  if (scenarioId) {
    const { error: updateError } = await admin
      .from("scenarios")
      .update({
        title: scenario.title,
        is_active: true,
      })
      .eq("id", scenarioId);

    if (updateError) throw updateError;
  } else {
    const { data: created, error: createError } = await admin
      .from("scenarios")
      .insert({
        slug: scenario.id,
        title: scenario.title,
        is_competitive: scenario.id !== "s00_tutorial",
        is_active: true,
      })
      .select("id")
      .single();

    if (createError || !created) {
      throw createError ?? new Error("scenario_create_failed");
    }

    scenarioId = created.id;
  }

  const { data: version, error: versionError } = await admin
    .from("scenario_versions")
    .insert({
      scenario_id: scenarioId,
      version: scenario.version,
      status: "draft",
      default_perspective_role: scenario.defaultPerspectiveRole,
      content: scenario,
    })
    .select("id, version, status, created_at")
    .single();

  if (versionError) {
    if (versionError.code === "23505") {
      throw new Error("scenario_version_already_exists");
    }
    throw versionError;
  }

  await writeAuditLog(admin, {
    actorUserId: userId,
    action: "scenario.version_uploaded",
    entityType: "scenario_version",
    entityId: version.id,
    metadata: {
      scenario_slug: scenario.id,
      version: scenario.version,
      warnings: warnings
        .filter((issue) => issue.severity === "warning")
        .map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        })),
    },
  });

  return version;
}

async function setStatus(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  scenarioVersionId: string,
  targetStatus: ScenarioStatus,
  expectedStatus?: ScenarioStatus,
) {
  const { data: current, error: currentError } = await admin
    .from("scenario_versions")
    .select("id, status, content")
    .eq("id", scenarioVersionId)
    .maybeSingle();
  if (currentError) throw new Error("scenario_status_unavailable");
  if (!current) throw new Error("scenario_version_not_found");
  if (expectedStatus !== undefined && current.status !== expectedStatus) {
    throw new Error("scenario_status_conflict");
  }
  if (targetStatus === "approved" || targetStatus === "published") {
    const parsed = ScenarioSchema.safeParse(current.content);
    if (!parsed.success || validateScenarioGraph(parsed.data).some(issue => issue.severity === "error")) {
      throw new Error("scenario_content_invalid");
    }
    if (targetStatus === "published" && parsed.data.id !== "s00_tutorial" && !parsed.data.incidentDebrief) {
      throw new Error("scenario_incident_debrief_required");
    }
  }
  // Older cached clients omit expectedStatus. Even those requests use the
  // read snapshot as a compare-and-set guard inside the locked transaction.
  const { data, error } = await admin.rpc("set_scenario_status_atomic", {
    p_actor_user_id: userId,
    p_version_id: scenarioVersionId,
    p_expected_status: expectedStatus ?? current.status,
    p_target_status: targetStatus,
    p_expected_content: current.content,
  });
  if (error) {
    const domainErrors = ["admin_required", "scenario_version_not_found", "scenario_status_conflict",
      "scenario_content_conflict", "invalid_status_transition", "scenario_content_invalid",
      "scenario_incident_debrief_required"];
    throw new Error(error.code === "P0001" && domainErrors.includes(error.message)
      ? error.message : "scenario_status_unavailable");
  }
  return data;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const { admin, user } = await requireAdmin(req);
    const raw = await readJsonObject(req);
    if (!raw) return json(req, { error: "invalid_request" }, 400);
    const body = raw as RequestBody;
    const action = body.action ?? "list";
    const isRead = action === "list" || action === "preview" || action === "season-overview";
    const limited = await guardRateLimit(req, admin, {
      scope: `admin-scenario:${action}`,
      subject: user.id,
      limit: isRead ? 120 : 30,
      windowSeconds: isRead ? 300 : 600,
    });
    if (limited) return limited;

    if (action === "list") {
      return json(req, { versions: await listVersions(admin) });
    }

    if (action === "season-overview") {
      const { data, error } = await admin.rpc("admin_season_scenario_overview", { p_actor_user_id: user.id });
      if (error) return json(req, { error: error.code === "P0001" && error.message === "admin_required" ? "admin_required" : "season_overview_unavailable" }, error.code === "P0001" && error.message === "admin_required" ? 403 : 500);
      return json(req, data);
    }

    if (action === "set-season-scenario") {
      if (!isUuid(body.seasonId) || !isUuid(body.scenarioId) ||
          (body.versionId !== null && !isUuid(body.versionId)) ||
          typeof body.expectedRevision !== "string" || !/^[0-9a-f]{32}$/.test(body.expectedRevision)) {
        return json(req, { error: "invalid_request" }, 400);
      }
      const { data, error } = await admin.rpc("set_season_scenario_atomic", {
        p_actor_user_id: user.id, p_season_id: body.seasonId, p_scenario_id: body.scenarioId,
        p_version_id: body.versionId, p_expected_revision: body.expectedRevision,
      });
      if (error) {
        const domain: Record<string, number> = { admin_required: 403, scenario_not_found: 404,
          season_no_longer_open: 409, season_binding_conflict: 409, scenario_not_eligible: 409,
          scenario_version_not_published: 409, binding_no_change: 409 };
        const known = error.code === "P0001" && Object.hasOwn(domain, error.message);
        return json(req, { error: known ? error.message : "season_binding_unavailable" }, known ? domain[error.message] : 500);
      }
      return json(req, data);
    }

    if (action === "preview") {
      if (!isUuid(body.scenarioVersionId)) return json(req, { error: "invalid_request" }, 400);
      const { data, error } = await admin.from("scenario_versions")
        .select("id, content").eq("id", body.scenarioVersionId).maybeSingle();
      if (error) return json(req, { error: "scenario_preview_unavailable" }, 500);
      if (!data) return json(req, { error: "scenario_version_not_found" }, 404);
      return json(req, { preview: true, scenarioVersionId: data.id, scenario: data.content });
    }

    if (action === "upload") {
      const parsed = ScenarioSchema.safeParse(body.scenario);
      if (!parsed.success) {
        return json(
          req,
          {
            error: "scenario_schema_invalid",
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          400,
        );
      }

      const graphIssues = validateScenarioGraph(parsed.data);
      const graphErrors = graphIssues.filter((issue) => issue.severity === "error");

      if (graphErrors.length > 0) {
        return json(
          req,
          {
            error: "scenario_graph_invalid",
            issues: graphErrors,
          },
          400,
        );
      }

      const version = await saveScenario(
        admin,
        user.id,
        parsed.data,
        graphIssues,
      );

      return json(
        req,
        {
          saved: true,
          version,
          warnings: graphIssues.filter((issue) => issue.severity === "warning"),
        },
        201,
      );
    }

    if (action === "set-status") {
      if (!isUuid(body.scenarioVersionId) || !STATUSES.includes(body.status ?? "") ||
          (body.expectedStatus !== undefined && !STATUSES.includes(body.expectedStatus))) {
        return json(req, { error: "scenario_version_and_status_required" }, 400);
      }

      const updated = await setStatus(
        admin,
        user.id,
        body.scenarioVersionId,
        body.status!,
        body.expectedStatus,
      );

      return json(req, { updated: true, version: updated });
    }

    return json(req, { error: "unknown_action" }, 400);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    const status =
      message === "unauthorized"
        ? 401
        : message === "admin_required"
          ? 403
          : message === "scenario_version_not_found"
            ? 404
          : message === "scenario_version_already_exists"
            ? 409
            : message === "scenario_status_conflict" ||
                message === "scenario_content_conflict" ||
                message === "scenario_incident_debrief_required" ||
                message === "scenario_content_invalid" ||
                message.startsWith("invalid_status_transition")
              ? 409
              : 500;

    return json(req, { error: message }, status);
  }
});
