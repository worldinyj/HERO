import { expect, test, type Page } from "@playwright/test";
import tutorial from "../scenarios/data/S00_tutorial.json" with { type: "json" };

async function fixture(page: Page) {
  const requests: string[] = []; let starts = 0;
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  const user = { id: "fb100000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw Error("Play loading fixture requires loopback Supabase");
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: { id: user.id, role: "player", is_active: true, plant_id: null, real_name: "테스트", nickname: "TEST", nickname_reset_required: false, job_role: "worker" } });
    if (url.pathname === "/functions/v1/start-session") {
      starts++;
      return route.fulfill({ json: { sessionId: "fb100000-0000-4000-8000-000000000002", seasonId: "fixture-season", seasonKey: "fixture", scenarioVersionId: "fixture-version", scenarioVersion: tutorial.version,
        scenario: { ...tutorial, id: "mode_fixture" }, simulationSeed: "mode-fixture", presentationSeed: "mode-fixture", perspectiveRole: "worker", startedAt: new Date().toISOString() } });
    }
    throw Error(`Unexpected play loading API: ${url.pathname}`);
  });
  return { requests, starts: () => starts };
}

for (const mode of ["tutorial", "competitive"] as const) {
  const ownModule = mode === "tutorial" ? "TutorialGamePage" : "CompetitiveGamePage";
  const otherModule = mode === "tutorial" ? "CompetitiveGamePage" : "TutorialGamePage";
  const path = `/play/${mode === "tutorial" ? "s00_tutorial" : "mode_fixture"}`;
  test(`${mode} loads without downloading the other play implementation`, async ({ page }) => {
    const state = await fixture(page);
    await page.goto(path);
    await expect(page.getByText(tutorial.nodes.intro.text, { exact: true })).toBeVisible();
    expect(state.requests.some(url => url.endsWith(`/${ownModule}.tsx`))).toBe(true);
    expect(state.requests.some(url => url.endsWith(`/${otherModule}.tsx`))).toBe(false);
    // Development StrictMode may run the existing start effect twice.
    // This assertion checks that tutorial loading never contacts that API.
    if (mode === "tutorial") expect(state.starts()).toBe(0);
    else expect(state.starts()).toBeGreaterThan(0);
  });
  test(`${mode} download failure offers reload and recovers`, async ({ page }) => {
    await fixture(page);
    const pattern = `**/src/features/play/${ownModule}.tsx`;
    await page.route(pattern, route => route.abort());
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "화면을 불러오지 못했습니다", exact: true })).toBeVisible();
    await page.unroute(pattern);
    await page.getByRole("button", { name: "화면 다시 불러오기", exact: true }).click();
    await expect(page.getByText(tutorial.nodes.intro.text, { exact: true })).toBeVisible();
  });
}
