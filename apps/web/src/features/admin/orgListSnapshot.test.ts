import { describe, expect, it, vi } from "vitest";
import { readOrgListSnapshot } from "./orgListSnapshot";

const rows = Array.from({ length: 401 }, (_, id) => ({ id: String(id) }));
describe("complete organization snapshot", () => {
  it("reads beyond a response cap with inclusive stable ranges", async () => {
    const read = vi.fn(async (from: number, to: number) => ({ data: rows.slice(from, to + 1), count: rows.length, error: null }));
    expect(await readOrgListSnapshot(read)).toEqual(rows);
    expect(read.mock.calls).toEqual([[0, 199], [200, 399], [400, 599]]);
  });
  it("starts no later batch when a superseding read aborts an ignored transport", async () => {
    const controller = new AbortController();
    const read = vi.fn(async () => {
      controller.abort();
      return { data: rows.slice(0, 200), count: 401, error: null };
    });
    await expect(readOrgListSnapshot(read, controller.signal)).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("accepts an exactly empty snapshot", async () => {
    expect(await readOrgListSnapshot(async () => ({ data: [], count: 0, error: null }))).toEqual([]);
  });
  it.each([
    { data: [], count: null, error: null },
    { data: rows.slice(0, 100), count: 401, error: null },
    { data: null, count: 0, error: null },
    { data: [{ id: 1 }], count: 1, error: null },
    { data: [{ id: "1" }, { id: "1" }], count: 2, error: null },
  ])("rejects incomplete or malformed results %#", async result => {
    await expect(readOrgListSnapshot(async () => result)).rejects.toThrow();
  });
  it("rejects changed totals between batches", async () => {
    await expect(readOrgListSnapshot(async from => ({ data: rows.slice(from, from + 200), count: from ? 400 : 401, error: null }))).rejects.toThrow();
  });
  it("rejects repeated IDs across batches even with an unchanged count", async () => {
    await expect(readOrgListSnapshot(async from => ({ data: from ? [rows[0]] : rows.slice(0, 200), count: 201, error: null }))).rejects.toThrow();
  });
  it("does not return a partial roster after a later server failure", async () => {
    const failure = new Error("denied");
    await expect(readOrgListSnapshot(async from => ({ data: rows.slice(0, 200), count: 401, error: from ? failure : null }))).rejects.toBe(failure);
  });
});
