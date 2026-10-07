import type { GameState } from "@hero/engine";

const DB_NAME = "hero-offline";
const DB_VERSION = 1;
const STORE_NAME = "game-sessions";

export interface StoredGameSession {
  formatVersion: 1;
  scenarioId: string;
  scenarioVersion: number;
  game: GameState;
  previousBestMetricAvg: number | null;
  savedAt: string;
}

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "scenarioId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

export async function saveGameSession(
  record: Omit<StoredGameSession, "formatVersion" | "savedAt">,
): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);

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
  const db = await openDb();
  if (!db) return null;

  try {
    return await new Promise<StoredGameSession | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(scenarioId);

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
  const db = await openDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(scenarioId);

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
