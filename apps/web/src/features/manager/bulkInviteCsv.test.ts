import { describe, expect, it } from "vitest";
import { csvEscape } from "./bulkInviteCsv";

describe("bulk invitation CSV export", () => {
  it("keeps ordinary names and links intact", () => {
    expect(csvEscape("홍길동")).toBe('"홍길동"');
    expect(csvEscape("https://hero.example/i/token")).toBe('"https://hero.example/i/token"');
  });

  it("escapes quotes and commas", () => {
    expect(csvEscape('Kim, "K"')).toBe('"Kim, ""K"""');
  });

  it.each(["=2+3", "+1", "-1+2", "@SUM(1)", "  =HYPERLINK(1)", "\t=1+1"])(
    "neutralizes spreadsheet formula %s",
    (value) => {
      expect(csvEscape(value).startsWith('"\'')).toBe(true);
    },
  );
});
