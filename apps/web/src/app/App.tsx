import { HERO_PRODUCT_NAME } from "@hero/engine";
import { SCENARIO_SCHEMA_VERSION } from "@hero/schema";
import { NavLink, Route, Routes } from "react-router";

function CampaignPage() {
  return (
    <section className="panel" aria-labelledby="campaign-title">
      <p className="eyebrow">10월 시즌 · 개발 준비중</p>
      <h2 id="campaign-title">캠페인</h2>
      <p className="muted">
        MVP 시나리오 S01~S03이 여기에 연결됩니다. 현재는 Phase 0 기반 구축 화면입니다.
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
      <p className="eyebrow">Phase 0</p>
      <h2>{title}</h2>
      <p className="muted">설계 계약에 따라 다음 단계에서 구현합니다.</p>
    </section>
  );
}

export function App() {
  return (
    <main className="app-shell">
      <header className="hero-header">
        <p className="eyebrow">Human Error Risk Operations</p>
        <h1>{HERO_PRODUCT_NAME}</h1>
        <p className="tagline">사고는 마지막 행동에서 시작되지 않는다.</p>
        <span className="build-badge">schema {SCENARIO_SCHEMA_VERSION}</span>
      </header>

      <Routes>
        <Route path="/" element={<CampaignPage />} />
        <Route path="/leaderboard" element={<PlaceholderPage title="리더보드" />} />
        <Route path="/me" element={<PlaceholderPage title="내 기록" />} />
      </Routes>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <NavLink to="/" end>캠페인</NavLink>
        <NavLink to="/leaderboard">리더보드</NavLink>
        <NavLink to="/me">내 기록</NavLink>
      </nav>
    </main>
  );
}
