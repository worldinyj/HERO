import { afterEach, describe, expect, it, vi } from "vitest";
import { READ_DEADLINE_MS, readWithDeadline, ReadTimeoutError } from "./readWithDeadline";

afterEach(() => vi.useRealTimers());

describe("read-only request deadlines", () => {
  it("returns successful results and releases the deadline timer", async () => {
    vi.useFakeTimers();
    await expect(readWithDeadline(async signal => {
      expect(signal.aborted).toBe(false);
      return "record";
    })).resolves.toBe("record");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates a transport failure without leaving a timer", async () => {
    vi.useFakeTimers();
    await expect(readWithDeadline(async () => { throw Error("offline"); })).rejects.toThrow("offline");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ends an unresponsive read even when transport ignores abort, then permits a fresh read", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let rejectLate: (error: Error) => void = () => {};
    const old = readWithDeadline(current => {
      signal = current;
      return new Promise<string>((_, reject) => { rejectLate = reject; });
    });
    const timedOut = expect(old).rejects.toBeInstanceOf(ReadTimeoutError);
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
    await timedOut;
    expect(signal?.aborted).toBe(true);
    await expect(readWithDeadline(async current => {
      expect(current.aborted).toBe(false);
      return "fresh record";
    })).resolves.toBe("fresh record");
    rejectLate(Error("late old failure"));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels pending reads on owner cleanup and never starts an already-cancelled read", async () => {
    vi.useFakeTimers();
    const owner = new AbortController();
    let signal: AbortSignal | undefined;
    const pending = readWithDeadline(current => {
      signal = current;
      return new Promise<never>(() => {});
    }, owner.signal);
    const cancelled = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    owner.abort();
    await cancelled;
    expect(signal?.aborted).toBe(true);
    const read = vi.fn();
    await expect(readWithDeadline(read, owner.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
