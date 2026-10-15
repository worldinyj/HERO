import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const userId = "f8100000-0000-0000-0000-000000000001";
const seasonId = "f8100000-0000-0000-0000-000000000002";
const scenarioId = "f8100000-0000-0000-0000-000000000003";
const versionId = "f8100000-0000-0000-0000-000000000004";
const title = "3장 · 절차와 실제 상황이 조금 다릅니다";
const tables = ["seasons", "season_scenarios", "scenario_versions", "scenarios"] as const;
type Table = typeof tables[number];

async function fixture(page: Page, options: { role?: string; noSeason?: boolean; empty?: Exclude<Table, "seasons">; fail?: Table } = {}) {
  const state = { fail: options.fail as Table | undefined };
  const requests: Array<{ method: string; path: string }> = [];
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") throw new Error("Campaign fixture requires loopback Supabase");
    requests.push({ method: request.method(), path: url.pathname });
    const table = url.pathname.split("/").at(-1);
    if (table === state.fail) {
      // A terminal API error exercises the UI without SDK transport retry delays.
      await route.fulfill({ status: 400, json: { message: "fixture unavailable" } });
      return;
    }
    let body: unknown;
    if (url.pathname === "/auth/v1/user") body = user;
    else if (table === "profiles") body = { id: userId, role: options.role ?? "player", is_active: true, plant_id: null, real_name: "테스트", nickname: "TEST", nickname_reset_required: false, job_role: "worker" };
    else if (url.pathname === "/rest/v1/rpc/my_current_rank") body = options.noSeason ? [] : [{ season_id: seasonId, season_title: "테스트 시즌", hp_point: 0, scenario_count: 0, overall_rank: null, overall_top_percent: null }];
    else if (table === "seasons") body = options.noSeason ? null : { id: seasonId, title: "테스트 시즌" };
    else if (table === options.empty) body = [];
    else if (table === "season_scenarios") body = [{ scenario_version_id: versionId }];
    else if (table === "scenario_versions") body = [{ id: versionId, scenario_id: scenarioId, version: 7, default_perspective_role: "worker" }];
    else if (table === "scenarios") body = [{ id: scenarioId, slug: "s03_procedure_reality_gap", title }];
    else throw new Error(`Unexpected campaign API: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "캠페인", exact: true })).toBeVisible();
  return { state, requests };
}

test("published season content is playable without stale month or preparation labels", async ({ page }) => {
  const { requests } = await fixture(page);
  const chapter = page.getByRole("link", { name: new RegExp(title) });
  await expect(chapter).toHaveAttribute("href", "/briefing/s03_procedure_reality_gap");
  await expect(chapter).toContainText("작업자 관점 · v7");
  await expect(chapter.locator(".chapter-index")).toHaveText("경쟁");
  await expect(page.getByText("테스트 시즌 · 경쟁 플레이", { exact: true })).toBeVisible();
  await expect(page.getByText("첫 경쟁 장 완료 전", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("10월 시즌 · 개발 중");
  await expect(page.locator("main")).not.toContainText("준비중");
  expect(requests.every(request => request.method === "GET" || request.path.endsWith("/rpc/my_current_rank"))).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

for (const role of ["player", "admin", "plant_manager"]) test(`${role} only loads the deferred queue when participating`, async ({ page }) => {
  let queueRequests = 0;
  await page.route("**/src/lib/submissionQueue.ts*", route => { queueRequests++; return route.continue(); });
  await fixture(page, { role });
  if (role === "player") await expect.poll(() => queueRequests).toBe(1);
  else {
    await expect(page.getByRole("heading", { name: "교육 운영 계정 안내", exact: true })).toBeVisible();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(queueRequests).toBe(0);
  }
});

test("a failed deferred queue fetch keeps campaign usable and offers reload recovery", async ({ page }) => {
  let attempts = 0;
  await page.route("**/src/lib/submissionQueue.ts*", route => {
    attempts++;
    return attempts === 1 ? route.abort("failed") : route.continue();
  });
  await fixture(page);
  await expect.poll(() => attempts).toBe(1);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("대기 결과 확인을 시작하지 못했습니다.");
  await page.getByRole("button", { name: "앱 다시 불러오기", exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole("heading", { name: "캠페인", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "대기 결과 처리 연결", exact: true })).toHaveCount(0);
});

for (const role of ["admin", "plant_manager"]) {
  test(`${role} sees operating guidance without pretending content is unpublished`, async ({ page }) => {
    const { requests } = await fixture(page, { role });
    await expect(page.getByRole("heading", { name: "교육 운영 계정 안내", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: role === "admin" ? "운영 현황 확인" : "사업소 교육 관리", exact: true })).toHaveAttribute("href", role === "admin" ? "/admin/overview" : "/manager");
    await expect(page.getByRole("link", { name: /탐색형 체험.*약 5분/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("준비중");
    expect(requests.some(request => tables.some(table => request.path.endsWith(`/${table}`)))).toBe(false);
  });
}

test("no active season is different from no rank or a failed request", async ({ page }) => {
  await fixture(page, { noSeason: true });
  await expect(page.getByRole("heading", { name: "현재 진행 중인 경쟁 시즌이 없습니다", exact: true })).toBeVisible();
  await expect(page.getByText("진행 중인 시즌이 없습니다", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /탐색형 체험.*약 5분/ })).toBeVisible();
});

for (const empty of ["season_scenarios", "scenario_versions", "scenarios"] as const) {
  test(`empty ${empty} shows no playable content without a fake draft list`, async ({ page }) => {
    await fixture(page, { empty });
    await expect(page.getByRole("heading", { name: "현재 시즌에 플레이할 수 있는 경쟁 시나리오가 없습니다", exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("준비중");
  });
}

for (const fail of tables) {
  test(`${fail} failure offers retry and recovers the published chapter`, async ({ page }) => {
    const { state } = await fixture(page, { fail });
    await expect(page.getByRole("alert")).toContainText("경쟁 시나리오를 불러오지 못했습니다");
    await expect(page.getByRole("heading", { name: /현재.*경쟁.*없습니다/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
    state.fail = undefined;
    await page.getByRole("button", { name: "경쟁 시나리오 다시 확인", exact: true }).click();
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
