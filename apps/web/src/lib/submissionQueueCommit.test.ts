import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSessionSubmission } from "./submissionQueue";

const fixture = vi.hoisted(() => ({
  userId: "user-one",
  records: [] as PendingSessionSubmission[],
  failDelete: false,
  invokes: 0,
  submittedBodies: [] as PendingSessionSubmission["body"][],
  pendingAtInvoke: [] as boolean[],
  authChecks: 0,
  switchAuthOnCheck: 0,
  nextHttpStatus: null as number | null,
  games: [] as Array<Record<string, unknown>>,
  failGameDelete: false,
  failQueuePut: false,
  failQueuePutAt: 0,
  queuePutCount: 0,
  queueReadOverride: null as PendingSessionSubmission | null,
  queueListOverride: null as PendingSessionSubmission[] | null,
  hideCommittedInQueueListing: false,
}));

vi.mock("./supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => {
        fixture.authChecks += 1;
        return {
          data: { session: { user: {
            id: fixture.switchAuthOnCheck === fixture.authChecks
              ? "other-user-after-staging" : fixture.userId,
          } } },
          error: null,
        };
      },
    },
    functions: {
      invoke: async (_name: string, opts: { body: PendingSessionSubmission["body"] }) => {
        fixture.invokes += 1;
        fixture.submittedBodies.push(opts.body);
        fixture.pendingAtInvoke.push(fixture.records.some((r) =>
          r.sessionId === opts.body.sessionId && r.state === "pending"));
        if (fixture.nextHttpStatus !== null) {
          return {
            data: null,
            error: {
              message: "test_server_failure",
              context: new Response(
                JSON.stringify({ error: "action_log_rejected" }),
                { status: fixture.nextHttpStatus,
                  headers: { "content-type": "application/json" } },
              ),
            },
          };
        }
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
        aborted: false,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null,
        abort: () => {
          transaction.aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore: () => ({
          get: (key: string) => {
            const request = {
              result: name === "submission-queue"
                ? (fixture.queueReadOverride ?? fixture.records.find((row) => row.sessionId === key))
                : fixture.games.find((row) => row.key === key),
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
              error: null,
            };
            queueMicrotask(() => {
              request.onsuccess?.();
              queueMicrotask(() => {
                if (!transaction.aborted) transaction.oncomplete?.();
              });
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
            fixture.queuePutCount += 1;
            if (fixture.failQueuePut ||
                fixture.queuePutCount === fixture.failQueuePutAt)
              throw new Error("simulated_put_abort");
            fixture.records = [
              ...fixture.records.filter((item) => item.sessionId !== row.sessionId),
              row,
            ];
            queueMicrotask(() => transaction.oncomplete?.());
          },
          index: (_name: string) => ({
            getAll: (userId: string) => {
              const request = {
                result: (fixture.queueListOverride ?? fixture.records).filter((row) =>
                  row.userId === userId &&
                  (!fixture.hideCommittedInQueueListing || row.state !== "committed")
                ),
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

import { flushQueuedSubmissions, submitSessionWithQueue, removeQueuedSubmission, retryBlockedSubmission } from "./submissionQueue";

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
  fixture.userId = "user-one";
  fixture.records = [];
  fixture.failDelete = false;
  fixture.invokes = 0;
  fixture.submittedBodies = [];
  fixture.pendingAtInvoke = [];
  fixture.authChecks = 0;
  fixture.switchAuthOnCheck = 0;
  fixture.nextHttpStatus = null;
  fixture.games = [];
  fixture.failGameDelete = false;
  fixture.failQueuePut = false;
  fixture.failQueuePutAt = 0;
  fixture.queuePutCount = 0;
  fixture.queueReadOverride = null;
  fixture.queueListOverride = null;
  fixture.hideCommittedInQueueListing = false;
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
    expect(fixture.records[0].completionReceipt).toMatchObject({ sessionId, alreadyCompleted: false });
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

  it("cleans a receipt-verified committed row while offline without network access", async () => {
    fixture.records = [{
      ...queued(), state: "committed",
      completionReceipt: {
        sessionId, alreadyCompleted: false,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    }];
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

describe("foreground recovery of confirmed tombstones", () => {
  it("returns the saved verified receipt without any offline API call", async () => {
    fixture.records = [queued()];
    fixture.failDelete = true;
    await flushQueuedSubmissions("user-one");
    expect(fixture.records[0]?.state).toBe("committed");
    const oldCount = fixture.invokes;
    vi.stubGlobal("navigator", { onLine: false });
    try {
      const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
      expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
      expect(fixture.records[0]?.state).toBe("committed");
      expect(fixture.invokes).toBe(oldCount);
    } finally { vi.unstubAllGlobals(); }
  });

  it("never overwrites an older committed marker with pending while offline", async () => {
    fixture.records = [{ ...queued(), state: "committed" }];
    vi.stubGlobal("navigator", { onLine: false });
    fixture.failDelete = true;
    try {
      const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
      expect(result).toMatchObject({ status: "queued", reason: "confirmed_cleanup_pending" });
      expect(fixture.records[0]?.state).toBe("committed");
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});


describe("legacy committed receipt safety", () => {
  it("retains an older committed marker without a receipt, even when cleanup works", async () => {
    fixture.records = [{ ...queued(), state: "committed" }];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toEqual({ status: "queued", reason: "confirmed_cleanup_pending" });
    expect(fixture.records).toHaveLength(1);
    expect(fixture.records[0].state).toBe("committed");
    expect(fixture.invokes).toBe(0);
  });

  it("restores the cached receipt when valid and removes its local marker", async () => {
    fixture.records = [{
      ...queued(),
      state: "committed",
      completionReceipt: {
        sessionId,
        alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    }];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({
      status: "submitted",
      cleanupPending: false,
      data: { sessionId, alreadyCompleted: true },
    });
    expect(fixture.records).toEqual([]);
    expect(fixture.invokes).toBe(0);
  });

  it("does not claim the local cleanup succeeded when marking the receipt fails", async () => {
    fixture.records = [queued()];
    fixture.failQueuePutAt = 1;
    fixture.failDelete = true;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
    expect(fixture.records[0]?.state).toBe("pending");
    expect(fixture.invokes).toBe(1);
  });
});


describe("durable completion markers and legacy retention", () => {
  it("preserves a first-time foreground receipt if IndexedDB deletion aborts", async () => {
    fixture.failDelete = true;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
    expect(fixture.records).toHaveLength(1);
    expect(fixture.records[0]).toMatchObject({
      state: "committed",
      sessionId,
      completionReceipt: { sessionId, alreadyCompleted: false },
    });
    expect(fixture.invokes).toBe(1);
    fixture.failDelete = false;
    await flushQueuedSubmissions("user-one");
    expect(fixture.records).toEqual([]);
    expect(fixture.invokes).toBe(1);
  });

  it("never deletes a legacy committed marker lacking a verified receipt", async () => {
    fixture.records = [{ ...queued(), state: "committed" }];
    await expect(flushQueuedSubmissions("user-one"))
      .resolves.toEqual({ submitted: 0, blocked: 0, remaining: 0 });
    expect(fixture.records[0]?.state).toBe("committed");
    expect(fixture.invokes).toBe(0);
  });

  it("retains a marker when its stored receipt belongs to another session", async () => {
    fixture.records = [{
      ...queued(), state: "committed",
      completionReceipt: {
        sessionId: "different-session",
        alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    }];
    await flushQueuedSubmissions("user-one");
    expect(fixture.records).toHaveLength(1);
    expect(fixture.invokes).toBe(0);
  });
});

describe("committed evidence is never silently deleted", () => {
  it("does not touch a receipt-less legacy marker during offline background cleanup", async () => {
    fixture.records = [{ ...queued(), state: "committed" }];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      const result = await flushQueuedSubmissions("user-one");
      expect(result).toEqual({ submitted: 0, blocked: 0, remaining: 0 });
      expect(fixture.records).toHaveLength(1);
      expect(fixture.records[0].state).toBe("committed");
      expect(fixture.invokes).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("atomic IndexedDB queue write fallback", () => {
  it("preserves a committed row even when a stale list read missed it", async () => {
    fixture.records = [{
      ...queued(), state: "committed",
      completionReceipt: {
        sessionId, alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    }];
    fixture.hideCommittedInQueueListing = true;
    vi.stubGlobal("navigator", { onLine: false });
    try {
      const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
      expect(result).toMatchObject({ status: "queued", reason: "offline" });
      expect(fixture.records[0]?.state).toBe("committed");
      expect(fixture.records[0]?.completionReceipt).toMatchObject({ sessionId });
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("rejects writing over another owner's submission queue key", async () => {
    fixture.records = [{ ...queued(), userId: "another-user" }];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(submitSessionWithQueue({ scenarioId: "scenario-one", body }))
        .rejects.toThrow("submission_queue_owner_conflict");
      expect(fixture.records).toHaveLength(1);
      expect(fixture.records[0]?.userId).toBe("another-user");
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});


describe("verified-only IndexedDB queue removal", () => {
  it("keeps pending choices if the receipt marker write aborts", async () => {
    fixture.records = [queued()];
    fixture.failQueuePutAt = 1;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
    expect(fixture.records).toEqual([queued()]);
    expect(fixture.invokes).toBe(1);
  });

  it("refuses an unverified pending row at the final delete transaction", async () => {
    const original = queued();
    fixture.records = [original];
    await expect(removeQueuedSubmission(sessionId, "user-one", "scenario-one"))
      .rejects.toThrow("submission_queue_delete_not_confirmed");
    expect(fixture.records).toEqual([original]);
  });

  it("preserves the committed row of another owner at deletion time", async () => {
    const original = {
      ...queued(), userId: "other-user", state: "committed" as const,
      completionReceipt: {
        sessionId, alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    };
    fixture.records = [original];
    await expect(removeQueuedSubmission(sessionId, "user-one", "scenario-one"))
      .rejects.toThrow("submission_queue_delete_identity_conflict");
    expect(fixture.records).toEqual([original]);
  });
});


describe("cross-tab stale queue body and blocked submission protection", () => {
  it("retains original decisions when a stale tab submits different actions offline", async () => {
    const original = queued();
    fixture.records = [original];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(submitSessionWithQueue({
        scenarioId: "scenario-one",
        body: { ...body, actions: [
          { type: "continue" },
          { type: "choice", actionId: "stale-decision" },
        ] },
      })).rejects.toThrow("submission_queue_payload_conflict");
      expect(fixture.records).toEqual([original]);
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("does not auto-resend or overwrite a blocked session on reconnect", async () => {
    fixture.records = [{ ...queued(), state: "blocked", lastError: "action_log_rejected" }];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({
      status: "rejected", reason: "submission_blocked_requires_manual_retry",
    });
    expect(fixture.records[0]?.state).toBe("blocked");
    expect(fixture.invokes).toBe(0);
  });

  it("allows explicit manual retry of blocked choices then flushes once", async () => {
    fixture.records = [{ ...queued(), state: "blocked", lastError: "action_log_rejected" }];
    await retryBlockedSubmission(sessionId, "user-one");
    expect(fixture.invokes).toBe(1);
    expect(fixture.records).toEqual([]);
  });

  it("prevents an older retry count from overwriting a more recent pending row", async () => {
    const current = { ...queued(), attempts: 5 };
    fixture.records = [current];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      // The list read is stale; the store.get inside the write transaction
      // must retain the newer retry state.
      fixture.queueListOverride = [{ ...current, attempts: 2 }];
      const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
      expect(result).toMatchObject({ status: "queued", reason: "offline" });
      expect(fixture.records[0]?.attempts).toBe(5);
      expect(fixture.records[0]?.updatedAt).toBe(current.updatedAt);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});


describe("read-before-write catches stale list snapshots", () => {
  it("rejects a changed payload when a stale queue listing omitted the real record", async () => {
    const original = queued();
    fixture.records = [original];
    fixture.queueListOverride = [];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(submitSessionWithQueue({
        scenarioId: "scenario-one",
        body: { ...body, actions: [
          { type: "continue" }, { type: "choice", actionId: "wrong-choice" },
        ] },
      })).rejects.toThrow("submission_queue_payload_conflict");
      expect(fixture.records).toEqual([original]);
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });
});


describe("explicit manual retry of blocked submissions", () => {
  it("sends immutable stored actions and returns the verified receipt", async () => {
    const savedBody = { ...body, actions: [
      { type: "choice" as const, actionId: "saved-choice" },
    ] };
    fixture.records = [{ ...queued(), state: "blocked", body: savedBody }];
    const result = await retryBlockedSubmission(sessionId, "user-one", "scenario-one");
    expect(result).toMatchObject({
      status: "submitted", cleanupPending: false,
      data: { sessionId, alreadyCompleted: false },
    });
    expect(fixture.invokes).toBe(1);
    expect(fixture.submittedBodies).toHaveLength(1);
    expect(fixture.submittedBodies[0].actions).toEqual(savedBody.actions);
    expect(fixture.submittedBodies[0]).toEqual(savedBody);
    expect(fixture.records).toEqual([]);
  });

  it("rejects another owner's queue record without any API call", async () => {
    fixture.records = [{ ...queued(), userId: "someone-else", state: "blocked" }];
    await expect(retryBlockedSubmission(sessionId, "user-one", "scenario-one"))
      .resolves.toMatchObject({
        status: "rejected", reason: "blocked_submission_not_found",
      });
    expect(fixture.invokes).toBe(0);
    expect(fixture.records).toHaveLength(1);
  });

  it("rejects a mismatch between the stored and current scenario", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    await expect(retryBlockedSubmission(sessionId, "user-one", "other-scenario"))
      .resolves.toMatchObject({
        status: "rejected", reason: "blocked_submission_scenario_mismatch",
      });
    expect(fixture.invokes).toBe(0);
    expect(fixture.records[0]?.state).toBe("blocked");
  });

  it("keeps blocked state while offline", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await expect(retryBlockedSubmission(sessionId, "user-one", "scenario-one"))
        .resolves.toMatchObject({
          status: "queued", reason: "offline_manual_retry_unavailable",
        });
      expect(fixture.records[0]?.state).toBe("blocked");
      expect(fixture.invokes).toBe(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it("preserves a pending retry and reports retryable server failures", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    fixture.nextHttpStatus = 503;
    const result = await retryBlockedSubmission(sessionId, "user-one", "scenario-one");
    expect(result.status).toBe("queued");
    expect(fixture.records[0]).toMatchObject({ state: "pending", attempts: 1 });
    expect(fixture.invokes).toBe(1);
  });

  it("returns terminal manual retry errors to blocked state", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    fixture.nextHttpStatus = 409;
    const result = await retryBlockedSubmission(sessionId, "user-one", "scenario-one");
    expect(result).toMatchObject({
      status: "rejected",
      reason: "submission_blocked_requires_manual_retry",
      httpStatus: 409,
    });
    expect(fixture.records[0]).toMatchObject({ state: "blocked", attempts: 1 });
    expect(fixture.invokes).toBe(1);
  });
});


describe("manual retry identity and receipt recovery", () => {
  it("does not resend after a successful manual retry", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    const first = await retryBlockedSubmission(sessionId, "user-one", "scenario-one");
    expect(first.status).toBe("submitted");
    const second = await retryBlockedSubmission(sessionId, "user-one", "scenario-one");
    expect(second).toMatchObject({
      status: "rejected", reason: "blocked_submission_not_found",
    });
    expect(fixture.invokes).toBe(1);
  });

  it("refuses to unlock blocked choices after authentication changes", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    fixture.userId = "different-user";
    try {
      await expect(retryBlockedSubmission(sessionId, "user-one", "scenario-one"))
        .rejects.toThrow("authenticated_session_changed");
      expect(fixture.records[0]?.state).toBe("blocked");
      expect(fixture.invokes).toBe(0);
    } finally { fixture.userId = "user-one"; }
  });

  it("returns a valid server receipt while reporting failed local cleanup", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    fixture.failDelete = true;
    const result = await retryBlockedSubmission(sessionId, "user-one", "scenario-one");
    expect(result).toMatchObject({
      status: "submitted", cleanupPending: true,
      data: { sessionId, alreadyCompleted: false },
    });
    expect(fixture.records[0]).toMatchObject({
      state: "committed", completionReceipt: { sessionId },
    });
    expect(fixture.invokes).toBe(1);
  });
});

describe("concurrent manual retries cannot submit twice", () => {
  it("serializes two direct retry clicks for the same blocked session", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    const [first, second] = await Promise.all([
      retryBlockedSubmission(sessionId, "user-one", "scenario-one"),
      retryBlockedSubmission(sessionId, "user-one", "scenario-one"),
    ]);
    expect([first.status, second.status].sort())
      .toEqual(["rejected", "submitted"]);
    expect(fixture.invokes).toBe(1);
    expect(fixture.records).toEqual([]);
  });
});


describe("foreground online submission respects already queued immutable evidence", () => {
  it("does not invoke the server when the live decisions differ from pending choices", async () => {
    const saved = queued();
    fixture.records = [saved];
    const result = await submitSessionWithQueue({
      scenarioId: "scenario-one",
      body: { ...body, actions: [
        { type: "continue" }, { type: "choice", actionId: "late-stale-choice" },
      ] },
    });
    expect(result).toMatchObject({
      status: "rejected", reason: "submission_queue_payload_conflict",
    });
    expect(fixture.records).toEqual([saved]);
    expect(fixture.invokes).toBe(0);
  });

  it("rejects a different scenario before any foreground network request", async () => {
    const saved = queued();
    fixture.records = [saved];
    const result = await submitSessionWithQueue({
      scenarioId: "different-scenario", body,
    });
    expect(result).toMatchObject({
      status: "rejected", reason: "submission_queue_payload_conflict",
    });
    expect(fixture.records).toEqual([saved]);
    expect(fixture.invokes).toBe(0);
  });

  it("reuses the persisted pending request instead of a newly assembled body", async () => {
    const saved = queued();
    fixture.records = [saved];
    const nextBody = structuredClone(body);
    const result = await submitSessionWithQueue({
      scenarioId: "scenario-one", body: nextBody,
    });
    expect(result.status).toBe("submitted");
    expect(fixture.submittedBodies).toHaveLength(1);
    expect(fixture.submittedBodies[0]).toBe(saved.body);
    expect(fixture.records).toEqual([]);
  });

  it("refuses different reflection metadata without overwriting pending evidence", async () => {
    const saved = queued();
    fixture.records = [saved];
    const result = await submitSessionWithQueue({
      scenarioId: "scenario-one",
      body: { ...body, reflectionAnswered: false },
    });
    expect(result).toMatchObject({
      status: "rejected", reason: "submission_queue_payload_conflict",
    });
    expect(fixture.invokes).toBe(0);
    expect(fixture.records).toEqual([saved]);
  });
});


describe("durable first-online submission before the network request", () => {
  it("stages pending evidence before a successful first send", async () => {
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result.status).toBe("submitted");
    expect(fixture.pendingAtInvoke).toEqual([true]);
    expect(fixture.submittedBodies[0]).toBe(body);
    expect(fixture.records).toEqual([]);
  });
  it("does not call the server when the first IndexedDB put fails", async () => {
    fixture.failQueuePutAt = 1;
    await expect(submitSessionWithQueue({ scenarioId: "scenario-one", body }))
      .rejects.toThrow("simulated_put_abort");
    expect(fixture.invokes).toBe(0);
    expect(fixture.records).toEqual([]);
  });
  it("keeps the first pending submission on transient HTTP 503", async () => {
    fixture.nextHttpStatus = 503;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result.status).toBe("queued");
    expect(fixture.pendingAtInvoke).toEqual([true]);
    expect(fixture.records[0]).toMatchObject({ state: "pending", attempts: 1, body });
  });
  it("blocks automatic resend after a first-time permanent refusal", async () => {
    fixture.nextHttpStatus = 409;
    const first = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(first).toMatchObject({
      status: "rejected", reason: "submission_blocked_requires_manual_retry",
    });
    expect(fixture.pendingAtInvoke).toEqual([true]);
    expect(fixture.records[0]).toMatchObject({ state: "blocked", attempts: 1, body });
    await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(fixture.invokes).toBe(1);
  });
  it("observes a committed row missed by a stale list inside the staging transaction", async () => {
    fixture.records = [{
      ...queued(), state: "committed",
      completionReceipt: {
        sessionId, alreadyCompleted: true,
        evaluation: { ending: "safe_complete", hpPoint: 80 },
      },
    }];
    fixture.queueListOverride = [];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({
      status: "submitted", data: { sessionId, alreadyCompleted: true },
    });
    expect(fixture.invokes).toBe(0);
    expect(fixture.records).toEqual([]);
  });
  it("does not send when a hidden blocked row is found in the current transaction", async () => {
    fixture.records = [{ ...queued(), state: "blocked" }];
    fixture.queueListOverride = [];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({
      status: "rejected", reason: "submission_blocked_requires_manual_retry",
    });
    expect(fixture.invokes).toBe(0);
    expect(fixture.records[0].state).toBe("blocked");
  });
  it("protects existing actions when a stale queue listing missed them", async () => {
    const saved = { ...queued(), body: {
      ...body, actions: [{ type: "choice" as const, actionId: "first-choice" }],
    } };
    fixture.records = [saved];
    fixture.queueListOverride = [];
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({
      status: "rejected", reason: "submission_queue_payload_conflict",
    });
    expect(fixture.records).toEqual([saved]);
    expect(fixture.invokes).toBe(0);
  });
  it("preserves newly staged evidence but never sends it after user changes", async () => {
    fixture.switchAuthOnCheck = 3;
    await expect(submitSessionWithQueue({ scenarioId: "scenario-one", body }))
      .rejects.toThrow("authenticated_session_changed");
    expect(fixture.records[0]).toMatchObject({
      userId: "user-one", state: "pending", body,
    });
    expect(fixture.invokes).toBe(0);
  });
});


describe("first online marker failure after successful server confirmation", () => {
  it("keeps first staged actions when writing the committed receipt fails", async () => {
    fixture.failQueuePutAt = 2;
    const result = await submitSessionWithQueue({ scenarioId: "scenario-one", body });
    expect(result).toMatchObject({ status: "submitted", cleanupPending: true });
    expect(fixture.queuePutCount).toBe(2);
    expect(fixture.pendingAtInvoke).toEqual([true]);
    expect(fixture.records).toHaveLength(1);
    expect(fixture.records[0]).toMatchObject({
      userId: "user-one", sessionId, state: "pending", body,
    });
    expect(fixture.invokes).toBe(1);
  });
});
