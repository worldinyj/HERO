import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import tutorial from "../scenarios/data/S00_tutorial.json" with { type: "json" };

const adminId = "f6100000-0000-0000-0000-000000000001";
const versionId = "f6200000-0000-0000-0000-000000000001";

async function fixture(page: Page, options: { wrongVersion?: boolean; delayed?: boolean; status?: "draft" | "approved"; allowStatus?: boolean; statusError?: boolean; wrongStatusResponse?: boolean; delayedStatus?: boolean; statusConflict?: boolean } = {}) {
  let currentStatus: string = options.status ?? "draft";
  let statusAttempts = 0;
  const calls: Array<Record<string, unknown>> = [];
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const user = { id: adminId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw new Error("Fixture requires loopback Supabase");
    let body: unknown;
    if (url.pathname === "/rest/v1/profiles") {
      body = { id: adminId, plant_id: null, role: "admin", real_name: "테스트 관리자", nickname: "TESTADMIN", is_active: true, nickname_reset_required: false, job_role: null };
    } else if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/functions/v1/admin-scenario") {
      const request = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(request);
      if (request.action === "list") body = { versions: [{ id: versionId, version: 1, status: currentStatus, default_perspective_role: "worker", approved_at: null, published_at: null, created_at: new Date().toISOString(), scenarios: { id: "f6300000-0000-0000-0000-000000000001", slug: tutorial.id, title: tutorial.title, is_active: true, is_competitive: false } }] };
      else if (request.action === "preview") {
        if (options.delayed) await pending;
        body = { preview: true, scenarioVersionId: options.wrongVersion ? adminId : versionId, scenario: tutorial };
      } else if (request.action === "set-status" && options.allowStatus) {
        statusAttempts += 1;
        if (options.delayedStatus) await pending;
        if (options.statusError && statusAttempts === 1) {
          await route.fulfill({ status: 409, json: { error: "scenario_incident_debrief_required" } });
          return;
        }
        if (options.statusConflict) {
          currentStatus = "archived";
          await route.fulfill({ status: 409, json: { error: "scenario_status_conflict" } });
          return;
        }
        currentStatus = String(request.status);
        body = { updated: true, version: { id: options.wrongStatusResponse ? adminId : versionId, version: 1, status: currentStatus } };
      } else throw new Error(`Unexpected mutating admin action: ${request.action}`);
    } else throw new Error(`Preview tried to use another API: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/admin/scenarios");
  await expect(page.getByRole("heading", { name: "시나리오 관리", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `${tutorial.title} v1 미리보기`, exact: true })).toBeVisible();
  return { calls, release };
}

async function editorPreview(page: Page) {
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(tutorial));
  await page.getByRole("button", { name: "입력한 JSON 미리보기", exact: true }).click();
  return page.getByRole("region", { name: `${tutorial.title} · 미리보기`, exact: true });
}

test("local preview plays and restarts without creating sessions or records", async ({ page }, testInfo) => {
  const { calls } = await fixture(page);
  const preview = await editorPreview(page);
  await expect(preview).toContainText("학습기록·HP·순위에 반영되지 않으며");
  await preview.getByRole("button", { name: "계속", exact: true }).click();
  if (testInfo.project.name === "mobile-390x844") await preview.screenshot({ path: "/tmp/hero-admin-scenario-preview-mobile.png" });
  await preview.getByRole("button", { name: /표식의 글자를 가까이서 확인한다/ }).click();
  await expect(preview).toContainText("마지막 식별 문자가 다릅니다.");
  const choice = preview.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ });
  await choice.click();
  await preview.getByRole("button", { name: "선택 확정", exact: true }).click();
  await expect(preview.getByRole("status", { name: /^결과:/ })).toBeVisible();
  await preview.getByRole("button", { name: "처음부터 다시 보기", exact: true }).click();
  await expect(preview.getByRole("button", { name: "계속", exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "미리보기 닫기", exact: true }).click();
  await expect(preview).not.toBeVisible();
  await expect(page.getByRole("button", { name: "입력한 JSON 미리보기", exact: true })).toBeFocused();
  await expect(page.getByRole("textbox", { name: "시나리오 JSON", exact: true })).toHaveValue(JSON.stringify(tutorial));
  expect(calls.every(call => call.action === "list")).toBe(true);
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("invalid JSON and broken graph cannot open preview", async ({ page }) => {
  await fixture(page);
  const editor = page.getByRole("textbox", { name: "시나리오 JSON", exact: true });
  const button = page.getByRole("button", { name: "입력한 JSON 미리보기", exact: true });
  for (const value of ["null", "[]", '{"title":{}}', JSON.stringify({ ...tutorial, startNode: "missing" })]) {
    await editor.fill(value);
    await expect(button).toBeDisabled();
    await expect(page.getByText("미리보기 전 검증이 필요합니다.", { exact: true })).toBeVisible();
  }
});

test("saved preview requests the exact version; canceled late responses stay closed", async ({ page }) => {
  const { calls, release } = await fixture(page, { delayed: true });
  const button = page.getByRole("button", { name: `${tutorial.title} v1 미리보기`, exact: true });
  await button.click();
  await page.getByRole("button", { name: "불러오기 취소", exact: true }).click();
  const lateResponse = page.waitForResponse(response => response.url().endsWith("/functions/v1/admin-scenario") && response.request().postDataJSON().action === "preview");
  release();
  await (await lateResponse).json();
  await expect(page.getByRole("region", { name: `${tutorial.title} · 미리보기`, exact: true })).not.toBeVisible();
  await button.click();
  const preview = page.getByRole("region", { name: `${tutorial.title} · 미리보기`, exact: true });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("저장된 버전 · 초안");
  expect(calls.filter(call => call.action === "preview").every(call => call.scenarioVersionId === versionId)).toBe(true);
  expect(calls.every(call => ["list", "preview"].includes(String(call.action)))).toBe(true);
});

test("mismatched saved version responses cannot display content", async ({ page }) => {
  await fixture(page, { wrongVersion: true });
  await page.getByRole("button", { name: `${tutorial.title} v1 미리보기`, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("요청한 버전과 미리보기 응답이 다릅니다.");
  await expect(page.getByRole("region", { name: `${tutorial.title} · 미리보기`, exact: true })).not.toBeVisible();
});

test("an automatic transition loop fails safely and a corrected preview can reopen", async ({ page }) => {
  await fixture(page);
  const looping = structuredClone(tutorial);
  looping.startNode = "hazard_identity";
  looping.nodes.hazard_identity.threshold = 0;
  looping.nodes.hazard_identity.breachNext = "hazard_identity";
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(looping));
  await page.getByRole("button", { name: "입력한 JSON 미리보기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("미리보기를 실행하지 못했습니다.");
  await page.getByRole("button", { name: "미리보기 닫기", exact: true }).click();
  await expect(await editorPreview(page)).toBeVisible();
});


test("status confirmation cancels by button and Escape without mutations; focus returns", async ({ page }) => {
  const { calls } = await fixture(page, { allowStatus: true });
  const trigger = page.getByRole("button", { name: "검토로", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "시나리오 상태 변경 확인", exact: true });
  await expect(dialog).toContainText(`${tutorial.title} · v1`);
  await expect(dialog).toContainText("초안 → 검토");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "검토 상태로 변경", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  expect(calls.filter(call => call.action === "set-status")).toHaveLength(0);
});

test("explicit confirmation sends once, blocks pending dismissal, and updates the list", async ({ page }) => {
  const { calls, release } = await fixture(page, { allowStatus: true, delayedStatus: true });
  await page.getByRole("button", { name: "검토로", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "검토 상태로 변경", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "변경 중…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".scenario-status")).toHaveText("검토");
  await expect(page.getByRole("heading", { name: "시나리오 관리", exact: true })).toBeFocused();
  expect(calls.filter(call => call.action === "set-status")).toEqual([{ action: "set-status", scenarioVersionId: versionId, status: "review", expectedStatus: "draft" }]);
});

test("publication describes impact and an HTTP error permits a deliberate retry", async ({ page }, testInfo) => {
  const { calls } = await fixture(page, { allowStatus: true, status: "approved", statusError: true });
  await page.getByRole("button", { name: "배포로", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("기존 배포 버전은 보관");
  await expect(dialog).toContainText("활성 시즌의 버전 연결도 필요");
  const accessibility = await new AxeBuilder({ page }).include(".scenario-status-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  if (testInfo.project.name === "mobile-390x844") await page.screenshot({ path: "/tmp/hero-scenario-status-dialog-mobile.png" });
  const confirm = dialog.getByRole("button", { name: "배포 상태로 변경", exact: true });
  await confirm.click();
  await expect(dialog.getByRole("alert")).toContainText("익명화된 실사건 회고");
  await expect(page.locator(".scenario-status")).toHaveText("승인");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".scenario-status")).toHaveText("배포");
  expect(calls.filter(call => call.action === "set-status")).toHaveLength(2);
});

test("a mismatched success remains unconfirmed and refresh can reconcile the outcome", async ({ page }) => {
  const { calls } = await fixture(page, { allowStatus: true, wrongStatusResponse: true });
  await page.getByRole("button", { name: "검토로", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "검토 상태로 변경", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("반영 여부를 확인");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.locator(".scenario-status")).toHaveText("검토");
  expect(calls.filter(call => call.action === "set-status")).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test("a stale status request stays unconfirmed and refresh shows the other administrator's change", async ({ page }) => {
  const { calls } = await fixture(page, { allowStatus: true, statusConflict: true });
  await page.getByRole("button", { name: "검토로", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "검토 상태로 변경", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("다른 관리자가 상태를 변경했습니다");
  await expect(page.locator(".scenario-status")).toHaveText("초안");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.locator(".scenario-status")).toHaveText("보관");
  expect(calls.filter(call => call.action === "set-status")).toHaveLength(1);
});
