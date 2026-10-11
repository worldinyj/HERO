import { describe, expect, it } from "vitest";
import { ScenarioSchema, type Scenario } from "@hero/schema";
import tutorial from "../../../../../scenarios/data/S00_tutorial.json";
import { diffGroup, diffPath, diffScenarios, diffValue } from "./scenarioDiff";

function baseline(): Scenario { return ScenarioSchema.parse(tutorial); }

describe("scenario content comparison", () => {
  it("ignores version numbers and object insertion order without mutating snapshots", () => {
    const before = baseline();
    const after = { ...before, version: 2, nodes: Object.fromEntries(Object.entries(before.nodes).reverse()) };
    const source = JSON.stringify(before);
    expect(diffScenarios(before, after)).toEqual([]);
    expect(JSON.stringify(before)).toBe(source);
  });
  it("compares choice changes by action ID despite reordering", () => {
    const before = baseline(); const after = structuredClone(before);
    const node = after.nodes.decision_identify;
    if (node?.type !== "decision") throw Error("fixture");
    node.choices.reverse();
    node.choices.find(choice => choice.actionId === "check_procedure")!.timeCostMin = 3;
    const rows = diffScenarios(before, after);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.path.at(-1) === "timeCostMin")).toMatchObject({ path: ["nodes", "decision_identify", "choices", "check_procedure", "timeCostMin"], before: 2, after: 3 });
    expect(rows.some(row => row.path.at(-1) === "$order")).toBe(true);
  });
  it("reports added and removed actions separately from order changes", () => {
    const before = baseline(); const after = structuredClone(before);
    const node = after.nodes.decision_identify;
    if (node?.type !== "decision") throw Error("fixture");
    node.infoActions = [{ ...node.infoActions[0]!, actionId: "read_new_label" }];
    const rows = diffScenarios(before, after);
    expect(rows.find(row => row.path.at(-1) === "read_label")?.kind).toBe("removed");
    expect(rows.find(row => row.path.at(-1) === "read_new_label")?.kind).toBe("added");
  });
  it("keeps zero, false, empty arrays, and missing values distinct", () => {
    const before = baseline(); const after = structuredClone(before);
    after.initialState.barriers.extra = 0;
    const node = after.nodes.decision_identify;
    if (node?.type !== "decision") throw Error("fixture");
    node.choices[0]!.effects = { flags: { enabled: false } };
    after.cards = [];
    const rows = diffScenarios(before, after);
    expect(rows.find(row => row.path.at(-1) === "extra")).toMatchObject({ kind: "added", before: undefined, after: 0 });
    expect(rows.some(row => diffValue(row.after).includes('"enabled": false'))).toBe(true);
    expect(diffValue(false)).toBe("false"); expect(diffValue([])).toBe("[]"); expect(diffValue(undefined)).toBe("없음");
  });
  it("compares initial conditions, node additions, type changes and debrief content", () => {
    const before = baseline(); const after = structuredClone(before);
    after.initialState.baseHazard = 41;
    after.nodes.extra = { type: "ending", ending: "safe_stop", title: "정지", summary: "검토" };
    after.nodes.intro = { type: "event", text: "새 안내", next: "decision_identify", tone: "neutral" };
    after.incidentDebrief = { caseType: "검토 사건", overview: "회고", directCauses: ["직접 원인"], rootCauses: ["근본 원인"], contributingFactors: ["기여 요인"], lessons: [{ title: "교훈", detail: "확인" }], causalChain: [], failedBarriers: [], correctiveActions: [], sources: [] };
    const rows = diffScenarios(before, after);
    expect(rows.find(row => row.path.join("/") === "initialState/baseHazard")?.after).toBe(41);
    expect(rows.find(row => row.path.join("/") === "nodes/extra")?.kind).toBe("added");
    expect(rows.find(row => row.path.join("/") === "nodes/intro/type")?.after).toBe("event");
    expect(rows.find(row => row.path[0] === "incidentDebrief")?.kind).toBe("added");
    expect(diffGroup(["incidentDebrief", "sources"])).toBe("실사건 회고");
  });
  it("does not confuse JSON path punctuation or prototype-like node IDs", () => {
    const before = baseline(); const after = structuredClone(before);
    after.nodes = JSON.parse(JSON.stringify({ ...after.nodes, ["__proto__"]: { type: "ending", ending: "safe_stop", title: "중단", summary: "검토" } }));
    expect(diffScenarios(before, after).find(row => row.path[1] === "__proto__")?.kind).toBe("added");
    expect(diffPath(["nodes", "a.b/c~d"])).toBe("/nodes/a.b~1c~0d");
  });
  it("rejects unrelated scenarios", () => {
    const before = baseline();
    expect(() => diffScenarios(before, { ...before, id: "different" })).toThrow("different_scenarios");
  });
});
