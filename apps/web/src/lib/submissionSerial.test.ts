import { describe, expect, it, vi } from "vitest";
import { createSubmissionSerializer, serializeSubmissionForSession, type SessionCrossTabLock } from "./submissionSerial";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("per-session submission serial queue", () => {
  it("waits for the prior completion before starting a stale queue flush", async () => {
    const gate = deferred();
    const observed: string[] = [];
    const direct = serializeSubmissionForSession("u1", "s1", async () => {
      observed.push("direct-start");
      await gate.promise;
      observed.push("direct-finished");
    });
    const flush = serializeSubmissionForSession("u1", "s1", async () => {
      observed.push("flush-start");
    });
    expect(observed).toEqual(["direct-start"]);
    gate.resolve();
    await Promise.all([direct, flush]);
    expect(observed).toEqual(["direct-start", "direct-finished", "flush-start"]);
  });

  it("releases the next attempt even when the previous one rejects", async () => {
    const gate = deferred();
    const observed: string[] = [];
    const first = serializeSubmissionForSession("u1", "s1", async () => {
      await gate.promise;
      throw new Error("offline");
    });
    const second = serializeSubmissionForSession("u1", "s1", async () => {
      observed.push("retry");
      return "ok";
    });
    gate.resolve();
    await expect(first).rejects.toThrow("offline");
    await expect(second).resolves.toBe("ok");
    expect(observed).toEqual(["retry"]);
  });

  it("does not block other users or other sessions", async () => {
    const gate = deferred();
    const observed: string[] = [];
    const slow = serializeSubmissionForSession("u1", "s1", async () => {
      await gate.promise;
    });
    const otherUser = serializeSubmissionForSession("u2", "s1", async () => {
      observed.push("other-user");
    });
    const otherSession = serializeSubmissionForSession("u1", "s2", async () => {
      observed.push("other-session");
    });
    await Promise.all([otherUser, otherSession]);
    expect(observed).toEqual(["other-user", "other-session"]);
    gate.resolve();
    await slow;
  });
});

function fakeOriginLocks(): SessionCrossTabLock & { calls: string[] } {
  const tails = new Map<string, Promise<void>>();
  const calls: string[] = [];
  return {
    calls,
    async run<T>(name: string, operation: () => Promise<T>): Promise<T> {
      calls.push(name);
      const previous = tails.get(name);
      let release!: () => void;
      const tail = new Promise<void>((resolve) => { release = resolve; });
      tails.set(name, tail);
      try {
        if (previous) await previous;
        return await operation();
      } finally {
        if (tails.get(name) === tail) tails.delete(name);
        release();
      }
    },
  };
}

describe("cross-tab session submission serialization", () => {
  it("holds a second tab on the same session until the first finishes", async () => {
    const locks = fakeOriginLocks();
    const aTab = createSubmissionSerializer(() => locks);
    const bTab = createSubmissionSerializer(() => locks);
    const gate = deferred();
    const seen: string[] = [];
    const a = aTab("user", "session", async () => {
      seen.push("a-start");
      await gate.promise;
      seen.push("a-done");
    });
    const b = bTab("user", "session", async () => { seen.push("b-start"); });
    expect(seen).toEqual(["a-start"]);
    gate.resolve();
    await Promise.all([a, b]);
    expect(seen).toEqual(["a-start", "a-done", "b-start"]);
    expect(locks.calls[0]).toBe(locks.calls[1]);
  });

  it("does not block another session across tabs", async () => {
    const locks = fakeOriginLocks();
    const aTab = createSubmissionSerializer(() => locks);
    const bTab = createSubmissionSerializer(() => locks);
    const gate = deferred();
    const slow = aTab("user", "session-one", async () => gate.promise);
    await expect(bTab("user", "session-two", async () => 42)).resolves.toBe(42);
    gate.resolve();
    await slow;
  });

  it("fails closed when a browser Web Lock acquisition rejects", async () => {
    const serial = createSubmissionSerializer(() => ({
      run: async () => { throw new Error("web_lock_failed"); },
    }));
    const action = vi.fn(async () => "sent");
    await expect(serial("user", "session", action)).rejects.toThrow("web_lock_failed");
    expect(action).not.toHaveBeenCalled();
  });

  it("uses in-tab serialization when the Web Locks API is unavailable", async () => {
    const serial = createSubmissionSerializer(() => null);
    const gate = deferred();
    const seen: string[] = [];
    const a = serial("user", "session", async () => {
      seen.push("a");
      await gate.promise;
    });
    const b = serial("user", "session", async () => { seen.push("b"); });
    expect(seen).toEqual(["a"]);
    gate.resolve();
    await Promise.all([a, b]);
    expect(seen).toEqual(["a", "b"]);
  });
});
