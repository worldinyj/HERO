import {
  ScenarioSchema,
  validateScenarioGraph,
  type Scenario,
} from "@hero/schema";
import { handleOptions, json } from "../_shared/http.ts";
import { adminClient, requireActiveProfile } from "../_shared/supabase.ts";

type ScenarioStatus = "draft" | "review" | "approved" | "published" | "archived";

type RequestBody =
  | { action?: "list" }
  | { action: "upload"; scenario?: unknown }
  | { action: "set-status"; scenarioVersionId?: string; status?: ScenarioStatus };

const TRANSITIONS: Record<ScenarioStatus, ScenarioStatus[]> = {
  draft: ["review", "archived"],
  review: ["draft", "approved", "archived"],
  approved: ["review", "published", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

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

  await admin.from("audit_logs").insert({
    actor_user_id: userId,
    action: "scenario.version_uploaded",
    entity_type: "scenario_version",
    entity_id: version.id,
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
) {
  const { data: current, error: currentError } = await admin
    .from("scenario_versions")
    .select("id, scenario_id, version, status")
    .eq("id", scenarioVersionId)
    .maybeSingle();

  if (currentError || !current) {
    throw new Error("scenario_version_not_found");
  }

  const currentStatus = current.status as ScenarioStatus;
  if (!TRANSITIONS[currentStatus].includes(targetStatus)) {
    throw new Error(`invalid_status_transition:${currentStatus}->${targetStatus}`);
  }

  if (targetStatus === "published") {
    const { error: archiveError } = await admin
      .from("scenario_versions")
      .update({ status: "archived" })
      .eq("scenario_id", current.scenario_id)
      .eq("status", "published")
      .neq("id", current.id);

    if (archiveError) throw archiveError;
  }

  const update: Record<string, unknown> = { status: targetStatus };

  if (targetStatus === "approved") {
    update.approved_by = userId;
    update.approved_at = new Date().toISOString();
  }

  if (targetStatus === "published") {
    update.published_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await admin
    .from("scenario_versions")
    .update(update)
    .eq("id", current.id)
    .select("id, version, status, approved_at, published_at")
    .single();

  if (updateError) throw updateError;

  await admin.from("audit_logs").insert({
    actor_user_id: userId,
    action: "scenario.status_changed",
    entity_type: "scenario_version",
    entity_id: current.id,
    metadata: {
      from: currentStatus,
      to: targetStatus,
      version: current.version,
    },
  });

  return updated;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const { admin, user } = await requireAdmin(req);
    const body = (await req.json()) as RequestBody;
    const action = body.action ?? "list";

    if (action === "list") {
      return json(req, { versions: await listVersions(admin) });
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
      if (!body.scenarioVersionId || !body.status) {
        return json(req, { error: "scenario_version_and_status_required" }, 400);
      }

      const updated = await setStatus(
        admin,
        user.id,
        body.scenarioVersionId,
        body.status,
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
          : message === "scenario_version_already_exists"
            ? 409
            : message.startsWith("invalid_status_transition")
              ? 409
              : 500;

    return json(req, { error: message }, status);
  }
});
