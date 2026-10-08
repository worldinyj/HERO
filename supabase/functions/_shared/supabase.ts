import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.117.2";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export async function requireUser(req: Request, admin = adminClient()): Promise<User> {
  const authorization = req.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/iu, "").trim();

  if (!token) {
    throw new Error("unauthorized");
  }

  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("unauthorized");
  }

  return data.user;
}

export type ActiveProfile = {
  id: string;
  plant_id: string | null;
  role: "admin" | "plant_manager" | "player";
  job_role: "sro" | "ro" | "field_operator" | "supervisor" | "worker" | null;
  nickname: string;
  nickname_reset_required: boolean;
  is_active: boolean;
};

export async function requireActiveProfile(
  req: Request,
  admin = adminClient(),
): Promise<{
  user: User;
  profile: ActiveProfile;
}> {
  const user = await requireUser(req, admin);

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, plant_id, role, job_role, nickname, nickname_reset_required, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error("profile_status_unavailable");
  if (!profile || !profile.is_active) {
    throw new Error("inactive_or_missing_profile");
  }

  // The service key bypasses RLS: explicitly enforce plant suspension
  // for every player/manager Edge endpoint, without disabling Admin access.
  if (profile.role !== "admin") {
    if (!profile.plant_id) throw new Error("plant_inactive");
    const { data: plant, error: plantError } = await admin
      .from("plants").select("is_active")
      .eq("id", profile.plant_id).maybeSingle();
    if (plantError) throw new Error("plant_status_unavailable");
    if (!plant || !plant.is_active) throw new Error("plant_inactive");
  }

  return {
    user,
    profile: profile as ActiveProfile,
  };
}
