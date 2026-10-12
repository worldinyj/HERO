import { Component, type ReactNode } from "react";
import { Link } from "react-router";

export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <section className="panel route-loading" role="alert" aria-labelledby="route-error-title">
        <p className="eyebrow">HERO</p>
        <h2 id="route-error-title">화면을 불러오지 못했습니다</h2>
        <p className="muted">연결 상태를 확인한 뒤 다시 불러오거나 캠페인으로 이동해주세요.</p>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>
          화면 다시 불러오기
        </button>
        <Link className="text-link" to="/">캠페인으로 이동</Link>
      </section>
    );
  }
}
