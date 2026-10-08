/**
 * Guard the roster used to reconcile an uncertain mutation.
 * An empty list is valid, but null/malformed RPC output is not evidence.
 */
function recordWith(row: unknown): row is Record<string, unknown> {
  return row !== null && typeof row === "object" && !Array.isArray(row);
}

export function isValidManagerDashboardLists(
  participation: unknown,
  pending: unknown,
  aggregate: unknown,
): boolean {
  return (
    Array.isArray(participation) &&
    participation.every((row: unknown) =>
      recordWith(row) &&
      typeof row.profile_id === "string" &&
      typeof row.nickname === "string" &&
      typeof row.is_active === "boolean"
    ) &&
    Array.isArray(pending) &&
    pending.every((row: unknown) =>
      recordWith(row) &&
      typeof row.invitation_id === "string" &&
      typeof row.invitee_name === "string"
    ) &&
    Array.isArray(aggregate) &&
    aggregate.every((row: unknown) =>
      recordWith(row) && typeof row.job_role === "string"
    )
  );
}
