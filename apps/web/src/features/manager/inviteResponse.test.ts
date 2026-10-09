import { describe, expect, it } from "vitest";
import { readIssuedInviteLink, readReissuedInviteLink, readCanceledInviteResult } from "./inviteResponse";

const good = {
  invitationId: "11111111-1111-4111-8111-111111111111",
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
    expect(readIssuedInviteLink({ ...good, invitationId: "not-a-uuid" })).toBeNull();
    expect(readIssuedInviteLink({ ...good, invitationId: 42 })).toBeNull();
  });
});

describe("reissued invitation must be tied to its requested original", () => {
  const reissued = { ...good, reissued: true, oldInvitationId: "22222222-2222-4222-8222-222222222222" };
  it("accepts only the matching original ID and a distinct replacement", () => {
    expect(readReissuedInviteLink(reissued, "22222222-2222-4222-8222-222222222222")).toEqual(good);
    expect(readReissuedInviteLink(reissued, "33333333-3333-4333-8333-333333333333")).toBeNull();
    expect(readReissuedInviteLink({ ...reissued, invitationId: "22222222-2222-4222-8222-222222222222" }, "22222222-2222-4222-8222-222222222222")).toBeNull();
  });
  it("rejects incomplete rotation and malformed one-time link", () => {
    expect(readReissuedInviteLink({ ...good }, "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(readReissuedInviteLink({ ...reissued, reissued: false }, "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(readReissuedInviteLink({ ...reissued, inviteUrl: "javascript:alert(1)" }, "22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(readReissuedInviteLink(null, "22222222-2222-4222-8222-222222222222")).toBeNull();
  });
});

describe("cancellation acknowledgment matches requested invitation", () => {
  const acknowledgment = {
    canceled: true,
    invitationId: "11111111-1111-4111-8111-111111111111",
    canceledAt: "2026-10-08T03:00:00.000Z",
  };
  it("accepts a matching committed cancellation", () => {
    expect(readCanceledInviteResult(acknowledgment, "11111111-1111-4111-8111-111111111111")).toEqual(acknowledgment);
  });
  it("locks ambiguous or unrelated acknowledgments", () => {
    expect(readCanceledInviteResult(acknowledgment, "33333333-3333-4333-8333-333333333333")).toBeNull();
    expect(readCanceledInviteResult({ ...acknowledgment, canceled: false }, "11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(readCanceledInviteResult({ ...acknowledgment, canceledAt: "broken" }, "11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(readCanceledInviteResult(null, "11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});
