import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { sha256Hex } from "./crypto.ts";

export interface RateLimitRule {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function consumeRateLimit(
  admin: SupabaseClient,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const subjectHash = await sha256Hex(rule.subject);

  const { data, error } = await admin.rpc("consume_api_rate_limit", {
    p_scope: rule.scope,
    p_subject_hash: subjectHash,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    throw new Error(`rate_limit_check_failed:${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    typeof row.remaining !== "number" ||
    typeof row.retry_after_seconds !== "number"
  ) {
    throw new Error("rate_limit_check_invalid_response");
  }

  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfterSeconds: row.retry_after_seconds,
  };
}

export function requestFingerprint(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    req.headers.get("cf-connecting-ip")?.trim() ||
    forwardedFor ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";

  const userAgent = req.headers.get("user-agent")?.slice(0, 180) ?? "unknown";
  const origin = req.headers.get("origin") ?? "unknown";

  return `${address}|${userAgent}|${origin}`;
}
