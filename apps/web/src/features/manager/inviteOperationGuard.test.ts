import { describe, expect, it } from "vitest";
import { canStartInviteOperation, type InviteOperationState } from "./inviteOperationGuard";

const idle: InviteOperationState = {
  singlePending: false, bulkPending: false, rosterPending: false,
  csvPending: false, singleOutcomeUnknown: false, bulkOutcomeUnknown: false,
};

describe("single and CSV invitation mutation exclusion", () => {
  it("accepts an idle request", () => {
    expect(canStartInviteOperation(idle)).toBe(true);
  });
  it.each(Object.keys(idle) as Array<keyof InviteOperationState>)(
    "blocks either creation mode when %s is set", (key) => {
      expect(canStartInviteOperation({ ...idle, [key]: true })).toBe(false);
    },
  );
  it("does not clear uncertainty after the other mode becomes idle", () => {
    expect(canStartInviteOperation({ ...idle, singleOutcomeUnknown: true, bulkPending: false })).toBe(false);
    expect(canStartInviteOperation({ ...idle, bulkOutcomeUnknown: true, singlePending: false })).toBe(false);
  });
});
