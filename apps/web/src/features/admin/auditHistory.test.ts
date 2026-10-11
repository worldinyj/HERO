import { describe, expect, it } from "vitest";
import { auditDateBounds, readAuditRows } from "./auditHistory";
const row = { id: 7, actor_user_id: null, plant_id: null, action: "future.event", entity_type: "season", entity_id: "test", created_at: "2026-10-11T12:00:00Z" };
describe("audit history boundary", () => {
  it("includes the whole selected Korean calendar day", () => {
    expect(auditDateBounds({ action: "", from: "2026-10-11", to: "2026-10-11" })).toEqual({ from: "2026-10-10T15:00:00.000Z", to: "2026-10-11T15:00:00.000Z" });
  });
  it("rejects invalid and reversed dates", () => {
    for (const [from, to] of [["2026-02-30", ""], ["2026-10-12", "2026-10-11"], ["foo", ""]]) {
      expect(() => auditDateBounds({ action: "", from: from!, to: to! })).toThrow();
    }
  });
  it("keeps new event codes and removes unexpected metadata", () => {
    expect(readAuditRows([{ ...row, metadata: { token: "secret" } }])).toEqual([row]);
  });
  it("rejects malformed identifiers, duplicate and unsorted cursor rows", () => {
    for (const data of [null, [{ ...row, id: Number.MAX_SAFE_INTEGER + 1 }], [{ ...row, created_at: "bad" }], [row, row], [{ ...row, id: 1 }, row]]) {
      expect(() => readAuditRows(data)).toThrow();
    }
  });
});
