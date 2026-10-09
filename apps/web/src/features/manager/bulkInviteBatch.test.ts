import { describe, expect, it } from "vitest";
import { MAX_INVITES_PER_RUN, nextInviteBatchRange } from "./bulkInviteBatch";

describe("resumable invite batch", () => {
  it("limits each run below the server quota", () => {
    expect(MAX_INVITES_PER_RUN).toBeLessThan(30);
    expect(nextInviteBatchRange(0, 200)).toHaveLength(MAX_INVITES_PER_RUN);
  });

  it("resumes at the next unfinished row without regenerating links", () => {
    expect(nextInviteBatchRange(0, 27)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(nextInviteBatchRange(25, 27)).toEqual([25, 26]);
    expect(nextInviteBatchRange(27, 27)).toEqual([]);
  });

  it("rejects contradictory progress or oversized input", () => {
    expect(() => nextInviteBatchRange(-1, 2)).toThrow();
    expect(() => nextInviteBatchRange(3, 2)).toThrow();
    expect(() => nextInviteBatchRange(0, 201)).toThrow();
  });
});
