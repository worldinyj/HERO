import { describe, expect, it } from "vitest";
import { availablePlantSuggestions, KHNP_PLANT_CATALOG } from "./khnpPlantCatalog";

describe("KHNP station presets", () => {
  it("keeps all fifteen verified stations unique", () => {
    expect(KHNP_PLANT_CATALOG).toHaveLength(15);
    expect(new Set(KHNP_PLANT_CATALOG.map(item => item.code)).size).toBe(15);
    expect(KHNP_PLANT_CATALOG.every(item => item.source.startsWith("https://"))).toBe(true);
  });
  it("includes Shin-Hanul as a distinct unit and prevents HANUL3 duplication", () => {
    expect(KHNP_PLANT_CATALOG.some(item => item.code === "SHINHANUL1")).toBe(true);
    expect(availablePlantSuggestions(["hanul3"]).some(item => item.code === "HANUL3")).toBe(false);
    expect(availablePlantSuggestions(["hanul3"])).toHaveLength(14);
  });
});
