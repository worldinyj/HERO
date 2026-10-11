import { describe, expect, it } from "vitest";
import { confirmedStatusResponse, scenarioErrorMessage } from "./scenarioStatus";

describe("scenario status result confirmation", () => {
  const result = { updated: true, version: { id: "requested", version: 2, status: "review" } };
  it("requires matching saved ID, status, and version", () => {
    expect(confirmedStatusResponse(result, "requested", "review", 2)).toBe(true);
    expect(confirmedStatusResponse(result, "other", "review", 2)).toBe(false);
    expect(confirmedStatusResponse(result, "requested", "published", 2)).toBe(false);
    expect(confirmedStatusResponse(result, "requested", "review", 3)).toBe(false);
  });
  it("rejects error envelopes and malformed success responses", () => {
    for (const value of [null, [], {}, { ...result, updated: false }, { ...result, error: "failed" }, { updated: true, version: [] }]) {
      expect(confirmedStatusResponse(value, "requested", "review", 2)).toBe(false);
    }
  });
});

describe("scenario server error guidance", () => {
  it("reads a known code from an HTTP error response without consuming it", async () => {
    const context = new Response(JSON.stringify({ error: "scenario_incident_debrief_required" }), { status: 409 });
    expect(await scenarioErrorMessage({ context })).toContain("익명화된 실사건 회고");
    expect(context.bodyUsed).toBe(false);
  });
  it("explains stale transitions without rendering the server details", async () => {
    const message = await scenarioErrorMessage(new Error("invalid_status_transition:secret"));
    expect(message).toContain("목록을 새로고침");
    expect(message).not.toContain("secret");
  });
  it("explains concurrent state and content changes", async () => {
    expect(await scenarioErrorMessage({ context: new Response(JSON.stringify({ error: "scenario_status_conflict" }), { status: 409 }) })).toContain("다른 관리자가 상태를 변경");
    expect(await scenarioErrorMessage(new Error("scenario_content_conflict"))).toContain("저장된 내용이 변경");
    expect(await scenarioErrorMessage(new Error("invalid_status_transition"))).toContain("목록을 새로고침");
  });
  it("does not expose unknown, malformed, or inherited error codes", async () => {
    for (const cause of [new Error("database secret"), new Error("toString"), { context: new Response("not JSON") }, { context: new Response("null") }, null]) {
      expect(await scenarioErrorMessage(cause)).toBe("처리 결과를 확인하지 못했습니다. 취소 후 목록을 새로고침해 반영 여부를 확인한 뒤 다시 시도해주세요.");
    }
  });
});
