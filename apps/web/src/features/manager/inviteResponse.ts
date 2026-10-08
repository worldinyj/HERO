/** One-time invitation URLs must never be treated as issued on malformed data. */
export interface IssuedInviteLink {
  invitationId: string;
  inviteUrl: string;
  expiresAt: string;
  plantDisplayName: string;
}

export function readIssuedInviteLink(value: unknown): IssuedInviteLink | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (
    typeof data.invitationId !== "string" || !data.invitationId.trim() ||
    typeof data.inviteUrl !== "string" || !data.inviteUrl.trim() ||
    typeof data.expiresAt !== "string" || !data.expiresAt.trim() ||
    typeof data.plantDisplayName !== "string" || !data.plantDisplayName.trim() ||
    data.error !== undefined
  ) return null;

  try {
    const url = new URL(data.inviteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!Number.isFinite(Date.parse(data.expiresAt))) return null;
  } catch {
    return null;
  }

  return {
    invitationId: data.invitationId,
    inviteUrl: data.inviteUrl,
    expiresAt: data.expiresAt,
    plantDisplayName: data.plantDisplayName,
  };
}

/** Reissue is a token rotation, not a new unrelated invite response. */
export function readReissuedInviteLink(
  value: unknown,
  requestedInvitationId: string,
): IssuedInviteLink | null {
  const link = readIssuedInviteLink(value);
  if (!link || value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result = value as Record<string, unknown>;
  if (
    result.reissued !== true ||
    result.oldInvitationId !== requestedInvitationId ||
    link.invitationId === requestedInvitationId
  ) {
    return null;
  }
  return link;
}
