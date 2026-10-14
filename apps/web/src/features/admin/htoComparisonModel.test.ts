import { describe, expect, it } from "vitest";
import { describeHtoConditions, HTO_CHOICES } from "./htoComparisonModel";

describe("HTO qualitative condition comparison", () => {
  it("changes only the selected support, preserving latent uncertainty and the same judgment", () => {
    for (const choice of HTO_CHOICES) {
      const base = describeHtoConditions({ clearIdentification: false, verificationSupport: false }, choice.id);
      const technical = describeHtoConditions({ clearIdentification: true, verificationSupport: false }, choice.id);
      const organizational = describeHtoConditions({ clearIdentification: false, verificationSupport: true }, choice.id);
      const both = describeHtoConditions({ clearIdentification: true, verificationSupport: true }, choice.id);
      expect(technical.identification).not.toBe(base.identification);
      expect(technical.support).toBe(base.support);
      expect(organizational.identification).toBe(base.identification);
      expect(organizational.support).not.toBe(base.support);
      expect(both.identification).toBe(technical.identification);
      expect(both.support).toBe(organizational.support);
      for (const result of [technical, organizational, both]) {
        expect(result.action).toBe(base.action);
        expect(result.uncertainty).toBe(base.uncertainty);
        expect(result.uncertainty).toContain("안전 완료를 보장하지 않으며");
      }
    }
  });
});
