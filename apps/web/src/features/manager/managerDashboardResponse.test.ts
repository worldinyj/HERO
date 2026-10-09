import { describe, expect, it } from "vitest";
import { isValidManagerDashboardLists } from "./managerDashboardResponse";

describe("manager reconciliation roster contract", () => {
  it("accepts three real empty arrays", () => {
    expect(isValidManagerDashboardLists([], [], [])).toBe(true);
  });

  it("accepts valid nonempty player/invite/aggregate rows", () => {
    expect(isValidManagerDashboardLists(
      [{ profile_id: "player-1", nickname: "SAFE", is_active: true }],
      [{ invitation_id: "invite-1", invitee_name: "Invitee" }],
      [{ job_role: "worker" }],
    )).toBe(true);
  });

  it.each([null, undefined, {}, "[]", 42])(
    "refuses non-array RPC output %s before releasing retry locks",
    (data) => {
      expect(isValidManagerDashboardLists(data, [], [])).toBe(false);
      expect(isValidManagerDashboardLists([], data, [])).toBe(false);
      expect(isValidManagerDashboardLists([], [], data)).toBe(false);
    },
  );

  it("refuses partial or malformed rows in any roster", () => {
    expect(isValidManagerDashboardLists([{ profile_id: "1" }], [], [])).toBe(false);
    expect(isValidManagerDashboardLists([{ profile_id: "1", nickname: "N", is_active: "true" }], [], [])).toBe(false);
    expect(isValidManagerDashboardLists([], [{ invitation_id: "1" }], [])).toBe(false);
    expect(isValidManagerDashboardLists([], [], [{ job_role: null }])).toBe(false);
  });
});
