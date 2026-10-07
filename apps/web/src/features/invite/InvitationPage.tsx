import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { getSupabase, signInWithKakao } from "../../lib/supabase";

interface InvitePreview {
  valid: boolean;
  invitationId?: string;
  inviteeName?: string;
  targetRole?: "plant_manager" | "player";
  jobRole?: string | null;
  teamName?: string | null;
  plantDisplayName?: string;
  expiresAt?: string;
  reason?: string;
}

const NICKNAME_ERROR_LABEL: Record<string, string> = {
  nickname_length: "닉네임은 2~12자로 입력해주세요.",
  nickname_characters: "닉네임은 한글·영문·숫자만 사용할 수 있습니다.",
  nickname_forbidden: "사용할 수 없는 단어가 포함되어 있습니다.",
  nickname_taken: "이미 사용 중인 닉네임입니다.",
};

const JOB_LABEL: Record<string, string> = {
  sro: "SRO",
  ro: "RO",
  field_operator: "현장운전원",
  supervisor: "감독",
  worker: "작업자",
};

export function InvitationPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const { session, refreshProfile } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [nickname, setNickname] = useState("");
  const [nicknameCheck, setNicknameCheck] = useState<{
    checking: boolean;
    available: boolean;
    error: string | null;
  } | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = getSupabase();
        const { data, error: invokeError } = await supabase.functions.invoke("peek-invite", {
          body: { token },
        });

        if (invokeError) throw invokeError;
        if (active) setPreview(data as InvitePreview);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "초대 정보를 불러오지 못했습니다.");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  const roleLabel = useMemo(() => {
    if (!preview?.targetRole) return "";
    if (preview.targetRole === "plant_manager") return "발전소담당자";
    return preview.jobRole ? JOB_LABEL[preview.jobRole] ?? preview.jobRole : "사용자";
  }, [preview]);

  useEffect(() => {
    if (!session) {
      setNicknameCheck(null);
      return;
    }

    const value = nickname.trim();
    if (Array.from(value).length < 2) {
      setNicknameCheck(null);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setNicknameCheck({ checking: true, available: false, error: null });
          const supabase = getSupabase();
          const { data, error: invokeError } = await supabase.functions.invoke(
            "nickname-action",
            { body: { action: "check", nickname: value } },
          );

          if (invokeError) throw invokeError;
          if (!active) return;

          const result = data as {
            available?: boolean;
            error?: string | null;
          };

          setNicknameCheck({
            checking: false,
            available: result.available === true,
            error: result.error ?? null,
          });
        } catch {
          if (active) {
            setNicknameCheck({
              checking: false,
              available: false,
              error: "nickname_check_failed",
            });
          }
        }
      })();
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [nickname, session]);

  async function handleKakaoLogin() {
    try {
      setError(null);
      await signInWithKakao(`/i/${token}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "카카오 로그인을 시작하지 못했습니다.");
    }
  }

  async function handleAccept() {
    if (!session) return;

    try {
      setPending(true);
      setError(null);

      const supabase = getSupabase();
      const { data, error: invokeError } = await supabase.functions.invoke("accept-invite", {
        body: {
          token,
          nickname,
          termsAccepted,
          privacyAccepted,
        },
      });

      if (invokeError) throw invokeError;

      const result = data as { accepted?: boolean; error?: string };
      if (!result.accepted) {
        throw new Error(result.error ?? "초대 수락에 실패했습니다.");
      }

      await refreshProfile();
      navigate("/", { replace: true });
    } catch (cause) {
      setPending(false);
      setError(cause instanceof Error ? cause.message : "초대 수락에 실패했습니다.");
    }
  }

  if (error && !preview) {
    return <section className="panel"><h2>초대 확인 실패</h2><p className="error-text">{error}</p></section>;
  }

  if (!preview) {
    return <section className="panel"><p className="muted">초대 정보를 확인하고 있습니다…</p></section>;
  }

  if (!preview.valid) {
    return (
      <section className="panel">
        <h2>사용할 수 없는 초대입니다</h2>
        <p className="muted">사유: {preview.reason ?? "유효하지 않은 링크"}</p>
        <p className="muted">발전소담당자에게 새 초대 링크를 요청해주세요.</p>
      </section>
    );
  }

  return (
    <section className="panel invite-panel" aria-labelledby="invite-title">
      <p className="eyebrow">HERO Invitation</p>
      <h2 id="invite-title">{preview.inviteeName} 님, 초대되었습니다</h2>
      <dl className="invite-summary">
        <div><dt>소속</dt><dd>{preview.plantDisplayName}</dd></div>
        <div><dt>역할</dt><dd>{roleLabel}</dd></div>
      </dl>

      {!session ? (
        <>
          <p className="muted">카카오 로그인 후 닉네임과 동의를 확인하면 가입이 완료됩니다.</p>
          <button className="kakao-button" type="button" onClick={handleKakaoLogin}>
            카카오로 시작하기
          </button>
        </>
      ) : (
        <div className="invite-form">
          <label>
            <span>리더보드 닉네임</span>
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              minLength={2}
              maxLength={12}
              autoComplete="nickname"
              placeholder="2~12자 · 한글/영문/숫자"
              aria-describedby="nickname-check"
            />
            <span
              id="nickname-check"
              className={
                nicknameCheck?.available
                  ? "nickname-check nickname-check--ok"
                  : "nickname-check"
              }
            >
              {nicknameCheck?.checking
                ? "사용 가능 여부 확인 중…"
                : nicknameCheck?.available
                  ? "사용 가능한 닉네임입니다."
                  : nicknameCheck?.error
                    ? NICKNAME_ERROR_LABEL[nicknameCheck.error] ??
                      "닉네임을 확인해주세요."
                    : "리더보드에는 닉네임만 표시됩니다."}
            </span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
            />
            <span>이용약관에 동의합니다.</span>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={privacyAccepted}
              onChange={(event) => setPrivacyAccepted(event.target.checked)}
            />
            <span>개인정보 수집·이용에 동의합니다.</span>
          </label>

          <p className="notice">플레이 결과와 순위는 인사평가·징계에 사용하지 않습니다.</p>

          <div className="legal-links" aria-label="정책 문서">
            <Link to="/terms">이용약관 전문</Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacy">개인정보 처리방침 전문</Link>
          </div>

          <button
            className="primary-button"
            type="button"
            disabled={
              pending ||
              Array.from(nickname.trim()).length < 2 ||
              nicknameCheck?.available !== true ||
              !termsAccepted ||
              !privacyAccepted
            }
            onClick={handleAccept}
          >
            {pending ? "가입 처리 중…" : "초대 수락하고 시작하기"}
          </button>
        </div>
      )}

      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
