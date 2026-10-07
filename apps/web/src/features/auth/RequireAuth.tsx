import type { PropsWithChildren } from "react";
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

export function RequireRole({
  roles,
  children,
}: PropsWithChildren<{ roles: AppRole[] }>) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <section className="panel"><p className="muted">권한을 확인하고 있습니다…</p></section>;
  }

  if (!profile?.is_active) {
    return (
      <section className="panel">
        <h2>초대 수락이 필요합니다</h2>
        <p className="muted">유효한 HERO 초대 링크를 통해 가입을 완료해주세요.</p>
      </section>
    );
  }

  if (!roles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
