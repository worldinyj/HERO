import { describe, expect, it } from "vitest";
import { isValidAdminOrgLists, currentPendingInvitations } from "./adminOrgResponse";

const plant = { id: "p", code: "SAEUL", display_name: "새울", is_active: true, invitation_epoch: 2 };
const manager = { id: "m", real_name: "홍길동", nickname: "SAFE", is_active: true, plant_id: "p" };
const invitation = { id: "i", plant_id: "p", invitee_name: "김철수", plant_invitation_epoch: 2 };

describe("admin invitation reconciliation roster", () => {
  it("accepts empty lists or complete valid rows", () => {
    expect(isValidAdminOrgLists([], [], [])).toBe(true);
    expect(isValidAdminOrgLists([plant], [manager], [invitation])).toBe(true);
  });
  it.each([null, undefined, {}, 42, "[]"])(
    "rejects a non-array list %s", (data) => {
      expect(isValidAdminOrgLists(data, [], [])).toBe(false);
      expect(isValidAdminOrgLists([], data, [])).toBe(false);
      expect(isValidAdminOrgLists([], [], data)).toBe(false);
    },
  );
  it("rejects missing or incorrectly typed required fields", () => {
    expect(isValidAdminOrgLists([{ ...plant, is_active: "true" }], [], [])).toBe(false);
    expect(isValidAdminOrgLists([], [{ ...manager, nickname: null }], [])).toBe(false);
    expect(isValidAdminOrgLists([], [], [{ id: "i" }])).toBe(false);
    expect(isValidAdminOrgLists([], [{ ...manager, plant_id: null }], [])).toBe(true);
  });
});

describe("epoch filtering of retained invitation history", () => {
  it("hides prior-epoch and inactive-plant links", () => {
    expect(currentPendingInvitations([plant], [invitation])).toEqual([invitation]);
    expect(currentPendingInvitations([plant], [
      { ...invitation, id:"revoked", plant_invitation_epoch: 1 },
      invitation,
    ])).toEqual([invitation]);
    expect(currentPendingInvitations([{ ...plant, is_active:false }], [invitation])).toEqual([]);
  });
  it("does not confirm mutation outcomes using responses without epoch information", () => {
    expect(isValidAdminOrgLists([{ ...plant, invitation_epoch: undefined }],[manager],[invitation])).toBe(false);
    expect(isValidAdminOrgLists([plant],[manager],[{ ...invitation, plant_invitation_epoch: undefined }])).toBe(false);
  });
});
