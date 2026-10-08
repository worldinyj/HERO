import { describe, expect, it } from "vitest";
import { readIssuedInviteLink } from "./inviteResponse";

const good = {
  invitationId: "abc-123",
  inviteUrl: "https://hero.example/i/one-time-token",
  expiresAt: "2026-10-15T00:00:00.000Z",
  plantDisplayName: "새울",
};

describe("one-time invite response integrity", () => {
  it("accepts a complete HTTPS invite response", () => {
    expect(readIssuedInviteLink(good)).toEqual(good);
  });
  it("accepts a valid local HTTP invite during development", () => {
    expect(readIssuedInviteLink({ ...good, inviteUrl: "http://localhost:5173/i/token" })).not.toBeNull();
  });
  it.each([null, undefined, [], {}, "", 42, { error: "internal_error" }])(
    "rejects an ambiguous success response %s", (value) => {
      expect(readIssuedInviteLink(value)).toBeNull();
    },
  );
  it.each(["invitationId", "inviteUrl", "expiresAt", "plantDisplayName"] as const)(
    "requires nonempty %s field", (key) => {
      expect(readIssuedInviteLink({ ...good, [key]: "" })).toBeNull();
      expect(readIssuedInviteLink({ ...good, [key]: undefined })).toBeNull();
    },
  );
  it("rejects unparseable or unsafe link values", () => {
    expect(readIssuedInviteLink({ ...good, inviteUrl: "javascript:alert(1)" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, inviteUrl: "/i/relative-token" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, expiresAt: "not-a-date" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, error: "internal_error" })).toBeNull();
  });
});
