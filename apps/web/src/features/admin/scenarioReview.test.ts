import { describe, expect, it, vi, afterEach } from "vitest";
import { ScenarioSchema } from "@hero/schema";
import draft from "../../../../../scenarios/drafts/S03_procedure_reality_v1.json";
import generated from "./scenarioReviewStatus.generated.json";
import { canonicalContent, matchesReviewTarget, type ReviewTarget } from "./scenarioReview";

const target = generated as ReviewTarget;
afterEach(() => vi.unstubAllGlobals());
describe("review target identity", () => {
  it("matches the exact schema-validated S03 and tolerates reordered JSON keys", async () => {
    const reordered = Object.fromEntries(Object.entries(draft).reverse());
    expect(await matchesReviewTarget(ScenarioSchema.parse(reordered), target)).toBe(true);
    expect(canonicalContent({ b: [2, 1], a: { z: 0, x: 1 } })).toBe(canonicalContent({ a: { x: 1, z: 0 }, b: [2, 1] }));
  });
  it("rejects changed content even with the same version and ID", async () => {
    const changed = ScenarioSchema.parse(draft);
    changed.title += " (검토 수정)";
    expect(await matchesReviewTarget(changed, target)).toBe(false);
  });
  it("rejects a different version or scenario identity", async () => {
    const changed = ScenarioSchema.parse(draft);
    changed.version += 1;
    expect(await matchesReviewTarget(changed, target)).toBe(false);
    changed.version = target.version; changed.id = "another_scenario";
    expect(await matchesReviewTarget(changed, target)).toBe(false);
  });
  it("does not treat an unavailable digest as a match", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: async () => { throw new Error("unavailable"); } } });
    await expect(matchesReviewTarget(ScenarioSchema.parse(draft), target)).rejects.toThrow("unavailable");
  });
});
