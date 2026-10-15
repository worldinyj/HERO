import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const season = { id: "f8200000-0000-4000-8000-000000000002", season_key: "2026-10", title: "테스트 시즌", status: "open", starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-11-01T00:00:00Z" };
function row(nickname = "TEST", rank = 1) {
  return { season_id: season.id, plant_id: "fixture-plant", nickname, plant_display_name: "테스트 사업소", job_role: "worker", hp_point: 240, scenario_count: 3,
    overall_rank: rank, overall_top_percent: 10, plant_rank: rank, plant_top_percent: 10, job_rank: rank, job_top_percent: 10, plant_job_rank: rank, plant_job_top_percent: 10,
    rank_position: rank, top_percent: 10 };
}

type RequestKind = "seasons" | "first" | "own" | "more";
async function fixture(page: Page, options: { hold?: RequestKind; closed?: boolean; empty?: "seasons" | "ranks"; twoSeasons?: boolean } = {}) {
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  const state = { hold: options.hold, fail: undefined as RequestKind | undefined, calls: { seasons: 0, first: 0, own: 0, more: 0 }, firstRows: [row()], moreRows: [row("NEXT", 41)], release };
  const user = { id: "f8200000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw new Error("Leaderboard fixture requires loopback Supabase");
    expect(route.request().method()).toBe("GET");
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: { id: user.id, role: "player", is_active: true, plant_id: "fixture-plant", real_name: "테스트", nickname: "TEST", nickname_reset_required: false, job_role: "worker" } });
    let kind: RequestKind, body: unknown;
    if (url.pathname === "/rest/v1/seasons") { kind = "seasons"; body = options.empty === "seasons" ? [] : [{ ...season, status: options.closed ? "closed" : "open" }, ...(options.twoSeasons ? [{ ...season, id: "previous-season", title: "지난 시즌", status: "closed" }] : [])]; }
    else if (/\/rest\/v1\/leaderboard_(current|snapshot)_public_rows$/.test(url.pathname)) {
      if (url.pathname.includes("snapshot")) expect(url.searchParams.get("scope_type")).toBeTruthy();
      kind = url.searchParams.has("nickname") ? "own" : url.searchParams.get("offset") === "40" ? "more" : "first";
      body = options.empty === "ranks" ? (kind === "own" ? null : []) : kind === "own" ? row() : kind === "more" ? state.moreRows : state.firstRows;
    } else throw new Error(`Unexpected leaderboard API: ${url.pathname}`);
    state.calls[kind]++;
    const fail = state.fail === kind;
    if (state.hold === kind) await held;
    return fail ? route.fulfill({ status: 400, json: { message: "fixture unavailable" } }) : route.fulfill({ json: body });
  });
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: "리더보드", exact: true })).toBeVisible();
  return state;
}

const ranks = (page: Page) => page.getByRole("list", { name: "전체 순위", exact: true });

for (const hold of ["seasons", "first", "own"] as const) test(`hung ${hold} read times out, retries and ignores late response`, async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page, { hold });
  await expect.poll(() => state.calls[hold]).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("응답이 지연되어 대기를 마쳤습니다.");
  await expect(page.getByRole("heading", { name: "아직 순위가 없습니다", exact: true })).toHaveCount(0);
  state.hold = undefined;
  state.firstRows = [row("FRESH")];
  await page.getByRole("button", { name: hold === "seasons" ? "시즌 다시 불러오기" : "순위 다시 불러오기", exact: true }).click();
  await expect(ranks(page)).toContainText("FRESH");
  state.release();
  await expect(ranks(page)).toContainText("FRESH");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.calls[hold]).toBe(2);
});

for (const closed of [false, true]) test(`pagination timeout preserves ranks and requires manual retry (closed=${closed})`, async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page, { closed, hold: "more" });
  await expect(ranks(page)).toBeVisible();
  state.firstRows = Array.from({ length: 40 }, (_, i) => row(`PLAYER${i}`, i + 1));
  await page.getByRole("tab", { name: "우리 발전소", exact: true }).click();
  await page.getByRole("tab", { name: "전체", exact: true }).click();
  await expect(ranks(page).getByRole("listitem")).toHaveCount(40);
  await page.getByRole("button", { name: "순위 더 보기", exact: true }).click();
  await expect.poll(() => state.calls.more).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("다음 순위 조회 응답이 지연");
  await expect(ranks(page).getByRole("listitem")).toHaveCount(40);
  await page.clock.runFor(30_000);
  expect(state.calls.more).toBe(1);
  state.hold = undefined;
  state.moreRows = [row("RECOVERED", 41)];
  await page.getByRole("button", { name: "다음 순위 다시 불러오기", exact: true }).click();
  await expect(ranks(page).getByRole("listitem")).toHaveCount(41);
  state.release();
  await expect(ranks(page)).toContainText("RECOVERED");
  await expect(ranks(page)).not.toContainText("NEXT");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("switching away and back cancels old pagination without appending stale ranks", async ({ page }) => {
  const state = await fixture(page, { hold: "more" });
  await expect(ranks(page)).toBeVisible();
  state.firstRows = Array.from({ length: 40 }, (_, i) => row(`PLAYER${i}`, i + 1));
  await page.getByRole("tab", { name: "우리 발전소", exact: true }).click();
  await page.getByRole("tab", { name: "전체", exact: true }).click();
  await expect(ranks(page).getByRole("listitem")).toHaveCount(40);
  await page.getByRole("button", { name: "순위 더 보기", exact: true }).click();
  await expect.poll(() => state.calls.more).toBe(1);
  state.firstRows = [row("NEW_SCOPE")];
  await page.getByRole("tab", { name: "직무", exact: true }).click();
  await page.getByRole("tab", { name: "전체", exact: true }).click();
  await expect(ranks(page)).toContainText("NEW_SCOPE");
  state.release();
  await expect(ranks(page).getByRole("listitem")).toHaveCount(1);
  await expect(ranks(page)).not.toContainText("NEXT");
});

for (const empty of ["seasons", "ranks"] as const) test(`successful empty ${empty} is distinct from read failure`, async ({ page }) => {
  await fixture(page, { empty });
  await expect(page.getByRole("heading", { name: empty === "seasons" ? "표시할 시즌이 없습니다" : "아직 순위가 없습니다", exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("terminal API failure offers retry and mobile recovery is accessible", async ({ page }, testInfo) => {
  const state = await fixture(page);
  await expect(ranks(page)).toBeVisible();
  state.fail = "first";
  await page.getByRole("tab", { name: "직무", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("리더보드를 불러오지 못했습니다.");
  await expect(page.getByRole("heading", { name: "아직 순위가 없습니다", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("leaderboard-retry.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  state.fail = undefined;
  await page.getByRole("button", { name: "순위 다시 불러오기", exact: true }).click();
  await expect(page.getByRole("list", { name: "직무 순위", exact: true })).toContainText("TEST");
});


test("season changes discard a held request even when returning to the original season", async ({ page }) => {
  const state = await fixture(page, { hold: "first", twoSeasons: true });
  await expect.poll(() => state.calls.first).toBe(1);
  state.hold = undefined;
  state.firstRows = [row("PREVIOUS_SEASON")];
  await page.getByRole("combobox", { name: "시즌 선택" }).selectOption("previous-season");
  await expect(ranks(page)).toContainText("PREVIOUS_SEASON");
  state.firstRows = [row("CURRENT_SEASON")];
  await page.getByRole("combobox", { name: "시즌 선택" }).selectOption(season.id);
  await expect(ranks(page)).toContainText("CURRENT_SEASON");
  state.release();
  await expect(ranks(page).getByRole("listitem")).toHaveCount(1);
  await expect(ranks(page)).toContainText("CURRENT_SEASON");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
