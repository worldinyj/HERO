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

export async function requireActiveProfile(
  req: Request,
  admin = adminClient(),
): Promise<{
  user: User;
  profile: {
    id: string;
    plant_id: string | null;
    role: "admin" | "plant_manager" | "player";
    is_active: boolean;
  };
}> {
  const user = await requireUser(req, admin);

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, plant_id, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile || !profile.is_active) {
    throw new Error("inactive_or_missing_profile");
  }

  return {
    user,
    profile: profile as {
      id: string;
      plant_id: string | null;
      role: "admin" | "plant_manager" | "player";
      is_active: boolean;
    },
  };
}
