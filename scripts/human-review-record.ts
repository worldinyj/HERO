import { isSha256Hex } from "./scenario-approval-integrity.ts";

export const HUMAN_REVIEW_CHECK_KEYS = [
  "hfAccuracy",
  "operationalContext",
  "anonymization",
  "justCulture",
  "incidentDebriefSourceBoundary",
  "finalContentApproval",
] as const;

export type HumanReviewCheckKey = (typeof HUMAN_REVIEW_CHECK_KEYS)[number];
export type HumanReviewCheckStatus = "pending" | "pass" | "hold";
export type HumanReviewDecision =
  | "pending"
  | "approved"
  | "changes_requested"
  | "hold";

export interface HumanReviewRecord {
  schemaVersion: 1;
  scenarioId: string;
  contentSha256: string;
  decision: HumanReviewDecision;
  reviewer: {
    nameOrRole: string;
    reviewedAt: string;
  };
  checks: Record<HumanReviewCheckKey, HumanReviewCheckStatus>;
  attestations: {
    reviewedExactHash: boolean;
    understandsHashInvalidation: boolean;
  };
  notes: string;
}

function fail(message: string): never {
  throw new Error(`human_review_record_invalid:${message}`);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function parseHumanReviewRecord(
  raw: unknown,
): HumanReviewRecord {
  if (!raw || typeof raw !== "object") {
    fail("record_must_be_object");
  }

  const source = raw as Partial<HumanReviewRecord>;

  if (source.schemaVersion !== 1) {
    fail("unsupported_schema_version");
  }

  if (typeof source.scenarioId !== "string" || !source.scenarioId.trim()) {
    fail("scenario_id_required");
  }

  if (!isSha256Hex(source.contentSha256)) {
    fail("content_sha256_invalid");
  }

  if (
    source.decision !== "pending" &&
    source.decision !== "approved" &&
    source.decision !== "changes_requested" &&
    source.decision !== "hold"
  ) {
    fail("decision_invalid");
  }

  if (
    !source.reviewer ||
    typeof source.reviewer !== "object" ||
    typeof source.reviewer.nameOrRole !== "string" ||
    typeof source.reviewer.reviewedAt !== "string"
  ) {
    fail("reviewer_invalid");
  }

  if (!source.checks || typeof source.checks !== "object") {
    fail("checks_required");
  }

  const checks = source.checks as Record<string, unknown>;
  for (const key of HUMAN_REVIEW_CHECK_KEYS) {
    if (
      checks[key] !== "pending" &&
      checks[key] !== "pass" &&
      checks[key] !== "hold"
    ) {
      fail(`check_invalid:${key}`);
    }
  }

  if (
    !source.attestations ||
    typeof source.attestations !== "object" ||
    typeof source.attestations.reviewedExactHash !== "boolean" ||
    typeof source.attestations.understandsHashInvalidation !== "boolean"
  ) {
    fail("attestations_invalid");
  }

  if (typeof source.notes !== "string") {
    fail("notes_must_be_string");
  }

  return source as HumanReviewRecord;
}

export function assertApprovedHumanReviewRecord(
  record: HumanReviewRecord,
  expected: {
    scenarioId: string;
    contentSha256: string;
  },
): void {
  if (record.scenarioId !== expected.scenarioId) {
    fail(
      `scenario_id_mismatch:${record.scenarioId}!=${expected.scenarioId}`,
    );
  }

  if (record.contentSha256 !== expected.contentSha256) {
    fail(
      `content_sha256_mismatch:${record.contentSha256}!=${expected.contentSha256}`,
    );
  }

  if (record.decision !== "approved") {
    fail(`decision_not_approved:${record.decision}`);
  }

  if (!record.reviewer.nameOrRole.trim()) {
    fail("reviewer_name_or_role_required");
  }

  if (!isIsoDate(record.reviewer.reviewedAt)) {
    fail("reviewed_at_invalid");
  }

  for (const key of HUMAN_REVIEW_CHECK_KEYS) {
    if (record.checks[key] !== "pass") {
      fail(`check_not_pass:${key}=${record.checks[key]}`);
    }
  }

  if (record.attestations.reviewedExactHash !== true) {
    fail("reviewed_exact_hash_attestation_required");
  }

  if (record.attestations.understandsHashInvalidation !== true) {
    fail("hash_invalidation_attestation_required");
  }
}
