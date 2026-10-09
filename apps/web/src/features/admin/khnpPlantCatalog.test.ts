import { describe, expect, it } from "vitest";
import { availablePlantSuggestions, groupedPlantSuggestions, KHNP_PLANT_CATALOG } from "./khnpPlantCatalog";

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
  it("groups five headquarters and keeps registered plants visible but unavailable", () => {
    const groups = groupedPlantSuggestions(["hanul3"]);
    expect(groups.map(group => group.group)).toEqual(["고리", "한빛", "월성", "한울", "새울"]);
    expect(groups.flatMap(group => group.plants)).toHaveLength(15);
    const hanul3 = groups.flatMap(group => group.plants).find(item => item.code === "HANUL3");
    expect(hanul3?.registered).toBe(true);
    expect(groups.flatMap(group => group.plants).filter(item => item.registered)).toHaveLength(1);
    expect(groups.find(group => group.group === "한울")?.plants.some(item => item.code === "SHINHANUL1")).toBe(true);
  });
});
