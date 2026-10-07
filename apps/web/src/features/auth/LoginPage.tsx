import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { signInWithKakao } from "../../lib/supabase";

function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inviteRequired = searchParams.get("reason") === "invite_required";
  const returnPath = safeReturnPath(searchParams.get("next"));

  async function handleLogin() {
    try {
      setPending(true);
      setError(null);
      await signInWithKakao(returnPath);
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
        처음 이용하는 사용자는 HERO 담당자가 발급한 초대 링크로 접속해주세요.
        플레이 결과와 순위는 인사평가와 무관합니다.
      </p>

      {inviteRequired ? (
        <p className="notice" role="status">
          HERO 이용을 시작하려면 유효한 초대 링크가 필요합니다.
        </p>
      ) : null}

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
