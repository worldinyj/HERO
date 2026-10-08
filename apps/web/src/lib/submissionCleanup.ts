/**
 * Once the server has returned a matching completion receipt, local
 * IndexedDB cleanup is best-effort. Failure may leave a queued record,
 * which can later be submitted idempotently; it must not undo the commit.
 */
export async function cleanupAfterConfirmedCommit(
  cleanup: () => Promise<void>,
): Promise<{ cleanupPending: boolean }> {
  try {
    await cleanup();
    return { cleanupPending: false };
  } catch {
    return { cleanupPending: true };
  }
}
