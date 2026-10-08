/**
 * Deterministically validate untrusted session completion payloads before
 * the engine replays a decision log. Never rely on TypeScript casts for JSON.
 */
export type ValidSubmissionAction =
  | { type: "continue" }
  | { type: "choice"; actionId: string }
  | { type: "info"; actionId: string }
  | { type: "card"; cardId: string };

export interface ValidSessionSubmission {
  sessionId: string;
  actions: ValidSubmissionAction[];
  reflectionAnswered: boolean;
  swissCheeseViewed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function actionIdentifier(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 && value.length <= 256 &&
    value.trim() === value && value.trim().length > 0;
}

export function parseSubmissionActions(value: unknown): ValidSubmissionAction[] | null {
  if (!Array.isArray(value) || value.length > 250) return null;
  const result: ValidSubmissionAction[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) return null;
    if (entry.type === "continue") {
      if (entry.actionId !== undefined || entry.cardId !== undefined) return null;
      result.push({ type: "continue" });
    } else if (entry.type === "choice" || entry.type === "info") {
      if (!actionIdentifier(entry.actionId) || entry.cardId !== undefined) return null;
      result.push({ type: entry.type, actionId: entry.actionId });
    } else if (entry.type === "card") {
      if (!actionIdentifier(entry.cardId) || entry.actionId !== undefined) return null;
      result.push({ type: "card", cardId: entry.cardId });
    } else {
      return null;
    }
  }
  return result;
}

export function parseSessionSubmission(value: unknown): ValidSessionSubmission | null {
  if (!isRecord(value) || typeof value.sessionId !== "string") return null;
  if (value.reflectionAnswered !== undefined &&
      typeof value.reflectionAnswered !== "boolean") return null;
  if (value.swissCheeseViewed !== undefined &&
      typeof value.swissCheeseViewed !== "boolean") return null;
  // Backwards compatible with clients that omit the optional action list.
  const actions = parseSubmissionActions(value.actions === undefined ? [] : value.actions);
  if (actions === null) return null;

  return {
    sessionId: value.sessionId.trim(),
    actions,
    reflectionAnswered: value.reflectionAnswered === true,
    swissCheeseViewed: value.swissCheeseViewed === true,
  };
}
