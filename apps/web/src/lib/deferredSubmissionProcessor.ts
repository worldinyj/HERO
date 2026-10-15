import { cachedLoader } from "./cachedLoader";

type QueueModule = Pick<typeof import("./submissionQueue"), "startSubmissionQueueProcessor">;
const loadQueue = cachedLoader(() => import("./submissionQueue"));

/** Only active participants need background queue processing. Importing the
 * app shell must not load the submission/persistence implementation. */
export function startDeferredSubmissionProcessor(
  userId: string,
  load: () => Promise<QueueModule> = loadQueue,
  onUnavailable: () => void = () => {},
  onReady: () => void = () => {},
): () => void {
  let active = true;
  let loading = false;
  let stop: (() => void) | null = null;

  function start() {
    if (!active || loading || stop) return;
    loading = true;
    void Promise.resolve().then(load).then(queue => {
      if (active) {
        stop = queue.startSubmissionQueueProcessor(userId);
        onReady();
      }
    }).catch(() => {
      // A module fetch failure must not break the current screen. Retry when
      // connectivity returns or the participant returns to this window.
      if (active) onUnavailable();
    }).finally(() => { loading = false; });
  }

  const resume = () => { if (document.visibilityState === "visible") start(); };

  window.addEventListener("online", start);
  window.addEventListener("focus", start);
  document.addEventListener("visibilitychange", resume);
  start();
  return () => {
    active = false;
    window.removeEventListener("online", start);
    window.removeEventListener("focus", start);
    document.removeEventListener("visibilitychange", resume);
    stop?.();
  };
}
