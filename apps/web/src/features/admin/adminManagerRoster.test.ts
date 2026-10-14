import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_MANAGER_FILTERS, exactManagerCount, isCurrentManager, readManagerPage, readPlantManagerCounts } from "./adminManagerRoster";

const manager = { id: "m", plant_id: "p", real_name: "홍길동", nickname: "SAFE", is_active: true, plants: null };
function fixture(data: unknown, total: number | null, status = 200) {
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...(total === null ? {} : { "content-range": `0-19/${total}` }) },
  }));
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  return { fetch, client };
}

describe("server-side manager roster", () => {
  it("rechecks the selected ID independently from the filtered page before issuing a link", async () => {
    const { client, fetch } = fixture(manager, 1);
    expect(await isCurrentManager(client, manager)).toBe(true);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("id")).toBe("eq.m");
    expect(url.searchParams.get("role")).toBe("eq.plant_manager");
    for (const row of [null, { ...manager, is_active: false }, { ...manager, plant_id: "other" }, { ...manager, real_name: "changed" }]) {
      expect(await isCurrentManager(fixture(row, 1).client, manager)).toBe(false);
    }
    expect(await isCurrentManager(fixture({ message: "denied" }, null, 403).client, manager)).toBe(false);
  });
  it("requests only the second page with exact count, mandatory role and stable ordering", async () => {
    const { client, fetch } = fixture([manager], 21);
    expect(await readManagerPage(client, EMPTY_MANAGER_FILTERS, 1)).toEqual({ rows: [manager], total: 21 });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("role")).toBe("eq.plant_manager");
    expect(url.searchParams.get("order")).toBe("real_name.asc,id.asc");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get("prefer")).toBe("count=exact");
  });
  it("sends name, plant and inactive filters to the server and escapes LIKE wildcards", async () => {
    const { client, fetch } = fixture([], 0);
    await readManagerPage(client, { name: "  홍%_\\  ", plantId: "p", status: "inactive" }, 0);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.searchParams.get("real_name")).toBe("ilike.%홍\\%\\_\\\\%");
    expect(url.searchParams.get("plant_id")).toBe("eq.p");
    expect(url.searchParams.get("is_active")).toBe("eq.false");
    expect(url.searchParams.has("or")).toBe(false);
  });
  it("omits optional filters for all managers", async () => {
    const { client, fetch } = fixture([], 0);
    await readManagerPage(client, EMPTY_MANAGER_FILTERS, 0);
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    for (const key of ["plant_id", "is_active", "real_name"]) expect(url.searchParams.has(key)).toBe(false);
  });
  it("rejects unsupported search and invalid pages before requesting", async () => {
    const { client, fetch } = fixture([], 0);
    await expect(readManagerPage(client, { ...EMPTY_MANAGER_FILTERS, name: "홍*" }, 0)).rejects.toThrow();
    await expect(readManagerPage(client, EMPTY_MANAGER_FILTERS, -1)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed on missing count, denied reads, malformed or truncated rows", async () => {
    for (const [data, count, status] of [[[], null, 200], [[], 40, 200], [{ message: "denied" }, null, 403], [[{ id: "broken" }], 1, 200]] as const) {
      const { client } = fixture(data, count, status);
      await expect(readManagerPage(client, EMPTY_MANAGER_FILTERS, 0)).rejects.toBeDefined();
    }
  });
  it("allows an empty page after the last row is removed so the UI can clamp its page", async () => {
    const { client } = fixture([], 20);
    expect(await readManagerPage(client, EMPTY_MANAGER_FILTERS, 1)).toEqual({ rows: [], total: 20 });
  });
  it("keeps full plant counts independent from the displayed manager page", () => {
    expect(readPlantManagerCounts([{ id: "a", profiles: [{ count: 47 }] }, { id: "b", profiles: [{ count: 0 }] }]))
      .toEqual(new Map([["a", 47], ["b", 0]]));
    for (const profiles of [[], null, [{ count: null }], [{ count: -1 }]]) {
      expect(() => readPlantManagerCounts([{ id: "a", profiles }])).toThrow();
    }
    for (const count of [null, NaN, -1, 0.5]) expect(() => exactManagerCount(count)).toThrow();
    expect(exactManagerCount(0)).toBe(0);
  });
});
