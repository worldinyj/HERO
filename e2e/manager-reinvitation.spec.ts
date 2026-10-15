import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const adminId = "f5100000-0000-0000-0000-000000000001";
const managerId = "f5100000-0000-0000-0000-000000000002";
const plantId = "f5200000-0000-0000-0000-000000000001";
const inviteId = "f5300000-0000-0000-0000-000000000001";

// Intercept every Supabase call: UI checks cannot mutate local or remote data.
async function fixture(page: Page, failure = false, managerSession = false, plantActive = true, roster = false) {
  const calls: unknown[] = [];
  const userId = managerSession ? managerId : adminId;
  const user = { id: userId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw new Error("Fixture requires loopback Supabase");
    let body: unknown;
    let status = 200;
    let total = 1;
    if (url.pathname === "/rest/v1/profiles") {
      if (!url.searchParams.has("role")) {
        body = { id: userId, plant_id: managerSession ? plantId : null, role: managerSession ? "plant_manager" : "admin", real_name: "테스트 계정", nickname: "TESTUSER", is_active: true, nickname_reset_required: false, job_role: null };
      } else {
        const managers = Array.from({ length: roster ? 21 : 1 }, (_, i) => ({ id: i === 0 ? managerId : `f5100000-0000-0000-0000-${String(i + 2).padStart(12, "0")}`, plant_id: plantId, real_name: i === 0 ? "테스트 담당자" : `담당자 ${String(i).padStart(2, "0")}`, nickname: `LEAD${i}`, is_active: true, plants: { display_name: "테스트 발전소", code: "TEST" } }));
        const name = url.searchParams.get("real_name");
        const filtered = name ? managers.filter(m => m.real_name.includes(name.replace(/^ilike\.%|%$/gu, ""))) : managers;
        total = filtered.length;
        const offset = Number(url.searchParams.get("offset") ?? 0);
        body = url.searchParams.has("id") ? managers[0] : filtered.slice(offset, offset + Number(url.searchParams.get("limit") ?? 20));
      }
    } else if (url.pathname === "/rest/v1/plants") {
      body = [{ id: plantId, code: "TEST", name: "테스트 발전소", display_name: "테스트 발전소", is_active: plantActive, invitation_epoch: 0, profiles: [{ count: roster ? 21 : 1 }], created_at: new Date().toISOString() }];
    } else if (url.pathname === "/rest/v1/invitations") body = [];
    else if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/functions/v1/manager-user-action") {
      calls.push(route.request().postDataJSON());
      status = failure ? 503 : 201;
      body = failure ? { error: "internal_error" } : { reissued: true, managerProfileId: managerId, invitationId: inviteId, inviteUrl: "http://127.0.0.1:4173/i/fixture-token", expiresAt: new Date(Date.now() + 604800000).toISOString(), plantDisplayName: "테스트 발전소" };
    } else if (url.pathname === "/functions/v1/create-invite") {
      calls.push(route.request().postDataJSON());
      status = 201;
      body = { invitationId: inviteId, inviteUrl: "http://127.0.0.1:4173/i/new-fixture-token", expiresAt: new Date(Date.now() + 604800000).toISOString(), plantDisplayName: "테스트 발전소" };
    } else if (url.pathname === "/functions/v1/peek-invite") {
      body = { valid: true, existingManager: true, invitationId: inviteId, inviteeName: "테스트 담당자", targetRole: "plant_manager", plantDisplayName: "테스트 발전소", expiresAt: new Date(Date.now() + 604800000).toISOString() };
    } else if (url.pathname === "/functions/v1/accept-invite") {
      calls.push(route.request().postDataJSON());
      status = 403;
      body = { error: "invitation_account_mismatch" };
    } else throw new Error(`Unexpected fixture request: ${url.pathname}`);
    await route.fulfill({ status, json: body, headers: { "content-range": `0-19/${total}`, "access-control-expose-headers": "content-range" } });
  });
  return calls;
}

test("manager re-entry requires confirmation and preserves issued URL", async ({ page }) => {
  const calls = await fixture(page);
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true });
  await button.click();
  const review = page.getByRole("group", { name: "담당자 초대링크 재생성 확인" });
  await expect(review).toContainText("동일한 카카오 계정");
  expect(calls).toEqual([]);
  await review.getByRole("button", { name: "취소", exact: true }).click();
  await expect(review).not.toBeVisible();
  expect(calls).toEqual([]);
  await button.click();
  await review.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect(page.locator("code").filter({ hasText: "/i/fixture-token" })).toBeVisible();
  expect(calls).toEqual([{ action: "reinvite-manager", profileId: managerId }]);
  await expect(button).toBeDisabled();
  await expect(page.getByRole("button", { name: "링크 복사", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("uncertain issuance blocks duplicate retries", async ({ page }) => {
  const calls = await fixture(page, true);
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true });
  await button.click();
  await page.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect(page.getByText("담당자 초대가 생성되었을 수도 있습니다.", { exact: false })).toBeVisible();
  await expect(button).toBeDisabled();
  expect(calls).toHaveLength(1);
});

test("bound invitation omits signup fields and explains account mismatch", async ({ page }) => {
  const calls = await fixture(page, false, true);
  await page.goto("/i/fixture-token");
  const button = page.getByRole("button", { name: "기존 담당자 계정으로 접속", exact: true });
  await expect(button).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await button.click();
  await expect(page.getByText("현재 로그인한 계정은 이 링크의 대상이 아닙니다.", { exact: false })).toBeVisible();
  expect(calls).toEqual([{ token: "fixture-token" }]);
});


test("new manager invitation requires a name and submits trimmed text once", async ({ page }, testInfo) => {
  const calls = await fixture(page);
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "담당자 초대 링크 생성", exact: true });
  const input = page.getByRole("textbox", { name: "담당자 이름", exact: true });
  await expect(input).toHaveAttribute("maxlength", "100");
  await expect(button).toBeDisabled();
  await input.fill("   ");
  await expect(button).toBeDisabled();
  expect(calls).toEqual([]);
  await input.fill("  새 담당자  ");
  await expect(button).toBeEnabled();
  await expect(input).toHaveAccessibleDescription("담당자의 실명을 입력하세요. 앞뒤 공백은 제외되며 100자 이내입니다.");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("manager-invite-input.png"), fullPage: true });
  await button.click();
  await expect(page.locator("code").filter({ hasText: "/i/new-fixture-token" })).toBeVisible();
  expect(calls).toEqual([{ plantId, targetRole: "plant_manager", inviteeName: "새 담당자" }]);
  await expect(button).toBeDisabled();
});

test("an inactive plant cannot issue a new manager invitation", async ({ page }) => {
  const calls = await fixture(page, false, false, false);
  await page.goto("/admin");
  const input = page.getByRole("textbox", { name: "담당자 이름", exact: true });
  await input.fill("새 담당자");
  const plant = page.getByRole("combobox", { name: "담당자 초대 발전소" });
  await expect(plant.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "담당자 초대 링크 생성", exact: true })).toBeDisabled();
  expect(calls).toEqual([]);
});

test("manager name input caps entry at 100 characters", async ({ page }) => {
  const calls = await fixture(page);
  await page.goto("/admin");
  const input = page.getByRole("textbox", { name: "담당자 이름", exact: true });
  await input.fill("가".repeat(101));
  await expect(input).toHaveValue("가".repeat(100));
  await page.getByRole("button", { name: "담당자 초대 링크 생성", exact: true }).click();
  await expect(page.locator("code").filter({ hasText: "/i/new-fixture-token" })).toBeVisible();
  expect(calls).toEqual([{ plantId, targetRole: "plant_manager", inviteeName: "가".repeat(100) }]);
});

test("manager search and pages preserve global counts and clear a previous invitation review", async ({ page }, testInfo) => {
  const calls = await fixture(page, false, false, true, true);
  await page.goto("/admin");
  const roster = page.getByRole("region", { name: "담당자 목록 검색", exact: true });
  await expect(roster).toContainText("검색 결과 21명");
  await expect(roster.locator("article")).toHaveCount(20);
  await roster.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true }).click();
  const review = page.getByRole("group", { name: "담당자 초대링크 재생성 확인" });
  await expect(review).toBeVisible();
  await roster.getByRole("button", { name: "다음 담당자 페이지" }).click();
  await expect(review).not.toBeVisible();
  await expect(roster).toContainText("2 / 2페이지");
  await expect(roster.locator("article")).toHaveCount(1);
  await roster.getByRole("textbox", { name: "담당자 이름 검색" }).fill("테스트");
  await roster.getByRole("button", { name: "담당자 검색", exact: true }).click();
  await expect(roster).toContainText("검색 결과 1명");
  await expect(roster).toContainText("1 / 1페이지");
  await expect(page.getByText("담당자 21명", { exact: true })).toBeVisible();
  expect(await roster.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await roster.screenshot({ path: testInfo.outputPath("manager-search.png") });
  expect(calls).toEqual([]);
});

test("manager read failure hides stale rows and can be retried without releasing invite locks", async ({ page }) => {
  const calls = await fixture(page);
  let denied = true;
  await page.route("**/rest/v1/profiles?**", async route => {
    const url = new URL(route.request().url());
    if (denied && url.searchParams.has("real_name")) {
      await route.fulfill({ status: 403, json: { message: "denied" } });
    } else await route.fallback();
  });
  await page.goto("/admin");
  const roster = page.getByRole("region", { name: "담당자 목록 검색", exact: true });
  await expect(roster.locator("article")).toHaveCount(1);
  await roster.getByRole("textbox", { name: "담당자 이름 검색" }).fill("테스트");
  await roster.getByRole("button", { name: "담당자 검색", exact: true }).click();
  await expect(roster.getByRole("alert")).toBeVisible();
  await expect(roster.locator("article")).toHaveCount(0);
  denied = false;
  await roster.getByRole("button", { name: "담당자 목록 다시 조회" }).click();
  await expect(roster).toContainText("검색 결과 1명");
  expect(calls).toEqual([]);
});

test("manager ID recheck failure prevents issuing a link", async ({ page }) => {
  const calls = await fixture(page);
  await page.route("**/rest/v1/profiles?**", async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("role") && url.searchParams.has("id")) {
      await route.fulfill({ status: 403, json: { message: "denied" } });
    } else await route.fallback();
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true }).click();
  await page.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect(page.getByText("선택한 담당자의 현재 정보를 확인하지 못했습니다.", { exact: false })).toBeVisible();
  await expect(page.getByRole("group", { name: "담당자 초대링크 재생성 확인" })).not.toBeVisible();
  expect(calls).toEqual([]);
});

async function holdRead(page: Page, predicate: (url: URL) => boolean) {
  let release = () => {};
  const wait = new Promise<void>(resolve => { release = resolve; });
  const state = { holding: true, calls: 0, release };
  await page.route("**/rest/v1/**", async route => {
    if (!state.holding || !predicate(new URL(route.request().url()))) return route.fallback();
    state.calls++;
    await wait;
    return route.fallback();
  });
  return state;
}

const isPage = (url: URL) => url.pathname === "/rest/v1/profiles" && url.searchParams.has("offset");
const isIdentity = (url: URL) => url.pathname === "/rest/v1/profiles" && url.searchParams.has("role") && url.searchParams.has("id");

test("a hung search releases retry and ignores a late page", async ({ page }) => {
  await page.clock.install();
  const calls = await fixture(page);
  await page.goto("/admin");
  const roster = page.getByRole("region", { name: "담당자 목록 검색", exact: true });
  await expect(roster.locator("article")).toHaveCount(1);
  const held = await holdRead(page, url => isPage(url) && url.searchParams.has("real_name"));
  await roster.getByRole("textbox", { name: "담당자 이름 검색" }).fill("존재하지않는이름");
  await roster.getByRole("button", { name: "담당자 검색", exact: true }).click();
  await expect.poll(() => held.calls).toBe(1);
  await page.clock.runFor(15_001);
  await expect(roster.getByRole("alert")).toContainText("응답이 지연되어 대기를 마쳤습니다.");
  await expect(roster.locator("article")).toHaveCount(0);
  held.holding = false;
  await roster.getByRole("textbox", { name: "담당자 이름 검색" }).fill("테스트");
  await roster.getByRole("button", { name: "담당자 검색", exact: true }).click();
  await expect(roster.locator("article")).toHaveCount(1);
  held.release();
  await expect(roster).toContainText("검색 결과 1명");
  await expect(roster.getByRole("alert")).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("newer searches replace a pending page without letting its response overwrite them", async ({ page }) => {
  const calls = await fixture(page);
  await page.goto("/admin");
  const roster = page.getByRole("region", { name: "담당자 목록 검색", exact: true });
  await expect(roster.locator("article")).toHaveCount(1);
  const held = await holdRead(page, url => isPage(url) && url.searchParams.has("real_name"));
  await roster.getByRole("textbox", { name: "담당자 이름 검색" }).fill("없는이름");
  await roster.getByRole("button", { name: "담당자 검색", exact: true }).click();
  await expect.poll(() => held.calls).toBe(1);
  held.holding = false;
  await roster.getByRole("textbox", { name: "담당자 이름 검색" }).fill("테스트");
  await roster.getByRole("button", { name: "담당자 검색", exact: true }).click();
  await expect(roster.locator("article")).toHaveCount(1);
  held.release();
  await expect(roster).toContainText("검색 결과 1명");
  expect(calls).toEqual([]);
});

test("identity read timeout never issues a link and a new confirmation can recover", async ({ page }) => {
  await page.clock.install();
  const calls = await fixture(page);
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true });
  await button.click();
  const held = await holdRead(page, isIdentity);
  await page.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect.poll(() => held.calls).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("조회 응답이 지연되어 발급하지 않았습니다.");
  await expect(page.getByRole("group", { name: "담당자 초대링크 재생성 확인" })).toHaveCount(0);
  expect(calls).toEqual([]);
  held.holding = false;
  await button.click();
  await page.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect(page.locator("code").filter({ hasText: "/i/fixture-token" })).toBeVisible();
  held.release();
  expect(calls).toEqual([{ action: "reinvite-manager", profileId: managerId }]);
});

test("hung organization count read offers retry without reporting an empty roster", async ({ page }) => {
  await page.clock.install();
  const calls = await fixture(page);
  const held = await holdRead(page, url => url.pathname === "/rest/v1/plants");
  await page.goto("/admin");
  await expect.poll(() => held.calls).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("조직 조회 응답이 지연되어 대기를 마쳤습니다.");
  held.holding = false;
  await page.getByRole("button", { name: "조직 정보 다시 불러오기", exact: true }).click();
  const roster = page.getByRole("region", { name: "담당자 목록 검색", exact: true });
  await expect(roster.locator("article")).toHaveCount(1);
  held.release();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("read retries never release an uncertain invitation lock", async ({ page }) => {
  await page.clock.install();
  const calls = await fixture(page, true);
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true });
  await button.click();
  await page.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect(page.getByText("담당자 초대가 생성되었을 수도 있습니다.", { exact: false })).toBeVisible();
  const held = await holdRead(page, url => url.pathname === "/rest/v1/plants");
  await page.getByRole("button", { name: "1. 담당자 초대 명단 다시 조회", exact: true }).click();
  await expect.poll(() => held.calls).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("button", { name: "2. 결과 확인 완료 · 잠금 해제", exact: true })).toBeDisabled();
  held.holding = false;
  await page.getByRole("button", { name: "조직 정보 다시 불러오기", exact: true }).click();
  await expect(button).toBeDisabled();
  await expect(page.getByRole("button", { name: "2. 결과 확인 완료 · 잠금 해제", exact: true })).toBeDisabled();
  held.release();
  expect(calls).toEqual([{ action: "reinvite-manager", profileId: managerId }]);
});

test("PostgREST range error after rows disappear reloads the first page", async ({ page }) => {
  const calls = await fixture(page, false, false, true, true);
  await page.goto("/admin");
  const roster = page.getByRole("region", { name: "담당자 목록 검색", exact: true });
  await expect(roster.locator("article")).toHaveCount(20);
  let shrunk = false;
  await page.route("**/rest/v1/profiles?**", async route => {
    const url = new URL(route.request().url());
    if (!isPage(url)) return route.fallback();
    if (url.searchParams.get("offset") === "20") {
      shrunk = true;
      return route.fulfill({ status: 416, json: { code: "PGRST103", message: "Requested range not satisfiable" } });
    }
    if (!shrunk) return route.fallback();
    return route.fulfill({ json: [{ id: managerId, plant_id: plantId, real_name: "남은 담당자", nickname: "REMAINING", is_active: true, plants: { display_name: "테스트 발전소", code: "TEST" } }], headers: { "content-range": "0-0/1", "access-control-expose-headers": "content-range" } });
  });
  await roster.getByRole("button", { name: "다음 담당자 페이지", exact: true }).click();
  await expect(roster).toContainText("검색 결과 1명 · 1 / 1페이지");
  await expect(roster.locator("article")).toHaveCount(1);
  await expect(roster).toContainText("남은 담당자");
  await expect(roster.getByRole("alert")).toHaveCount(0);
  expect(calls).toEqual([]);
});

test("a later failed organization refresh revokes an earlier reconciliation snapshot", async ({ page }) => {
  const calls = await fixture(page, true);
  await page.goto("/admin");
  const button = page.getByRole("button", { name: "테스트 담당자 담당자 초대링크 재생성", exact: true });
  await button.click();
  await page.getByRole("button", { name: "초대링크 재생성 확정", exact: true }).click();
  await expect(page.getByText("담당자 초대가 생성되었을 수도 있습니다.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "1. 담당자 초대 명단 다시 조회", exact: true }).click();
  const confirm = page.getByRole("button", { name: "2. 결과 확인 완료 · 잠금 해제", exact: true });
  await expect(confirm).toBeEnabled();
  await page.route("**/rest/v1/plants?**", route => route.fulfill({ status: 403, json: { message: "denied" } }));
  await page.getByRole("button", { name: "조직 정보 다시 불러오기", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "관리자 조직 정보를 불러오지 못했습니다." })).toBeVisible();
  await expect(confirm).toBeDisabled();
  await expect(button).toBeDisabled();
  expect(calls).toEqual([{ action: "reinvite-manager", profileId: managerId }]);
});
