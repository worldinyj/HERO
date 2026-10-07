import { HERO_PRODUCT_NAME } from "@hero/engine";
import { SCENARIO_SCHEMA_VERSION } from "@hero/schema";
import type { ReactNode } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router";
import { LoginPage } from "../features/auth/LoginPage";
import { RequireAuth, RequireRole } from "../features/auth/RequireAuth";
import { InvitationPage } from "../features/invite/InvitationPage";

const ALL_ACTIVE_ROLES = ["admin", "plant_manager", "player"] as const;

function CampaignPage() {
  return (
    <section className="panel" aria-labelledby="campaign-title">
      <p className="eyebrow">10월 시즌 · 개발 준비중</p>
      <h2 id="campaign-title">캠페인</h2>
      <p className="muted">
        MVP 시나리오 S01~S03이 여기에 연결됩니다. 현재는 인증·조직 기반을 구축 중입니다.
      </p>

      <div className="chapter-list">
        <article className="chapter-card">
          <span className="chapter-index">01</span>
          <div>
            <strong>오늘 오전까지 끝내야 합니다</strong>
            <p>시간압박 · 단독작업 · 감독부족</p>
          </div>
        </article>

        <article className="chapter-card chapter-card--locked">
          <span className="chapter-index">02</span>
          <div>
            <strong>아마 이 설비가 맞을 겁니다</strong>
            <p>설비 오인 · Self/Peer Check</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="panel">
      <p className="eyebrow">Phase 1</p>
      <h2>{title}</h2>
      <p className="muted">설계 계약에 따라 다음 단계에서 구현합니다.</p>
    </section>
  );
}

function ActiveUserGate({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireRole roles={[...ALL_ACTIVE_ROLES]}>{children}</RequireRole>
    </RequireAuth>
  );
}

export function App() {
  const location = useLocation();
  const publicRoute = location.pathname === "/login" || location.pathname.startsWith("/i/");

  return (
    <main className="app-shell">
      <header className="hero-header">
        <p className="eyebrow">Human Error Risk Operations</p>
        <h1>{HERO_PRODUCT_NAME}</h1>
        <p className="tagline">사고는 마지막 행동에서 시작되지 않는다.</p>
        <span className="build-badge">schema {SCENARIO_SCHEMA_VERSION}</span>
      </header>

      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/i/:token" element={<InvitationPage />} />
        <Route path="/" element={<ActiveUserGate><CampaignPage /></ActiveUserGate>} />
        <Route
          path="/leaderboard"
          element={<ActiveUserGate><PlaceholderPage title="리더보드" /></ActiveUserGate>}
        />
        <Route path="/me" element={<ActiveUserGate><PlaceholderPage title="내 기록" /></ActiveUserGate>} />
      </Routes>

      {!publicRoute ? (
        <nav className="bottom-nav" aria-label="주요 메뉴">
          <NavLink to="/" end>캠페인</NavLink>
          <NavLink to="/leaderboard">리더보드</NavLink>
          <NavLink to="/me">내 기록</NavLink>
        </nav>
      ) : null}
    </main>
  );
}
