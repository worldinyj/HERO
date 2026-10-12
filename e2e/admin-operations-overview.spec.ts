import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const adminId = "f6100000-0000-0000-0000-000000000001";
const seasonId = "f6100000-0000-0000-0000-000000000002";
const versionId = "f6100000-0000-0000-0000-000000000003";
const overview = {
  season: { id: seasonId, seasonKey: "2026-10", title: "10월 시즌", startsAt: "2026-09-30T15:00:00Z", endsAt: "2026-10-31T15:00:00Z" },
  scenarios: [{ id: "f6100000-0000-0000-0000-000000000004", slug: "e2e_operations", title: "테스트 경쟁 장", isActive: true, isCompetitive: true, publishedVersionId: versionId, publishedVersion: 1, revision: "a".repeat(32), bindings: [{ versionId, version: 1, status: "published", isActive: true }] }],
};
async function fixture(page: Page, options: { role?: string; zero?: boolean; countError?: boolean; seasonError?: boolean; denied?: boolean; emptySeason?: boolean } = {}) {
  const role = options.role ?? "admin";
  const requests: Array<{ method: string; path: string; search: string }> = [];
  const state = { countError: options.countError ?? false, seasonError: options.seasonError ?? false, denied: options.denied ?? false };
  const user = { id: adminId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") throw Error("Overview fixture requires loopback Supabase");
    requests.push({ method: request.method(), path: url.pathname, search: url.search });
    if (url.pathname === "/auth/v1/user") await route.fulfill({ json: user });
    else if (url.pathname === "/rest/v1/profiles" && request.method() === "GET") await route.fulfill({ json: { id: adminId, role, is_active: true, plant_id: null, real_name: "테스트", nickname: "TEST", nickname_reset_required: false, job_role: null } });
    else if (request.method() === "HEAD" && ["/rest/v1/plants", "/rest/v1/profiles", "/rest/v1/play_sessions"].includes(url.pathname)) {
      expect(url.searchParams.get("select")).toBe("id");
      expect(request.headers().prefer).toContain("count=exact");
      const count = options.zero ? 0 : url.pathname.endsWith("plants") ? 3 : url.pathname.endsWith("play_sessions") ? 9 : url.searchParams.get("role") === "eq.plant_manager" ? 2 : 7;
      await route.fulfill({ status: state.countError ? 503 : 200, headers: { "content-range": `*/${count}`, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" }, body: "" });
    } else if (url.pathname === "/functions/v1/admin-scenario") {
      expect(request.postDataJSON()).toEqual({ action: "season-overview" });
      if (state.denied || state.seasonError) await route.fulfill({ status: state.denied ? 403 : 503, json: { error: "overview_unavailable" } });
      else await route.fulfill({ json: options.zero ? { season: null, scenarios: [] } : options.emptySeason ? { ...overview, scenarios: [] } : overview });
    } else if (role !== "admin" && url.pathname === "/rest/v1/rpc/my_current_rank") await route.fulfill({ json: null });
    else if (role !== "admin" && request.method() === "GET") await route.fulfill({ json: [] });
    else throw Error(`Unexpected API ${request.method()} ${url.pathname}`);
  });
  await page.goto("/admin/overview");
  return { requests, state };
}

test("admin reads counts only and sees the current playable season binding", async ({ page }) => {
  const { requests } = await fixture(page);
  await expect(page.getByRole("heading", { name: "운영 현황", exact: true })).toBeVisible();
  const metrics = page.locator(".operations-metrics");
  await expect(metrics).toContainText("3개"); await expect(metrics).toContainText("2명");
  await expect(metrics).toContainText("7명"); await expect(metrics).toContainText("9건");
  await expect(page.getByText("v1 적용 중 · 새 경쟁 플레이 가능")).toBeVisible();
  expect(new Set(requests.filter(r => r.method === "HEAD").map(r => r.path + r.search)).size).toBe(4);
  expect(requests.filter(r => r.method === "POST").every(r => r.path === "/functions/v1/admin-scenario")).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const companion = page.locator(".learning-mascot-heading img");
  await expect.poll(() => companion.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(companion).toHaveAttribute("src", "/images/mascot/suri-check-v1.webp");
  expect(await companion.evaluate(image => getComputedStyle(image).animationName)).toBe("none");
  const nav = page.getByRole("navigation", { name: "주요 메뉴", exact: true });
  const widths = await nav.locator("a").evaluateAll(links => links.map(link => link.getBoundingClientRect().width));
  expect(widths).toHaveLength(3);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
});

test("operations companion has finite motion and image failure preserves dashboard actions", async ({ page }, testInfo) => {
  await fixture(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const companion = page.locator(".learning-mascot-heading img");
  await expect.poll(() => companion.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const motion = await companion.evaluate(image => {
    const css = getComputedStyle(image);
    return { name: css.animationName, duration: css.animationDuration, iterations: css.animationIterationCount };
  });
  expect(motion).toEqual({ name: "suri-arrive", duration: "0.65s", iterations: "1" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({ path: testInfo.outputPath("operations-companion.png"), fullPage: true });
  await page.route("**/images/mascot/**", route => route.abort());
  await page.reload();
  await expect(companion).toBeHidden();
  await expect(page.getByRole("heading", { name: "운영 현황", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "현황 새로고침" })).toBeEnabled();
  await expect(page.locator(".operations-metrics")).toContainText("9건");
});

test("desktop operations use a wide workspace and preserve equal centered navigation", async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 }, isMobile: false });
  const page = await context.newPage();
  try {
    await fixture(page);
    await expect(page.locator(".operations-metrics")).toContainText("9건");
    const shell = await page.locator("main").boundingBox();
    const nav = await page.getByRole("navigation", { name: "주요 메뉴", exact: true }).boundingBox();
    expect(shell!.width).toBe(960);
    expect(nav!.width).toBe(shell!.width);
    expect(nav!.x).toBe(shell!.x);
    const metrics = await page.locator(".operations-metrics > div").evaluateAll(items => items.map(item => item.getBoundingClientRect().y));
    expect(new Set(metrics).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("desktop-operations-workspace.png"), fullPage: true });
    await page.setViewportSize({ width: 767, height: 900 });
    await expect(page.locator("main")).toHaveCSS("width", "480px");
    await page.setViewportSize({ width: 768, height: 900 });
    await expect(page.locator("main")).toHaveCSS("width", "768px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});

test("a failed route module offers recovery and reload restores the operating page", async ({ page }) => {
  const moduleUrl = "**/src/features/admin/AdminOverviewPage.tsx*";
  await page.route(moduleUrl, route => route.abort());
  await fixture(page);
  await expect(page.getByRole("alert")).toContainText("화면을 불러오지 못했습니다");
  await expect(page.getByRole("link", { name: "캠페인으로 이동", exact: true })).toBeVisible();
  await page.unroute(moduleUrl);
  await page.getByRole("button", { name: "화면 다시 불러오기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "운영 현황", exact: true })).toBeVisible();
  await expect(page.locator(".operations-metrics")).toContainText("9건");
  await expect(page.getByRole("navigation", { name: "주요 메뉴", exact: true })).toBeVisible();
});

test("verified zero registration and no active season are shown distinctly", async ({ page }) => {
  await fixture(page, { zero: true });
  await expect(page.locator(".operations-metrics")).toContainText("0건");
  await expect(page.getByText("현재 운영 중인 시즌이 없습니다.")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("count and season failures stay separate and a refresh recovers", async ({ page }) => {
  const { state } = await fixture(page, { countError: true });
  await expect(page.getByRole("alert")).toContainText("등록·학습 현황을 불러오지 못했습니다");
  await expect(page.locator(".operations-metrics")).toHaveCount(0);
  await expect(page.getByText("v1 적용 중 · 새 경쟁 플레이 가능")).toBeVisible();
  state.countError = false; state.seasonError = true;
  await page.getByRole("button", { name: "현황 새로고침" }).click();
  await expect(page.locator(".operations-metrics")).toContainText("9건");
  await expect(page.getByRole("alert")).toContainText("현재 시즌을 불러오지 못했습니다");
  await expect(page.getByText("현재 운영 중인 시즌이 없습니다.")).toHaveCount(0);
  state.seasonError = false;
  await page.getByRole("button", { name: "현황 새로고침" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("v1 적용 중 · 새 경쟁 플레이 가능")).toBeVisible();
});

test("server denial invalidates successful count responses", async ({ page }) => {
  await fixture(page, { denied: true });
  await expect(page.getByRole("alert")).toHaveCount(2);
  await expect(page.locator(".operations-metrics")).toHaveCount(0);
});

for (const role of ["player", "plant_manager"]) test(`${role} cannot request the admin operations summary`, async ({ page }) => {
  const { requests } = await fixture(page, { role });
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  expect(requests.filter(r => r.method === "HEAD" || r.path === "/functions/v1/admin-scenario")).toEqual([]);
});


test("an active season without connected scenarios explains the next management action", async ({ page }) => {
  await fixture(page, { emptySeason: true });
  await expect(page.getByText("현재 연결 상태로 새 경쟁 플레이를 시작할 수 있는 시나리오가 없습니다. 시나리오 관리에서 배포 버전과 시즌 연결을 확인해주세요.")).toBeVisible();
  await expect(page.getByRole("link", { name: "시나리오·시즌 연결 관리" })).toHaveAttribute("href", "/admin/scenarios");
});
