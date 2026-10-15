import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDeferredSubmissionProcessor } from "./deferredSubmissionProcessor";

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" })));
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe("participant-only deferred queue lifecycle", () => {
  it("coalesces module requests and stops processing when the owner leaves", async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const stop = vi.fn();
    const start = vi.fn(() => stop);
    const load = vi.fn(async () => ({ startSubmissionQueueProcessor: start }));
    const cleanup = startDeferredSubmissionProcessor("participant", load);
    target.dispatchEvent(new Event("online"));
    target.dispatchEvent(new Event("focus"));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledExactlyOnceWith("participant");
    target.dispatchEvent(new Event("focus"));
    await settle();
    expect(start).toHaveBeenCalledTimes(1);
    cleanup();
    expect(stop).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event("online"));
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not start an old account after a delayed module load", async () => {
    vi.stubGlobal("window", new EventTarget());
    const start = vi.fn(() => vi.fn());
    let resolve: (module: { startSubmissionQueueProcessor: typeof start }) => void = () => {};
    const pending = new Promise<{ startSubmissionQueueProcessor: typeof start }>(done => { resolve = done; });
    const cleanupOld = startDeferredSubmissionProcessor("old-account", () => pending);
    cleanupOld();
    const cleanupNew = startDeferredSubmissionProcessor("new-account", () => pending);
    resolve({ startSubmissionQueueProcessor: start });
    await settle();
    expect(start).toHaveBeenCalledExactlyOnceWith("new-account");
    cleanupNew();
  });

  for (const event of ["online", "focus", "visibilitychange"]) it(`recovers from a failed module fetch on ${event}`, async () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const start = vi.fn(() => vi.fn());
    const load = vi.fn().mockRejectedValueOnce(Error("offline"))
      .mockResolvedValueOnce({ startSubmissionQueueProcessor: start });
    const cleanup = startDeferredSubmissionProcessor("participant", load);
    await settle();
    expect(start).not.toHaveBeenCalled();
    (event === "visibilitychange" ? document : target).dispatchEvent(new Event(event));
    await settle();
    expect(start).toHaveBeenCalledExactlyOnceWith("participant");
    cleanup();
  });
});
