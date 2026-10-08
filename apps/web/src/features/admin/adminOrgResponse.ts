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
    typeof row.is_active === "boolean"
  ) &&
    Array.isArray(managers) && managers.every((row: unknown) =>
      objectRow(row) && typeof row.id === "string" &&
      typeof row.real_name === "string" && typeof row.nickname === "string" &&
      typeof row.is_active === "boolean" &&
      (row.plant_id === null || typeof row.plant_id === "string")
    ) &&
    Array.isArray(pendingInvitations) && pendingInvitations.every((row: unknown) =>
      objectRow(row) && typeof row.id === "string" &&
      typeof row.plant_id === "string" && typeof row.invitee_name === "string"
    );
}
