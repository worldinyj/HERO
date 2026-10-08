import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSessionSubmission } from "./submissionQueue";

const fixture = vi.hoisted(() => ({
  userId: "user-one",
  records: [] as PendingSessionSubmission[],
  failDelete: false,
  invokes: 0,
  games: [] as Array<Record<string, unknown>>,
  failGameDelete: false,
  failQueuePut: false,
}));

vi.mock("./supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: fixture.userId } } },
        error: null,
      }),
    },
    functions: {
      invoke: async (_name: string, opts: { body: { sessionId: string } }) => {
        fixture.invokes += 1;
        return {
          data: {
            sessionId: opts.body.sessionId,
            alreadyCompleted: false,
            evaluation: { ending: "safe_complete", hpPoint: 80 },
          },
          error: null,
        };
      },
    },
  }),
}));

vi.mock("./offlineDb", () => ({
  SUBMISSION_QUEUE_STORE: "submission-queue",
  COMPETITIVE_SESSION_STORE: "competitive-sessions",
  openHeroOfflineDb: async () => ({
    close: () => {},
    transaction: (name: string, _mode: string) => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        abort: () => queueMicrotask(() => transaction.onabort?.()),
        objectStore: () => ({
          get: (key: string) => {
            const request = {
              result: fixture.games.find((row) => row.key === key),
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
              error: null,
            };
            queueMicrotask(() => {
              request.onsuccess?.();
              queueMicrotask(() => transaction.oncomplete?.());
            });
            return request;
          },
          delete: (key: string) => {
            if (name === "competitive-sessions") {
              if (fixture.failGameDelete) throw new Error("simulated_game_delete_abort");
              fixture.games = fixture.games.filter((row) => row.key !== key);
            } else {
              if (fixture.failDelete) throw new Error("simulated_idb_abort");
              fixture.records = fixture.records.filter((row) => row.sessionId !== key);
            }
            queueMicrotask(() => transaction.oncomplete?.());
          },
          put: (row: PendingSessionSubmission) => {
            if (fixture.failQueuePut) throw new Error("simulated_put_abort");
            fixture.records = [
              ...fixture.records.filter((item) => item.sessionId !== row.sessionId),
              row,
            ];
            queueMicrotask(() => transaction.oncomplete?.());
          },
          index: (_name: string) => ({
            getAll: (userId: string) => {
              const request = {
                result: fixture.records.filter((row) => row.userId === userId),
                onsuccess: null as (() => void) | null,
                onerror: null as (() => void) | null,
                error: null,
              };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
          }),
        }),
      };
      return transaction;
    },
  }),
}));

import { flushQueuedSubmissions, submitSessionWithQueue } from "./submissionQueue";

const sessionId = "ab000000-0000-4000-8000-000000000001";
const body = {
  sessionId,
  actions: [{ type: "continue" as const }],
  reflectionAnswered: true,
  swissCheeseViewed: true,
};

function queued(): PendingSessionSubmission {
  return {
    formatVersion: 1,
    sessionId,
    userId: "user-one",
    scenarioId: "scenario-one",
    body,
    state: "pending",
    queuedAt: "2026-10-08T00:00:00.000Z",
    updatedAt: "2026-10-08T00:00:00.000Z",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
}

beforeEach(() => {
  fixture.records = [];
  fixture.failDelete = false;
  fixture.invokes = 0;
  fixture.games = [];
  fixture.failGameDelete = false;
  fixture.failQueuePut = false;
});

describe("server-confirmed submissions with failed local deletion", () => {
  it("returns submitted even when foreground cleanup throws", async () => {
    fixture.failDelete = true;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
    expect(fixture.invokes).toBe(1);
  });

  it("cleans a previously queued row after a confirmed foreground commit", async () => {
    fixture.records = [queued()];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: false });
    expect(fixture.records).toEqual([]);
  });

  it("counts confirmed queue replay as submitted even if IDB delete fails", async () => {
    fixture.records = [queued()];
    fixture.failDelete = true;
    await expect(flushQueuedSubmissions("user-one"))
      .resolves.toEqual({ submitted: 1, blocked: 0, remaining: 0 });
    expect(fixture.records).toHaveLength(1);
    expect(fixture.records[0].state).toBe("committed");
    expect(fixture.invokes).toBe(1);
  });
});

describe("conditional cleanup of a confirmed competitive session", () => {
  const saved = (serverId: string) => ({
    formatVersion: 1,
    key: "user-one:scenario-one",
    userId: "user-one",
    scenarioId: "scenario-one",
    server: { sessionId: serverId },
  });

  it("clears matching cached completed game after foreground submission", async () => {
    fixture.games = [saved(sessionId)];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: false });
    expect(fixture.games).toEqual([]);
  });

  it("preserves a newer replay from another tab for the same scenario", async () => {
    fixture.games = [saved("newer-session")];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: false });
    expect(fixture.games).toEqual([saved("newer-session")]);
  });

  it("cleans the matching cached game after background queue replay", async () => {
    fixture.records = [queued()];
    fixture.games = [saved(sessionId)];
    await expect(flushQueuedSubmissions("user-one"))
      .resolves.toEqual({ submitted: 1, blocked: 0, remaining: 0 });
    expect(fixture.games).toEqual([]);
  });

  it("reports cleanup pending but retains confirmed submission if cache deletion fails", async () => {
    fixture.games = [saved(sessionId)];
    fixture.failGameDelete = true;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
    expect(fixture.games).toHaveLength(1);
  });
});

describe("committed queue recovery", () => {
  it("removes committed tombstone without a second API invocation", async () => {
    fixture.records = [queued()];
    fixture.failDelete = true;
    await flushQueuedSubmissions("user-one");
    expect(fixture.records[0]?.state).toBe("committed");
    const oldCount = fixture.invokes;
    fixture.failDelete = false;
    await expect(flushQueuedSubmissions("user-one"))
      .resolves.toEqual({ submitted: 0, blocked: 0, remaining: 0 });
    expect(fixture.records).toEqual([]);
    expect(fixture.invokes).toBe(oldCount);
  });

  it("cleans a committed row while offline without network access", async () => {
    fixture.records = [{ ...queued(), state: "committed" }];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(flushQueuedSubmissions("user-one"))
        .resolves.toEqual({ submitted: 0, blocked: 0, remaining: 0 });
      expect(fixture.records).toEqual([]);
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("keeps a committed row if competitive cache cleanup fails", async () => {
    fixture.records = [queued()];
    fixture.games = [{
      formatVersion: 1, key: "user-one:scenario-one",
      userId: "user-one", scenarioId: "scenario-one",
      server: { sessionId },
    }];
    fixture.failGameDelete = true;
    await flushQueuedSubmissions("user-one");
    expect(fixture.records[0]?.state).toBe("committed");
    const oldCount = fixture.invokes;
    fixture.failGameDelete = false;
    await flushQueuedSubmissions("user-one");
    expect(fixture.games).toEqual([]);
    expect(fixture.records).toEqual([]);
    expect(fixture.invokes).toBe(oldCount);
  });

  it("retains pending rows after a change in signed-in user", async () => {
    fixture.records = [queued()];
    fixture.userId = "another-user";
    try {
      await expect(flushQueuedSubmissions("user-one"))
        .resolves.toEqual({ submitted: 0, blocked: 0, remaining: 1 });
      expect(fixture.records[0]?.state).toBe("pending");
      expect(fixture.invokes).toBe(0);
    } finally { fixture.userId = "user-one"; }
  });
});
