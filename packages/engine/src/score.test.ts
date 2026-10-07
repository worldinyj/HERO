import { describe, expect, it } from "vitest";
import { replayImprovementPoints } from "./score";

describe("replay improvement scoring", () => {
  it("awards no bonus without replay history", () => {
    expect(replayImprovementPoints(100)).toBe(0);
  });

  it("never rewards unchanged or worse learning metrics", () => {
    expect(replayImprovementPoints(80, 80)).toBe(0);
    expect(replayImprovementPoints(60, 80)).toBe(0);
  });

  it("caps a large replay improvement at 30 HP", () => {
    expect(replayImprovementPoints(100, 0)).toBe(30);
    expect(replayImprovementPoints(100, 40)).toBe(30);
  });

  it("uses half of the rounded metric improvement below the cap", () => {
    expect(replayImprovementPoints(80, 60)).toBe(10);
    expect(replayImprovementPoints(75, 64)).toBe(6);
  });
});
