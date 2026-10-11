import { expect, test, type Page } from "@playwright/test";

const adminId = "f5100000-0000-0000-0000-000000000001";
const managerId = "f5100000-0000-0000-0000-000000000002";
const plantId = "f5200000-0000-0000-0000-000000000001";
const inviteId = "f5300000-0000-0000-0000-000000000001";

// Intercept every Supabase call: UI checks cannot mutate local or remote data.
async function fixture(page: Page, failure = false, managerSession = false) {
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
    if (url.pathname === "/rest/v1/profiles") {
      body = url.searchParams.has("role") ? [{ id: managerId, plant_id: plantId, real_name: "테스트 담당자", nickname: "TESTLEAD", is_active: true, plants: { display_name: "테스트 발전소", code: "TEST" } }] : { id: userId, plant_id: managerSession ? plantId : null, role: managerSession ? "plant_manager" : "admin", real_name: "테스트 계정", nickname: "TESTUSER", is_active: true, nickname_reset_required: false, job_role: null };
    } else if (url.pathname === "/rest/v1/plants") {
      body = [{ id: plantId, code: "TEST", name: "테스트 발전소", display_name: "테스트 발전소", is_active: true, invitation_epoch: 0, created_at: new Date().toISOString() }];
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
    await route.fulfill({ status, json: body });
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
