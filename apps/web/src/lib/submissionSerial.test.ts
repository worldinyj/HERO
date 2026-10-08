import { describe, expect, it } from "vitest";
import { serializeSubmissionForSession } from "./submissionSerial";

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
