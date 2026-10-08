import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSessionSubmission } from "./submissionQueue";

const fixture = vi.hoisted(() => ({
  userId: "user-one",
  records: [] as PendingSessionSubmission[],
  failDelete: false,
  invokes: 0,
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
  openHeroOfflineDb: async () => ({
    close: () => {},
    transaction: (_name: string, _mode: string) => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        objectStore: () => ({
          delete: (sessionId: string) => {
            if (fixture.failDelete) throw new Error("simulated_idb_abort");
            fixture.records = fixture.records.filter((row) => row.sessionId !== sessionId);
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
      .resolves.toEqual({ submitted: 1, blocked: 0, remaining: 1 });
    expect(fixture.records).toHaveLength(1);
    expect(fixture.invokes).toBe(1);
  });
});
