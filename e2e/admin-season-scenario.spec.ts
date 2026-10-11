import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const admin = "fd100000-0000-0000-0000-000000000001";
const seasonId = "fd200000-0000-0000-0000-000000000001";
const scenarioId = "fd300000-0000-0000-0000-000000000001";
const versionId = "fd400000-0000-0000-0000-000000000001";
const oldId = "fd400000-0000-0000-0000-000000000002";
async function fixture(page: Page, options: { active?: boolean; error?: string; wrongReceipt?: boolean; delayed?: boolean; empty?: boolean; noSeason?: boolean; malformed?: boolean } = {}) {
  const user = { id: admin, aud: "authenticated", role: "authenticated", email: "season@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const access_token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expires_at }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token, refresh_token: "fixture", expires_at, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const calls: Array<Record<string, unknown>> = [];
  let active = options.active ?? false;
  let staleActive = !active;
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/(?:auth|rest|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw Error("Loopback fixture only");
    let body: unknown;
    if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/rest/v1/profiles") body = { id: admin, plant_id: null, role: "admin", real_name: "테스트 관리자", nickname: "TESTADMIN", is_active: true, nickname_reset_required: false, job_role: null };
    else if (url.pathname === "/functions/v1/admin-scenario") {
      const request = route.request().postDataJSON() as Record<string, unknown>; calls.push(request);
      if (request.action === "list") body = { versions: [] };
      else if (request.action === "season-overview") body = options.malformed ? { season: {}, scenarios: [] } : { season: options.noSeason ? null : { id: seasonId, seasonKey: "2026-10", title: "2026년 10월 시즌", startsAt: "2026-09-30T15:00:00Z", endsAt: "2026-10-31T15:00:00Z" }, scenarios: options.empty || options.noSeason ? [] : [{ id: scenarioId, slug: "test_competitive", title: "시험 경쟁 시나리오", isActive: true, isCompetitive: true, publishedVersionId: versionId, publishedVersion: 2, revision: "a".repeat(32), bindings: [{ versionId: oldId, version: 1, status: "archived", isActive: staleActive }, ...(active ? [{ versionId, version: 2, status: "published", isActive: true }] : [])] }] };
      else if (request.action === "set-season-scenario") {
        if (options.delayed) await pending;
        if (options.error) { active = true; staleActive = false; await route.fulfill({ status: 409, json: { error: options.error } }); return; }
        active = request.versionId !== null; staleActive = false;
        body = { updated: true, seasonId: options.wrongReceipt ? admin : seasonId, scenarioId, versionId: request.versionId, isActive: active };
      } else throw Error(`Unexpected action ${request.action}`);
    } else throw Error(`Unexpected API ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/admin/scenarios");
  const panel = page.getByRole("region", { name: "활성 시즌 시나리오 연결", exact: true });
  await expect(panel.getByRole("button", { name: "시즌 연결 새로고침", exact: true })).toBeEnabled();
  return { panel, calls, release };
}
test("current season distinguishes stale binding history from playable version", async ({ page }) => {
  const { panel, calls } = await fixture(page);
  await expect(panel).toContainText("2026년 10월 시즌");
  await expect(panel).toContainText("한국 시간");
  await expect(panel).toContainText("연결된 버전이 배포 상태가 아닙니다");
  await expect(panel).toContainText("v1 보관 · 연결");
  await expect(panel.getByRole("button", { name: "v2 시즌에 연결", exact: true })).toBeEnabled();
  expect(calls.every(x => ["list", "season-overview"].includes(String(x.action)))).toBe(true);
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
});
test("cancel and Escape send no mutations and restore focus", async ({ page }) => {
  const { panel, calls } = await fixture(page);
  const trigger = panel.getByRole("button", { name: "v2 시즌에 연결", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "시즌 연결 변경 확인", exact: true });
  await expect(dialog).toContainText("시험 경쟁 시나리오 · v2");
  await expect(dialog).toContainText("현재 연결: v1");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "이 버전 연결", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click(); await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(calls.filter(x => x.action === "set-season-scenario")).toHaveLength(0);
});
test("explicit connection waits for exact receipt and refreshes applied state", async ({ page }, info) => {
  const { panel, calls, release } = await fixture(page, { delayed: true });
  await panel.getByRole("button", { name: "v2 시즌에 연결", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("이미 시작한 플레이와 학습기록·HP·순위는 변경하지 않습니다");
  const axe = await new AxeBuilder({ page }).include(".scenario-status-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze(); expect(axe.violations).toEqual([]);
  await dialog.getByRole("button", { name: "이 버전 연결", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "변경 중…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  release(); await expect(dialog).not.toBeVisible();
  await expect(panel).toContainText("v2 적용 중 · 새 경쟁 플레이 가능");
  await expect(panel.getByRole("button", { name: "현재 버전 적용 중", exact: true })).toBeDisabled();
  expect(calls.filter(x => x.action === "set-season-scenario")).toEqual([{ action: "set-season-scenario", seasonId, scenarioId, versionId, expectedRevision: "a".repeat(32) }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (info.project.name === "mobile-390x844") await panel.screenshot({ path: "/tmp/hero-season-scenario-mobile.png" });
});
test("disconnect explicitly sends null and preserves history", async ({ page }) => {
  const { panel, calls } = await fixture(page, { active: true });
  await panel.getByRole("button", { name: "시즌 연결 해제", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("새 경쟁 플레이를 시작할 수 없습니다");
  await dialog.getByRole("button", { name: "연결 해제 확인", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(panel).toContainText("연결 없음 · 새 경쟁 플레이 불가");
  await expect(panel).toContainText("v1 보관 · 해제");
  expect(calls.filter(x => x.action === "set-season-scenario")[0]?.versionId).toBeNull();
});
for (const code of ["season_binding_conflict", "season_no_longer_open"]) test(`${code} rejects stale operation; deliberate refresh reconciles it`, async ({ page }) => {
  const { panel, calls } = await fixture(page, { error: code });
  await panel.getByRole("button", { name: "v2 시즌에 연결", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "이 버전 연결", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(code === "season_binding_conflict" ? "다른 관리자가 연결" : "시즌이 종료");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await panel.getByRole("button", { name: "시즌 연결 새로고침", exact: true }).click();
  await expect(panel).toContainText("v2 적용 중");
  expect(calls.filter(x => x.action === "set-season-scenario")).toHaveLength(1);
});
test("mismatched receipt remains unconfirmed instead of automatic retry", async ({ page }) => {
  const { panel, calls } = await fixture(page, { wrongReceipt: true });
  await panel.getByRole("button", { name: "v2 시즌에 연결", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "이 버전 연결", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("반영 여부를 확인");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await panel.getByRole("button", { name: "시즌 연결 새로고침", exact: true }).click();
  await expect(panel).toContainText("v2 적용 중");
  expect(calls.filter(x => x.action === "set-season-scenario")).toHaveLength(1);
});
for (const mode of ["noSeason", "empty", "malformed"] as const) test(`${mode} displays safe guidance without enabling mutations`, async ({ page }) => {
  const { panel, calls } = await fixture(page, { [mode]: true });
  await expect(panel).toContainText(mode === "noSeason" ? "현재 열린 시즌이 없습니다" : mode === "empty" ? "연결할 경쟁 시나리오가 없습니다" : "시즌 연결을 불러오지 못했습니다");
  expect(await panel.getByRole("button").count()).toBe(1);
  expect(calls.every(x => ["list", "season-overview"].includes(String(x.action)))).toBe(true);
});
