/**
 * Separate transport/database failures from legitimate absence.
 * A failed lookup is never evidence of "not found" or a policy rejection.
 */
export function singleLookupOutcome(
  data: unknown,
  error: unknown,
): "failed" | "missing" | "found" {
  if (error != null) return "failed";
  if (data === null) return "missing";
  return typeof data === "object" && !Array.isArray(data)
    ? "found"
    : "failed";
}

export function listLookupOutcome(
  data: unknown,
  error: unknown,
): "failed" | "empty" | "found" {
  if (error != null || !Array.isArray(data)) return "failed";
  return data.length === 0 ? "empty" : "found";
}
