import { readFileSync } from "node:fs";
import { ScenarioSchema } from "@hero/schema";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HtoDraftFeedback } from "./HtoDraftFeedback";
import { matchesS02HtoInput } from "./s02HtoReview";

function fixture() {
  return ScenarioSchema.parse(JSON.parse(readFileSync(new URL("../../../../../scenarios/data/S02_equipment_identity_v1.json", import.meta.url), "utf8")));
}

describe("S02 HTO teaching input binding", () => {
  it("shows a separate feedback form only for the bound scenario and version", () => {
    expect(renderToStaticMarkup(createElement(HtoDraftFeedback, { scenario: fixture() }))).toContain("HTO 시안 의견 JSON 다운로드");
    expect(renderToStaticMarkup(createElement(HtoDraftFeedback, { scenario: { ...fixture(), version: 5 } }))).not.toContain("HTO 시안 의견 JSON 다운로드");
    expect(renderToStaticMarkup(createElement(HtoDraftFeedback, { scenario: { ...fixture(), id: "another_scenario" } }))).not.toContain("HTO 시안 의견 JSON 다운로드");
  });
  it("accepts the current normalized v4 content", async () => {
    expect(await matchesS02HtoInput(fixture())).toBe(true);
    const reordered = JSON.parse(JSON.stringify(fixture(), (_key, value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const record = value as Record<string, unknown>;
      return Object.fromEntries(Object.keys(record).reverse().map(key => [key, record[key]]));
    }));
    expect(await matchesS02HtoInput(ScenarioSchema.parse(reordered))).toBe(true);
  });
  it("does not attach the teaching draft to another version or altered content", async () => {
    const source = fixture();
    expect(await matchesS02HtoInput({ ...source, version: 5 })).toBe(false);
    expect(await matchesS02HtoInput({ ...source, id: "another_scenario" })).toBe(false);
    expect(await matchesS02HtoInput({ ...source, title: "수정된 내용" })).toBe(false);
    expect(await matchesS02HtoInput({ ...source, incidentDebrief: undefined })).toBe(false);
  });
});
