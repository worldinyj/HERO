export interface NicknameAvailability {
  value: string;
  checking: boolean;
  available: boolean;
  error: string | null;
}

/** Never reuse an async availability response for a different typed nickname. */
export function currentNicknameCheck(
  nickname: string,
  result: NicknameAvailability | null,
): NicknameAvailability | null {
  if (!result || result.value !== nickname.trim()) return null;
  return result;
}
