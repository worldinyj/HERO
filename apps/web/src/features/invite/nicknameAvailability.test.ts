import { describe, expect, it } from "vitest";
import { currentNicknameCheck } from "./nicknameAvailability";

describe("invitation nickname check freshness", () => {
  const available = { value: "PLAY1", checking: false, available: true, error: null };

  it("accepts only a result for the current typed value", () => {
    expect(currentNicknameCheck("PLAY1", available)?.available).toBe(true);
    expect(currentNicknameCheck("PLAY2", available)).toBeNull();
    expect(currentNicknameCheck("", available)).toBeNull();
  });

  it("trims the value consistently with the server request", () => {
    expect(currentNicknameCheck(" PLAY1 ", available)?.available).toBe(true);
  });

  it("does not treat a pending validation as a positive result", () => {
    expect(currentNicknameCheck("PLAY1", { ...available, checking: true, available: false })?.available).toBe(false);
  });
});
