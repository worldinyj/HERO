import type { Page } from "@playwright/test";

/** Holds only the selected read; every other request stays under the caller's fixture. */
export async function heldAdminRead(page: Page, matches: (url: URL, method: string) => boolean,
  response: { json?: unknown; headers?: Record<string, string>; body?: string } = {}) {
  let release = () => {};
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const state = { holding: true, calls: 0, release };
  await page.route(/\/(?:rest|functions)\/v1\//, async route => {
    if (!state.holding || !matches(new URL(route.request().url()), route.request().method())) return route.fallback();
    state.calls++;
    await waiting;
    await route.fulfill(response).catch(() => {}); // An aborted transport may already be closed.
  });
  return state;
}
