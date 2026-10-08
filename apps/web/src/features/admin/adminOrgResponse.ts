/** Validate three independent admin lists before retry locks can be cleared. */
function objectRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidAdminOrgLists(
  plants: unknown,
  managers: unknown,
  pendingInvitations: unknown,
): boolean {
  return Array.isArray(plants) && plants.every((row: unknown) =>
    objectRow(row) && typeof row.id === "string" &&
    typeof row.code === "string" && typeof row.display_name === "string" &&
    typeof row.is_active === "boolean" &&
    Number.isSafeInteger(row.invitation_epoch) && row.invitation_epoch >= 0
  ) &&
    Array.isArray(managers) && managers.every((row: unknown) =>
      objectRow(row) && typeof row.id === "string" &&
      typeof row.real_name === "string" && typeof row.nickname === "string" &&
      typeof row.is_active === "boolean" &&
      (row.plant_id === null || typeof row.plant_id === "string")
    ) &&
    Array.isArray(pendingInvitations) && pendingInvitations.every((row: unknown) =>
      objectRow(row) && typeof row.id === "string" &&
      typeof row.plant_id === "string" && typeof row.invitee_name === "string" &&
      Number.isSafeInteger(row.plant_invitation_epoch) && row.plant_invitation_epoch >= 0
    );
}

/** Hide retained historical invites that were invalidated by suspension. */
export function currentPendingInvitations<
  T extends { plant_id: string; plant_invitation_epoch: number },
  P extends { id: string; is_active: boolean; invitation_epoch: number },
>(plants: readonly P[], invitations: readonly T[]): T[] {
  const current = new Map(plants.filter(p => p.is_active).map(p => [p.id, p.invitation_epoch]));
  return invitations.filter(i => current.get(i.plant_id) === i.plant_invitation_epoch);
}
