/**
 * Serialize local work for one authenticated user/session pair. A rejected
 * operation must release its successor; unrelated sessions remain independent.
 * This protects concurrent page submits and queue flushes in one JS context.
 * Cross-tab races still require IndexedDB-level coordination or receipts.
 */
const sessionTails = new Map<string, Promise<void>>();

export async function serializeSubmissionForSession<T>(
  userId: string,
  sessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([userId, sessionId]);
  const previous = sessionTails.get(key);
  let release!: () => void;
  const tail = new Promise<void>((resolve) => { release = resolve; });
  sessionTails.set(key, tail);

  try {
    if (previous) await previous;
    return await operation();
  } finally {
    if (sessionTails.get(key) === tail) sessionTails.delete(key);
    release();
  }
}
