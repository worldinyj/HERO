import { describe, expect, it } from "vitest";
import { isValidAdminOrgLists } from "./adminOrgResponse";

const plant = { id: "p", code: "SAEUL", display_name: "새울", is_active: true };
const manager = { id: "m", real_name: "홍길동", nickname: "SAFE", is_active: true, plant_id: "p" };
const invitation = { id: "i", plant_id: "p", invitee_name: "김철수" };

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
