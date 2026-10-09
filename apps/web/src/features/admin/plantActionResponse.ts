/** Strict DTO checks for Admin plant actions. Invalid 2xx is unknown. */
export function readPlantCreated(value: unknown, code: string, displayName: string):
  { created: true; plantId: string; isActive: true } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.created !== true || typeof row.plantId !== "string" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.plantId) ||
      row.code !== code || row.displayName !== displayName ||
      row.isActive !== true) return null;
  return { created: true, plantId: row.plantId, isActive: true };
}

export function readPlantStatus(value: unknown, plantId: string, isActive: boolean):
  { changed: boolean; plantId: string; isActive: boolean } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.changed !== "boolean" || row.plantId !== plantId ||
      row.isActive !== isActive) return null;
  return { changed: row.changed, plantId, isActive };
}
