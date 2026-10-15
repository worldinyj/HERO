export const READ_DEADLINE_MS = 15_000;

export class ReadTimeoutError extends Error {
  constructor() {
    super("read_timeout");
    this.name = "ReadTimeoutError";
  }
}

/** Read-only requests: settle even if the transport ignores cancellation.
 * Never use this to infer the outcome of a mutation or to retry a write. */
export async function readWithDeadline<T>(
  read: (signal: AbortSignal) => PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const stopped = new Promise<never>((_, reject) => {
    function stop(reason: unknown) {
      reject(reason);
      controller.abort(reason);
    }
    cancel = () => stop(signal?.reason ?? new DOMException("Read cancelled", "AbortError"));
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => stop(new ReadTimeoutError()), READ_DEADLINE_MS);
  });
  const result = Promise.resolve().then(() => {
    if (controller.signal.aborted) throw controller.signal.reason;
    return read(controller.signal);
  });
  try { return await Promise.race([result, stopped]); }
  finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
