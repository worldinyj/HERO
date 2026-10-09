/**
 * Parse a JSON object without trusting compile-time RequestBody types.
 * Malformed JSON, null, arrays and primitives are deterministic 400 errors.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await req.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}
