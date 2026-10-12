import type { Scenario } from "@hero/schema";

export const REVIEW_AREAS = ["hf_accuracy", "operations_context", "anonymization", "just_culture", "incident_debrief"] as const;
export type ReviewArea = typeof REVIEW_AREAS[number];
export interface ReviewTarget {
  scenarioId: string;
  version: number;
  title: string;
  contentSha256: string;
  previewSha256: string;
  sourceRightsComplete: boolean;
  approved: boolean;
  areas: Array<{ area: ReviewArea; decision: "pass" | "hold" | "pending" }>;
}

// Object key order/JSON formatting do not change the schema-validated preview.
export function canonicalContent(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.entries(item).filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, v]) => [key, ordered(v)]),
    );
    return item;
  }
  return JSON.stringify(ordered(value));
}

export async function matchesReviewTarget(scenario: Scenario, target: ReviewTarget): Promise<boolean> {
  if (scenario.id !== target.scenarioId || scenario.version !== target.version) return false;
  const bytes = new TextEncoder().encode(canonicalContent(scenario));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return hash === target.previewSha256;
}
