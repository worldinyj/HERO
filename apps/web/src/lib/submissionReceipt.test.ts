import { describe, expect, it } from "vitest";
import { isConfirmedSubmissionResponse, submissionServerErrorCode } from "./submissionReceipt";

const SESSION = "f1000000-0000-4000-8000-000000000001";
const receipt = {
  sessionId: SESSION, alreadyCompleted: false, evaluation: { hpPoint: 75 },
};

describe("server session completion receipts", () => {
  it("accepts an authoritative completion or idempotent replay", () => {
    expect(isConfirmedSubmissionResponse(receipt, SESSION)).toBe(true);
    expect(isConfirmedSubmissionResponse({ ...receipt, alreadyCompleted: true }, SESSION)).toBe(true);
  });

  it("refuses ambiguous 2xx bodies so queued decisions survive", () => {
    expect(isConfirmedSubmissionResponse(null, SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse([], SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse({}, SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse({ ...receipt, sessionId: "wrong" }, SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse({ ...receipt, alreadyCompleted: undefined }, SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse({ ...receipt, evaluation: null }, SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse({ ...receipt, evaluation: [] }, SESSION)).toBe(false);
    expect(isConfirmedSubmissionResponse({ ...receipt, error: "internal_error" }, SESSION)).toBe(false);
  });
});

describe("Supabase FunctionsHttpError suspension code", () => {
  it("recognizes only a valid JSON error in the HTTP context", async () => {
    const error = { context: new Response(JSON.stringify({ error: "plant_inactive" }),
      { status: 403, headers: { "content-type": "application/json" } }) };
    expect(await submissionServerErrorCode(error)).toBe("plant_inactive");
    expect(error.context.bodyUsed).toBe(false);
    expect(await submissionServerErrorCode({ context: new Response("invalid", { status: 403 }) })).toBeNull();
    expect(await submissionServerErrorCode({ context: undefined })).toBeNull();
    expect(await submissionServerErrorCode({ context: new Response("[]") })).toBeNull();
  });
});
