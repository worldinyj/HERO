import type { Metrics } from "@hero/engine";
import { describe, expect, it } from "vitest";
import { radarPoint, radarPolygonPoints } from "./HpRadar";

const metrics: Metrics = {
  safety: 100,
  awareness: 75,
  communication: 50,
  procedure: 25,
  challenge: 0,
};

describe("HpRadar geometry", () => {
  it("places a full first axis at the top of the radar", () => {
    const point = radarPoint(100, 0);

    expect(point.x).toBeCloseTo(120, 4);
    expect(point.y).toBeCloseTo(42, 4);
  });

  it("clamps values before converting them into geometry", () => {
    const below = radarPoint(-20, 0);
    const above = radarPoint(140, 0);

    expect(below.x).toBeCloseTo(120, 4);
    expect(below.y).toBeCloseTo(120, 4);
    expect(above.y).toBeCloseTo(42, 4);
  });

  it("emits one coordinate pair per learning metric", () => {
    const points = radarPolygonPoints(metrics).split(" ");

    expect(points).toHaveLength(5);
    expect(points.every((point) => point.includes(","))).toBe(true);
  });
});
