import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSessionSubmission } from "./submissionQueue";

const fixture = vi.hoisted(() => ({
  rows: new Map<string, PendingSessionSubmission>(),
  failPut: false,
  closed: 0,
}));

vi.mock("./offlineDb", () => ({
  SUBMISSION_QUEUE_STORE: "submission-queue",
  openHeroOfflineDb: async () => ({
    close: () => { fixture.closed += 1; },
    transaction: () => {
      const tx = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null as Error | null,
        aborted: false,
        abort: () => {
          tx.aborted = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore: () => ({
          get: (key: string) => {
            const req = {
              result: undefined as PendingSessionSubmission | undefined,
              error: null as Error | null,
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
            };
            queueMicrotask(() => {
              req.result = fixture.rows.has(key)
                ? structuredClone(fixture.rows.get(key)!) : undefined;
              req.onsuccess?.();
              queueMicrotask(() => {
                if (!tx.aborted) tx.oncomplete?.();
              });
            });
            return req;
          },
          put: (record: PendingSessionSubmission) => {
            if (fixture.failPut) throw new Error("staged_idb_put_failed");
            // Real IndexedDB stores a structured clone of the argument.
            fixture.rows.set(record.sessionId, structuredClone(record));
          },
        }),
      };
      return tx;
    },
  }),
}));

import { stageForegroundSubmission } from "./submissionForegroundStore";

function submission(sessionId = "session-one", decision = "verify") {
  return {
    scenarioId: "S01",
    body: {
      sessionId,
      actions: [
        { type: "continue" as const },
        { type: "choice" as const, actionId: decision },
      ],
      reflectionAnswered: true,
      swissCheeseViewed: true,
    },
  };
}

beforeEach(() => {
  fixture.rows.clear();
  fixture.failPut = false;
  fixture.closed = 0;
});

describe("first submission staging is independent of caller mutations", () => {
  it("persists the pending record before returning and closes IDB", async () => {
    const result = await stageForegroundSubmission("u1", submission());
    expect(result.kind).toBe("ready");
    expect(fixture.rows.get("session-one")).toMatchObject({
      state: "pending", userId: "u1", scenarioId: "S01",
    });
    expect(fixture.closed).toBe(1);
  });

  it("returns an immutable snapshot relative to the original request object", async () => {
    const request = submission();
    const result = await stageForegroundSubmission("u1", request);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    request.body.actions[1]!.actionId = "changed-after-commit";
    expect(result.record.body.actions).toEqual(submission().body.actions);
    expect(fixture.rows.get("session-one")?.body.actions)
      .toEqual(submission().body.actions);
  });

  it("reuses original actions for identical repeats and refuses altered decisions", async () => {
    const first = await stageForegroundSubmission("u1", submission());
    const repeated = await stageForegroundSubmission("u1", submission());
    expect(repeated.kind).toBe("ready");
    if (first.kind !== "ready" || repeated.kind !== "ready") return;
    expect(repeated.record.queuedAt).toBe(first.record.queuedAt);
    expect(await stageForegroundSubmission("u1", submission("session-one", "skip")))
      .toMatchObject({ kind: "conflict" });
    expect(fixture.rows.get("session-one")?.body.actions)
      .toEqual(submission().body.actions);
  });

  it("protects a different owner's record and closes aborted transactions", async () => {
    await stageForegroundSubmission("u1", submission());
    await expect(stageForegroundSubmission("u2", submission()))
      .rejects.toThrow("submission_queue_owner_conflict");
    expect(fixture.rows.get("session-one")?.userId).toBe("u1");
    expect(fixture.closed).toBe(2);
  });

  it("never revives committed or blocked records", async () => {
    await stageForegroundSubmission("u1", submission());
    const row = fixture.rows.get("session-one")!;
    fixture.rows.set("session-one", { ...row, state: "committed" });
    expect(await stageForegroundSubmission("u1", submission("session-one", "skip")))
      .toMatchObject({ kind: "committed" });
    fixture.rows.set("session-one", { ...row, state: "blocked" });
    expect(await stageForegroundSubmission("u1", submission()))
      .toMatchObject({ kind: "blocked" });
    expect(fixture.rows.get("session-one")?.state).toBe("blocked");
  });

  it("refuses failed IndexedDB puts without retaining a phantom record", async () => {
    fixture.failPut = true;
    await expect(stageForegroundSubmission("u1", submission()))
      .rejects.toThrow("staged_idb_put_failed");
    expect(fixture.rows.size).toBe(0);
    expect(fixture.closed).toBe(1);
  });
});
