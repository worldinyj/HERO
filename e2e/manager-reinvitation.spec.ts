import { expect, test, type Page } from "@playwright/test";

const adminId = "f5100000-0000-0000-0000-000000000001";
const managerId = "f5100000-0000-0000-0000-000000000002";
const plantId = "f5200000-0000-0000-0000-000000000001";
const inviteId = "f5300000-0000-0000-0000-000000000001";

// Intercept every Supabase call: UI checks cannot mutate local or remote data.
async function fixture(page: Page, failure = false, managerSession = false, roster = false) {
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
      body = [{ id: plantId, code: "TEST", name: "테스트 발전소", display_name: "테스트 발전소", is_active: true, invitation_epoch: 0, profiles: [{ count: roster ? 21 : 1 }], created_at: new Date().toISOString() }];
    } else if (url.pathname === "/rest/v1/invitations") body = [];
    else if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/functions/v1/manager-user-action") {
      calls.push(route.request().postDataJSON());
      status = failure ? 503 : 201;
      body = failure ? { error: "internal_error" } : { reissued: true, managerProfileId: managerId, invitationId: inviteId, inviteUrl: "http://127.0.0.1:4173/i/fixture-token", expiresAt: new Date(Date.now() + 604800000).toISOString(), plantDisplayName: "테스트 발전소" };
    } else if (url.pathname === "/functions/v1/peek-invite") {
      body = { valid: true, existingManager: true, invitationId: inviteId, inviteeName: "테스트 담당자", targetRole: "plant_manager", plantDisplayName: "테스트 발전소", expiresAt: new Date(Date.now() + 604800000).toISOString() };
    } else if (url.pathname === "/functions/v1/accept-invite") {
      calls.push(route.request().postDataJSON());
      status = 403;
      body = { error: "invitation_account_mismatch" };
    } else throw new Error(`Unexpected fixture request: ${url.pathname}`);
    await route.fulfill({ status, json: body, headers: { "content-range": `0-19/${total}` } });
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


test("manager search and pages preserve global counts and clear a previous invitation review", async ({ page }) => {
  const calls = await fixture(page, false, false, true);
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
