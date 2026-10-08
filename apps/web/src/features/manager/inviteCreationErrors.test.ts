import { describe, expect, it } from "vitest";
import { InviteCreationOutcomeUnknownError, isDefiniteInviteRejection } from "./inviteCreationErrors";

describe("invite issuance uncertain outcomes", () => {
  it.each([400, 401, 403, 404, 409, 429])("treats %i as rejected before insert", (status) => {
    expect(isDefiniteInviteRejection({ context: { status } })).toBe(true);
  });

  it.each([500, 502, 503, 504])("does not auto-retry HTTP %i", (status) => {
    expect(isDefiniteInviteRejection({ context: { status } })).toBe(false);
  });

  it("treats network errors and missing response as indeterminate", () => {
    expect(isDefiniteInviteRejection(new TypeError("Failed to fetch"))).toBe(false);
    expect(isDefiniteInviteRejection({ context: {} })).toBe(false);
    expect(isDefiniteInviteRejection(null)).toBe(false);
  });

  it("keeps distinct error type for retry-lock UI", () => {
    expect(new InviteCreationOutcomeUnknownError()).toBeInstanceOf(Error);
  });
});
