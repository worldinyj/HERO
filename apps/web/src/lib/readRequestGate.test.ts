import { describe, expect, it } from "vitest";
import { ReadRequestGate } from "./readRequestGate";

describe("latest admin and manager roster read wins", () => {
  it("accepts the single active read", () => {
    const gate = new ReadRequestGate();
    const revision = gate.begin();
    expect(gate.isCurrent(revision)).toBe(true);
  });

  it("rejects a slow old response after a newer refresh began", () => {
    const gate = new ReadRequestGate();
    const old = gate.begin();
    const newer = gate.begin();
    expect(gate.isCurrent(old)).toBe(false);
    expect(gate.isCurrent(newer)).toBe(true);
  });

  it("ignores delayed failed responses as well as successful ones", () => {
    const gate = new ReadRequestGate();
    const stale = gate.begin();
    gate.begin();
    expect(gate.isCurrent(stale)).toBe(false);
  });

  it("rejects a response after component unmount", () => {
    const gate = new ReadRequestGate();
    const started = gate.begin();
    gate.invalidate();
    expect(gate.isCurrent(started)).toBe(false);
  });

  it("rejects unknown future revisions", () => {
    const gate = new ReadRequestGate();
    const started = gate.begin();
    expect(gate.isCurrent(started + 1)).toBe(false);
  });
});
