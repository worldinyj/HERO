import { describe, expect, it, vi } from "vitest";
import { cachedLoader } from "./cachedLoader";

describe("route module requests", () => {
  it("shares an in-flight request and retains the successful module", async () => {
    const module = { page: "briefing" };
    const fetchModule = vi.fn(async () => module);
    const load = cachedLoader(fetchModule);
    const first = load();
    expect(load()).toBe(first);
    expect(await first).toBe(module);
    expect(await load()).toBe(module);
    expect(fetchModule).toHaveBeenCalledTimes(1);
  });

  it("lets navigation retry after a speculative request failed", async () => {
    const module = { page: "game" };
    const fetchModule = vi.fn()
      .mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(module);
    const load = cachedLoader(fetchModule);
    await expect(load()).rejects.toThrow("network unavailable");
    expect(await load()).toBe(module);
    expect(await load()).toBe(module);
    expect(fetchModule).toHaveBeenCalledTimes(2);
  });

  it("shares the same failure between concurrent callers before retrying", async () => {
    const fetchModule = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("recovered");
    const load = cachedLoader(fetchModule);
    const first = load();
    const second = load();
    const failed = await Promise.allSettled([first, second]);
    expect(failed.map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(fetchModule).toHaveBeenCalledTimes(1);
    expect(await load()).toBe("recovered");
  });
});
