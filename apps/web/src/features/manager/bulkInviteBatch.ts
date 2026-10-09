/**
 * Chunk CSV invitation creation to stay below the server's 30/10min quota,
 * leave headroom for non-bulk requests, and resume from the first uncreated row.
 */
export const MAX_INVITES_PER_RUN = 25;

export function nextInviteBatchRange(
  completed: number,
  total: number,
): number[] {
  if (
    !Number.isSafeInteger(completed) ||
    !Number.isSafeInteger(total) ||
    completed < 0 ||
    total < 0 ||
    completed > total ||
    total > 200
  ) {
    throw new Error("invalid_invite_batch_progress");
  }

  const count = Math.min(MAX_INVITES_PER_RUN, total - completed);
  return Array.from({ length: count }, (_, offset) => completed + offset);
}
