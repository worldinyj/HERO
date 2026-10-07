import { sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { validateNickname } from "../_shared/nickname.ts";
import { guardRateLimit } from "../_shared/rateLimit.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

interface AcceptBody {
  token?: string;
  nickname?: string;
  termsAccepted?: boolean;
  privacyAccepted?: boolean;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    const limited = await guardRateLimit(req, admin, {
      scope: "accept-invite",
      subject: user.id,
      limit: 10,
      windowSeconds: 600,
    });
    if (limited) return limited;

    const body = (await req.json()) as AcceptBody;

    const token = body.token?.trim();
    const nickname = body.nickname?.trim();

    if (!token || !nickname) {
      return json(req, { error: "invalid_request" }, 400);
    }

    const nicknameValidation = await validateNickname(admin, nickname, user.id);
    if (!nicknameValidation.valid) {
      return json(req, { error: nicknameValidation.error }, 409);
    }

    if (!body.termsAccepted || !body.privacyAccepted) {
      return json(req, { error: "consent_required" }, 400);
    }

    const tokenHash = await sha256Hex(token);
    const acceptedAt = new Date().toISOString();

    const { data, error } = await admin.rpc("accept_invitation_atomic", {
      p_token_hash: tokenHash,
      p_user_id: user.id,
      p_nickname: nicknameValidation.nickname,
      p_terms_at: acceptedAt,
      p_privacy_at: acceptedAt,
    });

    if (error) {
      const detail = error.message || "accept_failed";
      return json(req, { error: detail }, 409);
    }

    return json(req, { accepted: true, profile: data });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "internal_error";
    const status = message === "unauthorized" ? 401 : 500;
    return json(req, { error: message }, status);
  }
});
