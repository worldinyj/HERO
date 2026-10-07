import { describe, expect, it } from "vitest";
import { clockUrgency, formatGameClock } from "./GameClock";

describe("GameClock helpers", () => {
  it("formats minute values as 24-hour clock text", () => {
    expect(formatGameClock(0)).toBe("00:00");
    expect(formatGameClock(540)).toBe("09:00");
    expect(formatGameClock(1439)).toBe("23:59");
    expect(formatGameClock(1440)).toBe("00:00");
  });

  it("classifies deadline urgency without exposing hazard data", () => {
    expect(clockUrgency(500, 600)).toBe("normal");
    expect(clockUrgency(575, 600)).toBe("attention");
    expect(clockUrgency(590, 600)).toBe("urgent");
    expect(clockUrgency(601, 600)).toBe("overdue");
  });
});
