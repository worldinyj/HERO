import { describe, expect, it } from "vitest";
import { canConfirmPlantTransition } from "./plantTransitionConfirmation";

describe("Admin plant suspension safety acknowledgement", () => {
  const active = { code: "SAEUL", is_active: true };
  it("requires exact case-sensitive plant code and a separate acknowledgement", () => {
    expect(canConfirmPlantTransition(active, "SAEUL", true)).toBe(true);
    expect(canConfirmPlantTransition(active, "saeul", true)).toBe(false);
    expect(canConfirmPlantTransition(active, "SAEUL", false)).toBe(false);
    expect(canConfirmPlantTransition(active, "OTHER", true)).toBe(false);
    expect(canConfirmPlantTransition(null, "SAEUL", true)).toBe(false);
  });
  it("also requires confirmation when reactivating a plant", () => {
    expect(canConfirmPlantTransition({ ...active, is_active: false }, "SAEUL", true)).toBe(true);
  });
});
