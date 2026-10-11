import { describe, expect, it } from "vitest";
import tutorial from "../../../../../scenarios/data/S00_tutorial.json";
import { parsePreviewJson, readSavedPreview, validatePreviewScenario } from "./scenarioPreviewValidation";

describe("admin scenario preview validation", () => {
  it("accepts the real tutorial without mutating its source", () => {
    const before = JSON.stringify(tutorial);
    expect(parsePreviewJson(before).scenario?.id).toBe("s00_tutorial");
    expect(JSON.stringify(tutorial)).toBe(before);
  });
  it.each(["null", "[]", '{"title":{}}', "{"])("blocks malformed or incomplete input: %s", text => {
    expect(parsePreviewJson(text).scenario).toBeNull();
    expect(parsePreviewJson(text).issues.length).toBeGreaterThan(0);
  });
  it("blocks schema-valid content with broken scene links", () => {
    const changed = structuredClone(tutorial);
    changed.startNode = "missing-scene";
    expect(validatePreviewScenario(changed).issues.some(issue => issue.path === "startNode")).toBe(true);
    expect(validatePreviewScenario(changed).scenario).toBeNull();
  });
  it("only accepts the requested saved version and a validated scenario", () => {
    const result = { preview: true, scenarioVersionId: "requested-version", scenario: tutorial };
    expect(readSavedPreview(result, "requested-version", 1).scenario?.id).toBe("s00_tutorial");
    expect(readSavedPreview(result, "different-version", 1).scenario).toBeNull();
    expect(readSavedPreview(result, "requested-version", 2).scenario).toBeNull();
    expect(readSavedPreview({ ...result, preview: false }, "requested-version", 1).scenario).toBeNull();
    expect(readSavedPreview({ ...result, error: "failure" }, "requested-version", 1).scenario).toBeNull();
    expect(readSavedPreview({ ...result, scenario: null }, "requested-version", 1).scenario).toBeNull();
    expect(readSavedPreview(null, "requested-version", 1).scenario).toBeNull();
  });
});
