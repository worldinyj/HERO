import { sha256Hex } from "../_shared/crypto.ts";
import { handleOptions, json } from "../_shared/http.ts";
import { classifyInvitationError } from "../_shared/invitationErrorStatus.ts";
import { readJsonObject } from "../_shared/jsonObject.ts";
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

    const raw = await readJsonObject(req);
    if (!raw) return json(req, { error: "invalid_request" }, 400);
    const body = raw as AcceptBody;
    const token = typeof body.token === "string" ? body.token.trim() : null;
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : null;

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
      const classified = classifyInvitationError(error);
      return json(req, { error: classified.error }, classified.status);
    }
    if (!data || typeof data !== "object" || data.profile_id !== user.id) {
      throw new Error("invitation_accept_result_unknown");
    }

    return json(req, { accepted: true, profile: data });
  } catch (cause) {
    const failure = classifyInvitationError(cause);
    return json(req, { error: failure.error }, failure.status);
  }
});
