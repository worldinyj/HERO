import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) {
    return client;
  }

  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}

function safeAppPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export async function signInWithKakao(returnPath = "/"): Promise<void> {
  const supabase = getSupabase();
  const safeReturnPath = safeAppPath(returnPath);
  const redirectTo = new URL(safeReturnPath, window.location.origin).toString();

  if (import.meta.env.VITE_E2E_MODE === "true") {
    const email = window.sessionStorage.getItem("hero:e2e-email");
    const password = window.sessionStorage.getItem("hero:e2e-password");

    if (!email || !password) {
      throw new Error("E2E 테스트 계정이 설정되지 않았습니다.");
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Match the real OAuth round trip: persist the session first, then load
    // the requested app route from a fresh document.
    window.location.assign(redirectTo);
    return;
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo },
  });

  if (error) {
    throw error;
  }
}
