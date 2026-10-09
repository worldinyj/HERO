import { describe, expect, it } from "vitest";
import { AuthLoadGate } from "./authLoadGate";

describe("auth read generation gate", () => {
  it("discards a previous account's response", () => {
    const gate = new AuthLoadGate();
    const a = gate.begin("user-A");
    const b = gate.begin("user-B");
    expect(gate.isCurrent(a, "user-A")).toBe(false);
    expect(gate.isCurrent(b, "user-B")).toBe(true);
  });

  it("discards profile responses after sign-out", () => {
    const gate = new AuthLoadGate();
    const request = gate.begin("user-A");
    gate.begin(null);
    expect(gate.isCurrent(request, "user-A")).toBe(false);
  });

  it("rejects an earlier refresh for the same user", () => {
    const gate = new AuthLoadGate();
    const old = gate.begin("user-A");
    const current = gate.begin("user-A");
    expect(gate.isCurrent(old, "user-A")).toBe(false);
    expect(gate.isCurrent(current, "user-A")).toBe(true);
  });

  it("invalidates outstanding reads on cleanup", () => {
    const gate = new AuthLoadGate();
    const old = gate.begin("user-A");
    gate.invalidate();
    expect(gate.isCurrent(old, "user-A")).toBe(false);
  });

  it("rejects an incorrect user ID even for the same revision", () => {
    const gate = new AuthLoadGate();
    const current = gate.begin("user-A");
    expect(gate.isCurrent(current, "user-B")).toBe(false);
  });
});
