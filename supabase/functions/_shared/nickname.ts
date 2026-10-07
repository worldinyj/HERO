import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";

export type NicknameValidationError =
  | "nickname_length"
  | "nickname_characters"
  | "nickname_forbidden"
  | "nickname_taken";

export interface NicknameValidation {
  valid: boolean;
  nickname: string;
  error?: NicknameValidationError;
}

export async function validateNickname(
  admin: SupabaseClient,
  rawNickname: string,
  excludeUserId?: string,
): Promise<NicknameValidation> {
  const nickname = rawNickname.trim();
  const length = Array.from(nickname).length;

  if (length < 2 || length > 12) {
    return { valid: false, nickname, error: "nickname_length" };
  }

  if (!/^[가-힣A-Za-z0-9]+$/u.test(nickname)) {
    return { valid: false, nickname, error: "nickname_characters" };
  }

  const normalized = nickname.toLocaleLowerCase("ko-KR");
  const { data: forbidden, error: forbiddenError } = await admin
    .from("nickname_forbidden_terms")
    .select("term")
    .eq("is_active", true);

  if (forbiddenError) throw forbiddenError;

  const blocked = (forbidden ?? []).some((row) =>
    normalized.includes(String(row.term).toLocaleLowerCase("ko-KR")),
  );

  if (blocked) {
    return { valid: false, nickname, error: "nickname_forbidden" };
  }

  let duplicateQuery = admin
    .from("profiles")
    .select("id")
    .ilike("nickname", nickname);

  if (excludeUserId) {
    duplicateQuery = duplicateQuery.neq("id", excludeUserId);
  }

  const { data: duplicate, error: duplicateError } =
    await duplicateQuery.limit(1).maybeSingle();

  if (duplicateError) throw duplicateError;

  if (duplicate) {
    return { valid: false, nickname, error: "nickname_taken" };
  }

  return { valid: true, nickname };
}
