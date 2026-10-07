import { HERO_PRODUCT_NAME } from "@hero/engine";
import { SCENARIO_SCHEMA_VERSION } from "@hero/schema";
import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router";
import { useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { RequireAuth, RequireRole } from "../features/auth/RequireAuth";
import { InvitationPage } from "../features/invite/InvitationPage";
import { CampaignRankCard } from "../features/leaderboard/CampaignRankCard";
import { PrivacyPage, TermsPage } from "../features/legal/LegalPage";
import { CompetitiveCampaignChapters } from "../features/play/CompetitiveCampaignChapters";
import { startSubmissionQueueProcessor } from "../lib/submissionQueue";
import {
  loadAdminOrgPageModule,
  loadAdminScenarioPageModule,
  loadBriefingPageModule,
  loadGamePageModule,
  loadLeaderboardPageModule,
  loadManagerPageModule,
  loadProfilePageModule,
  preloadBriefingRoute,
} from "./routeModules";

const ALL_ACTIVE_ROLES = ["admin", "plant_manager", "player"] as const;

const GamePage = lazy(() =>
  loadGamePageModule().then((module) => ({ default: module.GamePage })),
);
const CompetitiveBriefingPage = lazy(() =>
  loadBriefingPageModule().then((module) => ({
    default: module.CompetitiveBriefingPage,
  })),
);
const LeaderboardPage = lazy(() =>
  loadLeaderboardPageModule().then((module) => ({
    default: module.LeaderboardPage,
  })),
);
const ProfilePage = lazy(() =>
  loadProfilePageModule().then((module) => ({ default: module.ProfilePage })),
);
const ManagerDashboardPage = lazy(() =>
  loadManagerPageModule().then((module) => ({
    default: module.ManagerDashboardPage,
  })),
);
const AdminOrgPage = lazy(() =>
  loadAdminOrgPageModule().then((module) => ({
    default: module.AdminOrgPage,
  })),
);
const AdminScenarioPage = lazy(() =>
  loadAdminScenarioPageModule().then((module) => ({
    default: module.AdminScenarioPage,
  })),
);

function RouteLoading() {
  return (
    <section className="panel route-loading" role="status" aria-live="polite">
      <p className="eyebrow">HERO</p>
      <h2>화면을 준비하고 있습니다</h2>
      <p className="muted">필요한 기능만 불러오는 중입니다.</p>
    </section>
  );
}

function CampaignPage() {
  return (
    <section className="panel" aria-labelledby="campaign-title">
      <p className="eyebrow">10월 시즌 · 개발 중</p>
      <h2 id="campaign-title">캠페인</h2>
      <p className="muted">
        0장 튜토리얼은 실제 엔진으로 플레이할 수 있습니다. S01~S03은 서버 세션·콘텐츠 검수 후 순차 개방합니다.
      </p>

      <CampaignRankCard />

      <div className="chapter-list">
        <Link
          className="chapter-link"
          to="/briefing/s00_tutorial"
          onPointerEnter={preloadBriefingRoute}
          onPointerDown={preloadBriefingRoute}
          onFocus={preloadBriefingRoute}
        >
          <article className="chapter-card chapter-card--ready">
            <span className="chapter-index">00</span>
            <div>
              <strong>확인하고 말하기</strong>
              <p>3분 튜토리얼 · 리더보드 미반영</p>
            </div>
            <span className="chapter-action" aria-hidden="true">▶</span>
          </article>
        </Link>

        <CompetitiveCampaignChapters />
      </div>
    </section>
  );
}

function BriefingRoute() {
  const match = useLocation().pathname.match(/^\/briefing\/([^/]+)$/u);
  const scenarioId = match?.[1] ?? "";

  return <CompetitiveBriefingPage scenarioId={scenarioId} />;
}

function ActiveUserGate({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireRole roles={[...ALL_ACTIVE_ROLES]}>{children}</RequireRole>
    </RequireAuth>
  );
}

function PlayerGate({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireRole roles={["player"]}>{children}</RequireRole>
    </RequireAuth>
  );
}

function ManagerGate({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireRole roles={["plant_manager"]}>{children}</RequireRole>
    </RequireAuth>
  );
}

function AdminGate({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <RequireRole roles={["admin"]}>{children}</RequireRole>
    </RequireAuth>
  );
}

export function App() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const { profile, session } = useAuth();
  const managerNav = profile?.role === "plant_manager";
  const adminNav = profile?.role === "admin";
  const expandedNav = managerNav || adminNav;
  const publicRoute =
    location.pathname === "/login" ||
    location.pathname === "/terms" ||
    location.pathname === "/privacy" ||
    location.pathname.startsWith("/i/");
  const playRoute = location.pathname.startsWith("/play/");
  const briefingRoute = location.pathname.startsWith("/briefing/");
  const immersiveRoute = playRoute || briefingRoute;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mainRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    if (
      !session?.user.id ||
      profile?.role !== "player" ||
      profile.is_active !== true
    ) {
      return;
    }

    return startSubmissionQueueProcessor(session.user.id);
  }, [profile?.is_active, profile?.role, session?.user.id]);

  return (
    <>
      <a className="skip-link" href="#hero-main-content">
        본문으로 건너뛰기
      </a>
      <main
        id="hero-main-content"
        ref={mainRef}
        tabIndex={-1}
        className={immersiveRoute ? "app-shell app-shell--play" : "app-shell"}
      >
      {!immersiveRoute ? (
        <header className="hero-header">
          <p className="eyebrow">Human Error Risk Operations</p>
          <h1>{HERO_PRODUCT_NAME}</h1>
          <p className="tagline">사고는 마지막 행동에서 시작되지 않는다.</p>
          <span className="build-badge">schema {SCENARIO_SCHEMA_VERSION}</span>
        </header>
      ) : null}

      <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/i/:token" element={<InvitationPage />} />
        <Route path="/" element={<ActiveUserGate><CampaignPage /></ActiveUserGate>} />
        <Route
          path="/briefing/:scenarioId"
          element={
            <ActiveUserGate>
              <BriefingRoute />
            </ActiveUserGate>
          }
        />
        <Route
          path="/play/:scenarioId"
          element={<ActiveUserGate><GamePage /></ActiveUserGate>}
        />
        <Route
          path="/leaderboard"
          element={<PlayerGate><LeaderboardPage /></PlayerGate>}
        />
        <Route
          path="/manager"
          element={<ManagerGate><ManagerDashboardPage /></ManagerGate>}
        />
        <Route
          path="/admin"
          element={<AdminGate><AdminOrgPage /></AdminGate>}
        />
        <Route
          path="/admin/scenarios"
          element={<AdminGate><AdminScenarioPage /></AdminGate>}
        />
        <Route
          path="/me"
          element={<ActiveUserGate><ProfilePage /></ActiveUserGate>}
        />
      </Routes>
      </Suspense>

      {!publicRoute && !immersiveRoute ? (
        <nav
          className={expandedNav ? "bottom-nav bottom-nav--manager" : "bottom-nav"}
          aria-label="주요 메뉴"
        >
          <NavLink to="/" end>캠페인</NavLink>
          {profile?.role === "player" ? <NavLink to="/leaderboard">리더보드</NavLink> : null}
          {managerNav ? <NavLink to="/manager">발전소</NavLink> : null}
          {adminNav ? <NavLink to="/admin">관리</NavLink> : null}
          <NavLink to="/me">내 기록</NavLink>
        </nav>
      ) : null}
      </main>
    </>
  );
}
