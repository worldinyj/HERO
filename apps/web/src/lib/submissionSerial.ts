/**
 * Serialize work for a user/session pair in this tab and across same-origin
 * tabs/workers on browsers that implement the HTTPS Web Locks API.
 * Cross-device submissions still require database idempotence.
 */
export interface SessionCrossTabLock {
  run<T>(name: string, operation: () => Promise<T>): Promise<T>;
}

const browserLock: SessionCrossTabLock = {
  async run<T>(name: string, operation: () => Promise<T>): Promise<T> {
    // Await the browser lock callback result, not Promise<Promise<T>>.
    return await navigator.locks.request(name, { mode: "exclusive" }, operation);
  },
};

function getBrowserLock(): SessionCrossTabLock | null {
  return typeof navigator !== "undefined" && navigator.locks
    ? browserLock
    : null;
}

export function createSubmissionSerializer(
  getCrossTabLock: () => SessionCrossTabLock | null = getBrowserLock,
) {
  const tails = new Map<string, Promise<void>>();

  return async function serializeSubmissionForSession<T>(
    userId: string,
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const identity = JSON.stringify([userId, sessionId]);
    const previous = tails.get(identity);
    let release!: () => void;
    const tail = new Promise<void>((resolve) => { release = resolve; });
    tails.set(identity, tail);

    try {
      if (previous) await previous;
      const crossTabLock = getCrossTabLock();
      if (crossTabLock) {
        // Keep the origin lock until network + IndexedDB actions finish.
        return await crossTabLock.run("hero:session-submission:" + identity, operation);
      }
      // Unsupported browser fallback: in-tab serialization only.
      return await operation();
    } finally {
      if (tails.get(identity) === tail) tails.delete(identity);
      release();
    }
  };
}

export const serializeSubmissionForSession = createSubmissionSerializer();
