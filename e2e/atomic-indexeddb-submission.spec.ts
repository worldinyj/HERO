import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * No Supabase authentication or server RPC required. Execute the actual
 * Vite-served staging module in two same-origin browser tabs, backed by the
 * browser's real IndexedDB implementation and readwrite transactions.
 */
type StagingInput = {
  scenarioId: string;
  body: {
    sessionId: string;
    actions: Array<
      { type: "continue" } |
      { type: "choice"; actionId: string } |
      { type: "info"; actionId: string } |
      { type: "card"; cardId: string }
    >;
    reflectionAnswered: boolean;
    swissCheeseViewed: boolean;
  };
};

function input(sessionId: string, actionId: string): StagingInput {
  return {
    scenarioId: "scenario-atomic",
    body: {
      sessionId,
      actions: [{ type: "continue" }, { type: "choice", actionId }],
      reflectionAnswered: true,
      swissCheeseViewed: true,
    },
  };
}

async function twoTabs(context: BrowserContext): Promise<[Page, Page]> {
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto("/"), second.goto("/")]);
  return [first, second];
}

async function stage(page: Page, userId: string, value: StagingInput) {
  return page.evaluate(async ({ id, request }) => {
    // Dynamic browser import of the real application module from Vite.
    const moduleUrl = "/src/lib/submissionForegroundStore.ts";
    const { stageForegroundSubmission } =
      await import(/* @vite-ignore */ moduleUrl);
    return stageForegroundSubmission(id, request);
  }, { id: userId, request: value });
}

async function inspect(page: Page, sessionId: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("hero-offline", 3);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction("submission-queue", "readonly");
        const request = tx.objectStore("submission-queue").get(id);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, sessionId);
}

async function markState(page: Page, sessionId: string, state: "blocked" | "committed") {
  await page.evaluate(async ({ id, state }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open("hero-offline", 3);
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("submission-queue", "readwrite");
        const store = tx.objectStore("submission-queue");
        const request = store.get(id);
        request.onsuccess = () => {
          const record = request.result as Record<string, unknown>;
          if (!record) {
            tx.abort();
            return;
          }
          store.put({
            ...record,
            state,
            completionReceipt: state === "committed"
              ? {
                  sessionId: id, alreadyCompleted: false,
                  evaluation: { ending: "safe_complete", hpPoint: 90 },
                }
              : undefined,
          });
        };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? Error("state transition aborted"));
      });
    } finally {
      db.close();
    }
  }, { id: sessionId, state });
}

test.describe("real IndexedDB two-tab atomic submission staging", () => {
  test("two competing action logs cannot overwrite one another", async ({ context }) => {
    const [a, b] = await twoTabs(context);
    const id = "stage-conflict-" + crypto.randomUUID();
    const [x, y] = await Promise.all([
      stage(a, "user-one", input(id, "verify")),
      stage(b, "user-one", input(id, "skip")),
    ]);
    expect([x.kind, y.kind].sort()).toEqual(["conflict", "ready"]);
    const record = await inspect(a, id) as { state: string; body: StagingInput["body"] };
    expect(record.state).toBe("pending");
    expect(["verify", "skip"]).toContain(
      (record.body.actions[1] as { actionId: string }).actionId,
    );
    expect(record.body.actions).toEqual(
      (x.kind === "ready" ? input(id, "verify") : input(id, "skip")).body.actions,
    );
  });

  test("identical concurrent submissions reuse the first durable record", async ({ context }) => {
    const [a, b] = await twoTabs(context);
    const id = "stage-same-" + crypto.randomUUID();
    const [first, second] = await Promise.all([
      stage(a, "user-one", input(id, "verify")),
      stage(b, "user-one", input(id, "verify")),
    ]);
    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready") return;
    expect(first.record.queuedAt).toBe(second.record.queuedAt);
    const stored = await inspect(b, id) as { queuedAt: string };
    expect(stored.queuedAt).toBe(first.record.queuedAt);
  });

  test("a session ID cannot be staged for a different signed-in user", async ({ context }) => {
    const [a, b] = await twoTabs(context);
    const id = "stage-owner-" + crypto.randomUUID();
    await stage(a, "user-one", input(id, "verify"));
    await expect(stage(b, "other-user", input(id, "verify")))
      .rejects.toThrow("submission_queue_owner_conflict");
    expect(await inspect(a, id)).toMatchObject({ userId: "user-one" });
  });

  test("committed server receipt cannot be rewritten by another tab", async ({ context }) => {
    const [a, b] = await twoTabs(context);
    const id = "stage-committed-" + crypto.randomUUID();
    await stage(a, "user-one", input(id, "verify"));
    await markState(a, id, "committed");
    const result = await stage(b, "user-one", input(id, "skip"));
    expect(result.kind).toBe("committed");
    expect(await inspect(a, id)).toMatchObject({
      state: "committed",
      completionReceipt: { sessionId: id, alreadyCompleted: false },
      body: { actions: input(id, "verify").body.actions },
    });
  });

  test("blocked manual-review row is never resurrected as pending", async ({ context }) => {
    const [a, b] = await twoTabs(context);
    const id = "stage-blocked-" + crypto.randomUUID();
    await stage(a, "user-one", input(id, "verify"));
    await markState(a, id, "blocked");
    const result = await stage(b, "user-one", input(id, "verify"));
    expect(result.kind).toBe("blocked");
    expect(await inspect(a, id)).toMatchObject({ state: "blocked" });
  });
});
