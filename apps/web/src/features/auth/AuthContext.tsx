import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getSupabase } from "../../lib/supabase";
import { AuthLoadGate } from "./authLoadGate";

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
  profileLoadError: boolean;
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

  const [profileLoadError, setProfileLoadError] = useState(false);
  const currentUserId = useRef<string | null>(null);
  const requestGate = useRef(new AuthLoadGate());

  const resolveProfile = useCallback(
    async (userId: string, revision: number): Promise<void> => {
      try {
        const nextProfile = await loadProfile(userId);
        if (requestGate.current.isCurrent(revision, userId)) {
          setProfile(nextProfile);
          setProfileLoadError(false);
        }
      } catch (cause) {
        if (requestGate.current.isCurrent(revision, userId)) {
          // An unavailable profile service is not an uninvited user.
          setProfile(null);
          setProfileLoadError(true);
        }
        throw cause;
      } finally {
        if (requestGate.current.isCurrent(revision, userId)) {
          setLoading(false);
        }
      }
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    const userId = currentUserId.current;
    if (!userId) {
      setProfile(null);
      return;
    }

    const revision = requestGate.current.begin(userId);
    setProfile(null);
    setProfileLoadError(false);
    setLoading(true);
    await resolveProfile(userId, revision);
  }, [resolveProfile]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();

    // INITIAL_SESSION arrives through the subscription: a separate
    // getSession() call would race subsequent auth events.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;

      const userId = nextSession?.user.id ?? null;
      const revision = requestGate.current.begin(userId);
      currentUserId.current = userId;
      setSession(nextSession);
      setProfile(null);
      setProfileLoadError(false);

      if (!userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      // Do not await Supabase requests within the auth callback.
      queueMicrotask(() => {
        if (!active || !requestGate.current.isCurrent(revision, userId)) {
          return;
        }
        void resolveProfile(userId, revision).catch(() => {
          // Only the current request sets profileLoadError for retry.
        });
      });
    });

    return () => {
      active = false;
      currentUserId.current = null;
      requestGate.current.invalidate();
      subscription.unsubscribe();
    };
  }, [resolveProfile]);

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    // Supabase returns { error } on failure; it does not always reject.
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, profile, loading, profileLoadError, refreshProfile, signOut }),
    [session, profile, loading, profileLoadError, refreshProfile, signOut],
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
