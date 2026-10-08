/**
 * A failed HTTP response is safe to retry only when the endpoint rejects the
 * request before inserting an invitation. A transport failure or server 5xx
 * may occur AFTER a successful insert, so treat its outcome as unknown.
 */
export function isDefiniteInviteRejection(error: unknown): boolean {
  const value = error as { context?: { status?: unknown } } | null;
  const status = value?.context?.status;
  return typeof status === "number" && [400, 401, 403, 404, 409, 429].includes(status);
}

export class InviteCreationOutcomeUnknownError extends Error {
  constructor() {
    super("invite_creation_outcome_unknown");
    this.name = "InviteCreationOutcomeUnknownError";
  }
}
