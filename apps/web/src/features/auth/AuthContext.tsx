import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabase } from "../../lib/supabase";

export type AppRole = "admin" | "plant_manager" | "player";

export interface HeroProfile {
  id: string;
  plant_id: string | null;
  role: AppRole;
  job_role: string | null;
  real_name: string;
  nickname: string;
  is_active: boolean;
  nickname_reset_required: boolean;
}

interface AuthState {
  session: Session | null;
  profile: HeroProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<HeroProfile | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, plant_id, role, job_role, real_name, nickname, is_active, nickname_reset_required")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as HeroProfile | null) ?? null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<HeroProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) {
      setProfile(null);
      return;
    }

    setProfile(await loadProfile(session.user.id));
  }, [session?.user.id]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);

      if (data.session?.user.id) {
        try {
          setProfile(await loadProfile(data.session.user.id));
        } catch {
          setProfile(null);
        }
      }

      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (!nextSession?.user.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      queueMicrotask(() => {
        void loadProfile(nextSession.user.id)
          .then((nextProfile) => setProfile(nextProfile))
          .catch(() => setProfile(null))
          .finally(() => setLoading(false));
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, refreshProfile, signOut }),
    [session, profile, loading, refreshProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
