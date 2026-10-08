import type { GameState } from "@hero/engine";
import type { Scenario } from "@hero/schema";
import {
  COMPETITIVE_SESSION_STORE,
  openHeroOfflineDb,
} from "./offlineDb";
import { matchesCompletedCompetitiveSession } from "./competitiveCleanupPolicy";

export interface CompetitiveServerSession {
  sessionId: string;
  seasonId: string;
  seasonKey: string;
  scenarioVersionId: string;
  scenarioVersion: number;
  perspectiveRole: string;
  startedAt: string;
  replayOf: string | null;
  replayFromNode: string | null;
  submissionLogStart: number;
}

export interface StoredCompetitiveSession {
  formatVersion: 1;
  key: string;
  userId: string;
  scenarioId: string;
  scenarioVersion: number;
  scenario: Scenario;
  server: CompetitiveServerSession;
  game: GameState;
  savedAt: string;
}

function sessionKey(userId: string, scenarioId: string): string {
  return `${userId}:${scenarioId}`;
}

export async function saveCompetitiveSession(
  record: Omit<StoredCompetitiveSession, "formatVersion" | "key" | "savedAt">,
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        COMPETITIVE_SESSION_STORE,
        "readwrite",
      );

      transaction.objectStore(COMPETITIVE_SESSION_STORE).put({
        ...record,
        formatVersion: 1,
        key: sessionKey(record.userId, record.scenarioId),
        savedAt: new Date().toISOString(),
      } satisfies StoredCompetitiveSession);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("competitive_session_write_failed"),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("competitive_session_write_aborted"),
        );
    });
  } finally {
    db.close();
  }
}

export async function loadCompetitiveSession(
  userId: string,
  scenarioId: string,
): Promise<StoredCompetitiveSession | null> {
  const db = await openHeroOfflineDb();
  if (!db) return null;

  try {
    return await new Promise<StoredCompetitiveSession | null>(
      (resolve, reject) => {
        const transaction = db.transaction(
          COMPETITIVE_SESSION_STORE,
          "readonly",
        );
        const request = transaction
          .objectStore(COMPETITIVE_SESSION_STORE)
          .get(sessionKey(userId, scenarioId));

        request.onsuccess = () =>
          resolve(
            (request.result as StoredCompetitiveSession | undefined) ??
              null,
          );
        request.onerror = () =>
          reject(
            request.error ??
              new Error("competitive_session_read_failed"),
          );
      },
    );
  } finally {
    db.close();
  }
}

export async function clearCompetitiveSession(
  userId: string,
  scenarioId: string,
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        COMPETITIVE_SESSION_STORE,
        "readwrite",
      );
      transaction
        .objectStore(COMPETITIVE_SESSION_STORE)
        .delete(sessionKey(userId, scenarioId));

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ??
            new Error("competitive_session_delete_failed"),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error("competitive_session_delete_aborted"),
        );
    });
  } finally {
    db.close();
  }
}

/**
 * Conditionally remove a completed local play. Read and delete under the
 * SAME readwrite transaction so a concurrently saved replay is preserved.
 */
export async function clearCompetitiveSessionIfMatches(
  userId: string,
  scenarioId: string,
  completedSessionId: string,
): Promise<boolean> {
  const db = await openHeroOfflineDb();
  if (!db) throw new Error("competitive_session_cleanup_unavailable");
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(COMPETITIVE_SESSION_STORE, "readwrite");
      const store = transaction.objectStore(COMPETITIVE_SESSION_STORE);
      let deleted = false;
      const request = store.get(sessionKey(userId, scenarioId));

      request.onsuccess = () => {
        if (!matchesCompletedCompetitiveSession(
          request.result, userId, scenarioId, completedSessionId,
        )) return;
        try {
          store.delete(sessionKey(userId, scenarioId));
          deleted = true;
        } catch (error) {
          reject(error);
          try { transaction.abort(); } catch { /* transaction already closed */ }
        }
      };
      request.onerror = () =>
        reject(request.error ?? new Error("competitive_session_cleanup_read_failed"));
      transaction.oncomplete = () => resolve(deleted);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("competitive_session_cleanup_failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("competitive_session_cleanup_aborted"));
    });
  } finally {
    db.close();
  }
}
