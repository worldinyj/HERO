import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@hero/engine";
import type { Scenario } from "@hero/schema";
import type { StoredCompetitiveSession } from "./competitivePersistence";

const fixture = vi.hoisted(() => ({
  cache: null as StoredCompetitiveSession | null,
  writes: 0,
  failPut: false,
}));

vi.mock("./offlineDb", () => ({
  COMPETITIVE_SESSION_STORE: "competitive-sessions",
  openHeroOfflineDb: async () => ({
    close: () => {},
    transaction: (_name: string, _mode: string) => {
      const transaction = {
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onabort: null as (() => void) | null,
        error: null as Error | null,
        aborted: false,
        abort: () => {
          transaction.aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore: () => ({
          get: (key: string) => {
            const request = {
              result: fixture.cache?.key === key ? fixture.cache : undefined,
              onsuccess: null as (() => void) | null,
              onerror: null as (() => void) | null,
              error: null as Error | null,
            };
            queueMicrotask(() => {
              request.onsuccess?.();
              queueMicrotask(() => {
                if (!transaction.aborted) transaction.oncomplete?.();
              });
            });
            return request;
          },
          put: (record: StoredCompetitiveSession) => {
            if (fixture.failPut) throw new Error("simulated_indexeddb_put_failed");
            fixture.cache = record;
            fixture.writes += 1;
            queueMicrotask(() => {
              if (!transaction.aborted) transaction.oncomplete?.();
            });
          },
          delete: (key: string) => {
            if (fixture.cache?.key === key) fixture.cache = null;
            queueMicrotask(() => {
              if (!transaction.aborted) transaction.oncomplete?.();
            });
          },
        }),
      };
      return transaction;
    },
  }),
}));

import {
  saveCompetitiveSession,
  clearCompetitiveSessionIfMatches,
  updateCompetitiveSessionProgress,
  clearInvalidCompetitiveSession,
} from "./competitivePersistence";

function game(sessionId: string, count: number, startedAt = "2026-10-08T00:00:00.000Z") {
  return {
    userId: "u",
    scenarioId: "S01",
    scenarioVersion: 1,
    scenario: { id: "S01", version: 1 } as Scenario,
    server: {
      sessionId,
      seasonId: "season-one",
      seasonKey: "2026-10",
      scenarioVersionId: "scenario-version-one",
      scenarioVersion: 1,
      perspectiveRole: "ro",
      startedAt,
      replayOf: null,
      replayFromNode: null,
      submissionLogStart: 0,
    },
    game: {
      scenarioId: "S01", scenarioVersion: 1,
      log: Array.from({ length: count }, (_, i) => ({ step: i })),
    } as unknown as GameState,
  };
}

beforeEach(() => {
  fixture.cache = null;
  fixture.writes = 0;
  fixture.failPut = false;
});

describe("conditional IndexedDB competitive progress transaction", () => {
  it("saves initial session explicitly and advances a longer log", async () => {
    await saveCompetitiveSession(game("session-one", 0));
    expect(fixture.writes).toBe(1);
    expect(await updateCompetitiveSessionProgress(game("session-one", 2)))
      .toBe(true);
    expect(fixture.cache?.game.log).toHaveLength(2);
    expect(fixture.writes).toBe(2);
  });

  it("does not create a play when its completed cache was already deleted", async () => {
    expect(await updateCompetitiveSessionProgress(game("session-one", 3)))
      .toBe(false);
    expect(fixture.cache).toBeNull();
    expect(fixture.writes).toBe(0);
  });

  it("does not resurrect the old session after verified completion cleanup", async () => {
    await saveCompetitiveSession(game("session-one", 1));
    expect(await clearCompetitiveSessionIfMatches("u", "S01", "session-one"))
      .toBe(true);
    expect(fixture.cache).toBeNull();
    expect(await updateCompetitiveSessionProgress(game("session-one", 2)))
      .toBe(false);
    expect(fixture.cache).toBeNull();
  });

  it("keeps the new replay when a stale callback saves an older session", async () => {
    await saveCompetitiveSession(game("session-one", 1));
    await saveCompetitiveSession(game("replay-two", 1, "2026-10-08T00:01:00.000Z"));
    const saved = fixture.cache;
    const before = fixture.writes;
    expect(await updateCompetitiveSessionProgress(game("session-one", 3)))
      .toBe(false);
    expect(fixture.cache).toEqual(saved);
    expect(fixture.writes).toBe(before);
  });

  it("cannot roll back a newer log when an older async save finishes later", async () => {
    await saveCompetitiveSession(game("session-one", 3));
    const before = fixture.writes;
    expect(await updateCompetitiveSessionProgress(game("session-one", 2)))
      .toBe(false);
    expect(fixture.cache?.game.log).toHaveLength(3);
    expect(fixture.writes).toBe(before);
  });

  it("does not overwrite an equal-length game state", async () => {
    await saveCompetitiveSession(game("session-one", 2));
    expect(await updateCompetitiveSessionProgress(game("session-one", 2)))
      .toBe(false);
    expect(fixture.writes).toBe(1);
  });

  it("rejects a synchronous IDB put failure and preserves the existing cache", async () => {
    await saveCompetitiveSession(game("session-one", 1));
    const before = fixture.cache;
    fixture.failPut = true;
    await expect(updateCompetitiveSessionProgress(game("session-one", 2)))
      .rejects.toThrow("simulated_indexeddb_put_failed");
    expect(fixture.cache).toEqual(before);
  });
});


describe("server-started session cache atomic ordering", () => {
  it("never rewinds a progressed session from a late identical start response", async () => {
    expect(await saveCompetitiveSession(game("session-one", 3))).toBe(true);
    expect(await saveCompetitiveSession(game("session-one", 0))).toBe(false);
    expect(fixture.cache?.game.log).toHaveLength(3);
  });
  it("does not overwrite a newer replay with an older start response", async () => {
    await saveCompetitiveSession(game("replay-two", 1, "2026-10-08T00:02:00.000Z"));
    expect(await saveCompetitiveSession(game("session-one", 0))).toBe(false);
    expect(fixture.cache?.server.sessionId).toBe("replay-two");
  });
  it("accepts a new replay with a strictly newer server start", async () => {
    await saveCompetitiveSession(game("session-one", 3));
    expect(await saveCompetitiveSession(game("replay-two", 1,
      "2026-10-08T00:02:00.000Z"))).toBe(true);
    expect(fixture.cache?.server.sessionId).toBe("replay-two");
  });
  it("refuses to replace the stored session on a timestamp tie", async () => {
    await saveCompetitiveSession(game("session-one", 2));
    expect(await saveCompetitiveSession(game("replay-two", 0))).toBe(false);
    expect(fixture.cache?.server.sessionId).toBe("session-one");
  });
});


describe("atomic invalid-cache deletion during concurrent session recovery", () => {
  it("deletes a malformed cached record without touching other keys", async () => {
    await saveCompetitiveSession(game("session-one", 1));
    fixture.cache = {
      ...fixture.cache!,
      scenario: null,
    } as unknown as StoredCompetitiveSession;
    expect(await clearInvalidCompetitiveSession("u", "S01")).toBe(true);
    expect(fixture.cache).toBeNull();
  });

  it("does not delete a valid cache saved after an earlier invalid snapshot", async () => {
    await saveCompetitiveSession(game("session-one", 2));
    // Another tab replaced the previously invalid snapshot before our
    // readwrite deletion transaction acquired the object-store lock.
    expect(await clearInvalidCompetitiveSession("u", "S01")).toBe(false);
    expect(fixture.cache?.server.sessionId).toBe("session-one");
    expect(fixture.cache?.game.log).toHaveLength(2);
  });

  it("does nothing when another tab has already removed the invalid record", async () => {
    expect(await clearInvalidCompetitiveSession("u", "S01")).toBe(false);
    expect(fixture.cache).toBeNull();
  });
});
