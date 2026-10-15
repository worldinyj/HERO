import { expect, test, type Page } from "@playwright/test";
import { heldAdminRead } from "./heldAdminRead";
import AxeBuilder from "@axe-core/playwright";
const adminId = "f6100000-0000-0000-0000-000000000001";
function record(id: number) {
  return { id, actor_user_id: adminId, plant_id: null, action: "invitation.reissued", entity_type: "invitation", entity_id: "f6200000-0000-0000-0000-000000000001", created_at: "2026-10-11T12:34:56Z" };
}
async function fixture(page: Page, role = "admin", navigate = true) {
  const reads: URL[] = [];
  const state = { error: false, empty: false, malformed: false };
  const user = { id: adminId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") throw new Error("Audit fixture requires loopback Supabase");
    if (url.pathname === "/rest/v1/profiles") {
      await route.fulfill({ json: { id: adminId, plant_id: null, role, real_name: "테스트", nickname: "TEST", is_active: true, nickname_reset_required: false, job_role: null } });
    } else if (url.pathname === "/auth/v1/user") await route.fulfill({ json: user });
    else if (url.pathname === "/rest/v1/audit_logs") {
      expect(request.method()).toBe("GET");
      reads.push(url);
      expect(url.searchParams.get("select")).not.toContain("metadata");
      expect(url.searchParams.get("order")).toBe("id.desc");
      expect(url.searchParams.get("limit")).toBe("51");
      if (state.error) await route.fulfill({ status: 403, json: { message: "denied" } });
      else await route.fulfill({ json: state.empty ? [] : state.malformed ? [{ ...record(100), id: "bad" }] :
        url.searchParams.get("id") ? [record(50)] : Array.from({ length: 51 }, (_, index) => record(100 - index)) });
    } else {
      // Campaign can query its read-only overview after a denied route redirects.
      if (role !== "admin" && url.pathname === "/rest/v1/rpc/my_current_rank") await route.fulfill({ json: null });
      else if (role !== "admin" && request.method() === "GET") await route.fulfill({ json: [] });
      else throw new Error(`Unexpected API ${request.method()} ${url.pathname}`);
    }
  });
  if (navigate) await page.goto("/admin/audit");
  return { reads, state };
}

test("admin paginates with a stable cursor and reads only identifiers", async ({ page }) => {
  const { reads } = await fixture(page);
  await expect(page.getByRole("status").filter({ hasText: "1페이지 · 50건" })).toBeVisible();
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "2페이지 · 1건" })).toBeVisible();
  expect(reads.at(-1)?.searchParams.get("id")).toBe("lt.51");
  await expect(page.getByRole("button", { name: "다음 페이지", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "이전 페이지", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1페이지 · 50건" })).toBeVisible();
  const row = page.locator(".audit-history-row").first();
  await row.getByText("기록 식별 정보", { exact: true }).click();
  await expect(row).toContainText(adminId);
  await expect(row).toContainText("21:34:56");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("event and inclusive Korean date filters reset pagination", async ({ page }) => {
  const { reads, state } = await fixture(page);
  await expect(page.getByRole("button", { name: "조회", exact: true })).toBeEnabled();
  await page.getByLabel("이벤트", { exact: true }).selectOption("invitation.reissued");
  await page.getByLabel("시작일", { exact: true }).fill("2026-10-11");
  await page.getByLabel("종료일", { exact: true }).fill("2026-10-11");
  state.empty = true;
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await expect(page.getByText("조회 조건에 해당하는 감사 이력이 없습니다.")).toBeVisible();
  const url = reads.at(-1)!;
  expect(url.searchParams.get("action")).toBe("eq.invitation.reissued");
  expect(url.searchParams.getAll("created_at")).toEqual(["gte.2026-10-10T15:00:00.000Z", "lt.2026-10-11T15:00:00.000Z"]);
  await page.getByRole("button", { name: "필터 초기화", exact: true }).click();
  await expect(page.getByLabel("시작일", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "조회", exact: true })).toBeEnabled();
  expect(reads.at(-1)?.searchParams.has("action")).toBe(false);
});

test("read failures and malformed results do not masquerade as empty history; retry recovers", async ({ page }) => {
  const { state } = await fixture(page);
  await expect(page.locator(".audit-history-row")).toHaveCount(50);
  for (const mode of ["error", "malformed"] as const) {
    state[mode] = true;
    await page.getByRole("button", { name: "최신 기록 새로고침", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("감사 이력을 불러오지 못했습니다");
    await expect(page.locator(".audit-history-row")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "다음 페이지", exact: true })).toBeDisabled();
    state[mode] = false;
    await page.getByRole("button", { name: "최신 기록 새로고침", exact: true }).click();
    await expect(page.locator(".audit-history-row")).toHaveCount(50);
  }
});

for (const role of ["player", "plant_manager"]) test(`${role} cannot open audit history or request its data`, async ({ page }) => {
  const { reads } = await fixture(page, role);
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
  await expect(page.getByRole("heading", { name: "감사 이력", exact: true })).toHaveCount(0);
  expect(reads).toEqual([]);
});


test("hung audit pagination retries the same cursor and applied filters, ignoring unsent draft and late rows", async ({ page }, testInfo) => {
  await page.clock.install();
  const { reads } = await fixture(page);
  await expect(page.getByRole("button", { name: "조회", exact: true })).toBeEnabled();
  await page.getByLabel("이벤트", { exact: true }).selectOption("invitation.reissued");
  await page.getByLabel("시작일", { exact: true }).fill("2026-10-11");
  await page.getByLabel("종료일", { exact: true }).fill("2026-10-11");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1페이지 · 50건");
  const held = await heldAdminRead(page, url => url.pathname === "/rest/v1/audit_logs" && url.searchParams.has("id"), { json: [record(1)] });
  await page.getByRole("button", { name: "다음 페이지", exact: true }).click();
  await expect.poll(() => held.calls).toBe(1);
  await page.getByLabel("이벤트", { exact: true }).selectOption("plant.created");
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("응답이 지연되어 대기를 마쳤습니다.");
  await expect(page.getByText("조회 조건에 해당하는 감사 이력이 없습니다.")).toHaveCount(0);
  await expect(page.locator(".audit-history-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다음 페이지", exact: true })).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("audit-timeout.png") });
  held.holding = false;
  await page.getByRole("button", { name: "같은 페이지 다시 조회", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("2페이지 · 1건");
  expect(reads.at(-1)?.searchParams.get("id")).toBe("lt.51");
  expect(reads.at(-1)?.searchParams.get("action")).toBe("eq.invitation.reissued");
  expect(reads.at(-1)?.searchParams.getAll("created_at")).toEqual(["gte.2026-10-10T15:00:00.000Z", "lt.2026-10-11T15:00:00.000Z"]);
  held.release();
  await expect(page.locator(".audit-history-row")).toContainText("기록 #50");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("first audit read timeout permits a fresh filter without reviving an old page", async ({ page }) => {
  await page.clock.install();
  const { reads } = await fixture(page, "admin", false);
  const held = await heldAdminRead(page, url => url.pathname === "/rest/v1/audit_logs", { json: [record(1)] });
  await page.goto("/admin/audit");
  await expect.poll(() => held.calls).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("button", { name: "조회", exact: true })).toBeEnabled();
  held.holding = false;
  await page.getByLabel("이벤트", { exact: true }).selectOption("plant.created");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1페이지 · 50건");
  expect(reads.at(-1)?.searchParams.get("action")).toBe("eq.plant.created");
  held.release();
  await expect(page.locator(".audit-history-row")).toHaveCount(50);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
