import { useState } from "react";
import { Link } from "react-router";
import { signInWithKakao } from "../../lib/supabase";

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleLogin() {
    try {
      setPending(true);
      setError(null);
      await signInWithKakao();
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : "로그인을 시작하지 못했습니다.");
    }
  }

  return (
    <section className="panel auth-panel" aria-labelledby="login-title">
      <p className="eyebrow">HERO Invitation Only</p>
      <h2 id="login-title">카카오로 시작하기</h2>
      <p className="muted">
        HERO는 초대를 받은 사용자만 이용할 수 있습니다. 플레이 결과와 순위는 인사평가와 무관합니다.
      </p>

      <button className="kakao-button" type="button" onClick={handleLogin} disabled={pending}>
        {pending ? "카카오로 이동 중…" : "카카오로 시작하기"}
      </button>

      <div className="legal-links" aria-label="정책 문서">
        <Link to="/terms">이용약관</Link>
        <span aria-hidden="true">·</span>
        <Link to="/privacy">개인정보 처리방침</Link>
      </div>
      <p className="legal-note">
        정책 문안은 현재 검토 초안이며 프로덕션 공개 전 담당부서 승인이 필요합니다.
      </p>

      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
