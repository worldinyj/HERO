import { describe, expect, it } from "vitest";
import { formatGameClock } from "./GameClock";

describe("formatGameClock", () => {
  it("formats game minutes as a 24-hour clock", () => {
    expect(formatGameClock(0)).toBe("00:00");
    expect(formatGameClock(75)).toBe("01:15");
    expect(formatGameClock(9 * 60 + 5)).toBe("09:05");
    expect(formatGameClock(24 * 60 + 7)).toBe("00:07");
  });
});
