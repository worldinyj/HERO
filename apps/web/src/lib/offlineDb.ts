export const HERO_OFFLINE_DB_NAME = "hero-offline";
export const HERO_OFFLINE_DB_VERSION = 2;
export const GAME_SESSION_STORE = "game-sessions";
export const SUBMISSION_QUEUE_STORE = "submission-queue";

function canUseIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openHeroOfflineDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      HERO_OFFLINE_DB_NAME,
      HERO_OFFLINE_DB_VERSION,
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(GAME_SESSION_STORE)) {
        db.createObjectStore(GAME_SESSION_STORE, { keyPath: "scenarioId" });
      }

      if (!db.objectStoreNames.contains(SUBMISSION_QUEUE_STORE)) {
        const queue = db.createObjectStore(SUBMISSION_QUEUE_STORE, {
          keyPath: "sessionId",
        });
        queue.createIndex("userId", "userId", { unique: false });
        queue.createIndex("state", "state", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () =>
      reject(request.error ?? new Error("indexeddb_open_failed"));
    request.onblocked = () =>
      reject(new Error("indexeddb_upgrade_blocked"));
  });
}
