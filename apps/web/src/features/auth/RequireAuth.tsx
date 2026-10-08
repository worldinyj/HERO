import type { PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth, type AppRole } from "./AuthContext";

export function RequireAuth({ children }: PropsWithChildren) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <section className="panel"><p className="muted">사용자 정보를 확인하고 있습니다…</p></section>;
  }

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}

function UnprovisionedUser() {
  const { signOut } = useAuth();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void signOut().finally(() => {
      // A sign-out updates AuthContext immediately and can unmount this route
      // before a router navigation runs. Use a document-level replace so the
      // invitation-required reason survives that auth-state transition.
      window.location.replace("/login?reason=invite_required");
    });
  }, [signOut]);

  return (
    <section className="panel">
      <h2>초대 링크가 필요합니다</h2>
      <p className="muted">
        HERO는 초대받은 사용자만 가입할 수 있습니다. 로그인 정보를 정리하고 있습니다…
      </p>
    </section>
  );
}

export function RequireRole({
  roles,
  children,
}: PropsWithChildren<{ roles: AppRole[] }>) {
  const { profile, loading, profileLoadError, refreshProfile } = useAuth();

  if (loading) {
    return <section className="panel"><p className="muted">권한을 확인하고 있습니다…</p></section>;
  }

  if (profileLoadError) {
    return (
      <section className="panel" role="alert">
        <h2>사용자 정보를 불러오지 못했습니다</h2>
        <p className="muted">일시적인 통신 문제일 수 있습니다. 다시 시도해주세요.</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => { void refreshProfile().catch(() => {}); }}
        >
          사용자 정보 다시 불러오기
        </button>
      </section>
    );
  }

  // Only a completed and successful lookup returning null is unprovisioned.
  if (!profile) {
    return <UnprovisionedUser />;
  }

  if (!profile.is_active) {
    return (
      <section className="panel">
        <h2>계정이 비활성화되어 있습니다</h2>
        <p className="muted">HERO 담당자에게 계정 상태를 확인해주세요.</p>
      </section>
    );
  }

  if (!roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
