import { describe, expect, it } from "vitest";
import { readIssuedInviteLink, readReissuedInviteLink, readCanceledInviteResult } from "./inviteResponse";

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
    expect(readIssuedInviteLink({ ...good, inviteUrl: "http://hero.example/i/token" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, inviteUrl: "https://u:p@hero.example/i/token" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, inviteUrl: "https://hero.example/i/token?copy=yes" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, inviteUrl: "https://hero.example/i/token#fragment" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, inviteUrl: "https://hero.example/other/token" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, inviteUrl: "https://hero.example/i/" })).toBeNull();
  });
});

describe("reissued invitation must be tied to its requested original", () => {
  const reissued = { ...good, reissued: true, oldInvitationId: "original-1" };
  it("accepts only the matching original ID and a distinct replacement", () => {
    expect(readReissuedInviteLink(reissued, "original-1")).toEqual(good);
    expect(readReissuedInviteLink(reissued, "different-original")).toBeNull();
    expect(readReissuedInviteLink({ ...reissued, invitationId: "original-1" }, "original-1")).toBeNull();
  });
  it("rejects incomplete rotation and malformed one-time link", () => {
    expect(readReissuedInviteLink({ ...good }, "original-1")).toBeNull();
    expect(readReissuedInviteLink({ ...reissued, reissued: false }, "original-1")).toBeNull();
    expect(readReissuedInviteLink({ ...reissued, inviteUrl: "javascript:alert(1)" }, "original-1")).toBeNull();
    expect(readReissuedInviteLink(null, "original-1")).toBeNull();
  });
});

describe("cancellation acknowledgment matches requested invitation", () => {
  const acknowledgment = {
    canceled: true,
    invitationId: "inv-123",
    canceledAt: "2026-10-08T03:00:00.000Z",
  };
  it("accepts a matching committed cancellation", () => {
    expect(readCanceledInviteResult(acknowledgment, "inv-123")).toEqual(acknowledgment);
  });
  it("locks ambiguous or unrelated acknowledgments", () => {
    expect(readCanceledInviteResult(acknowledgment, "inv-other")).toBeNull();
    expect(readCanceledInviteResult({ ...acknowledgment, canceled: false }, "inv-123")).toBeNull();
    expect(readCanceledInviteResult({ ...acknowledgment, canceledAt: "broken" }, "inv-123")).toBeNull();
    expect(readCanceledInviteResult(null, "inv-123")).toBeNull();
  });
});
