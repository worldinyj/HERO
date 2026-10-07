import type { GameState } from "@hero/engine";
import {
  GAME_SESSION_STORE,
  openHeroOfflineDb,
} from "./offlineDb";

export interface StoredGameSession {
  formatVersion: 1;
  scenarioId: string;
  scenarioVersion: number;
  game: GameState;
  previousBestMetricAvg: number | null;
  savedAt: string;
}

export async function saveGameSession(
  record: Omit<StoredGameSession, "formatVersion" | "savedAt">,
): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(GAME_SESSION_STORE, "readwrite");
      const store = transaction.objectStore(GAME_SESSION_STORE);

      store.put({
        ...record,
        formatVersion: 1,
        savedAt: new Date().toISOString(),
      } satisfies StoredGameSession);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("indexeddb_write_failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("indexeddb_write_aborted"));
    });
  } finally {
    db.close();
  }
}

export async function loadGameSession(
  scenarioId: string,
): Promise<StoredGameSession | null> {
  const db = await openHeroOfflineDb();
  if (!db) return null;

  try {
    return await new Promise<StoredGameSession | null>((resolve, reject) => {
      const transaction = db.transaction(GAME_SESSION_STORE, "readonly");
      const request = transaction.objectStore(GAME_SESSION_STORE).get(scenarioId);

      request.onsuccess = () =>
        resolve((request.result as StoredGameSession | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("indexeddb_read_failed"));
    });
  } finally {
    db.close();
  }
}

export async function clearGameSession(scenarioId: string): Promise<void> {
  const db = await openHeroOfflineDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(GAME_SESSION_STORE, "readwrite");
      transaction.objectStore(GAME_SESSION_STORE).delete(scenarioId);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("indexeddb_delete_failed"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("indexeddb_delete_aborted"));
    });
  } finally {
    db.close();
  }
}
