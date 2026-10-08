/** Do not delete local decisions without a matching committed receipt. */
export function isConfirmedSubmissionResponse(value: unknown, sessionId: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.sessionId === sessionId &&
    typeof row.alreadyCompleted === "boolean" &&
    row.evaluation !== null &&
    typeof row.evaluation === "object" &&
    !Array.isArray(row.evaluation) &&
    !Object.hasOwn(row, "error");
}

/** Read a known error code only from the actual Functions HTTP response. */
export async function submissionServerErrorCode(error: unknown): Promise<string | null> {
  if (!error || typeof error !== "object" || !("context" in error)) return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const json: unknown = await context.clone().json();
    if (!json || typeof json !== "object" || Array.isArray(json)) return null;
    const code = (json as Record<string, unknown>).error;
    return typeof code === "string" ? code : null;
  } catch { return null; }
}
