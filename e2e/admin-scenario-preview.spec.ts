import { expect, test, type Page } from "@playwright/test";
import tutorial from "../scenarios/data/S00_tutorial.json" with { type: "json" };

const adminId = "f6100000-0000-0000-0000-000000000001";
const versionId = "f6200000-0000-0000-0000-000000000001";

async function fixture(page: Page, options: { wrongVersion?: boolean; delayed?: boolean } = {}) {
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
      if (request.action === "list") body = { versions: [{ id: versionId, version: 1, status: "draft", default_perspective_role: "worker", approved_at: null, published_at: null, created_at: new Date().toISOString(), scenarios: { id: "f6300000-0000-0000-0000-000000000001", slug: tutorial.id, title: tutorial.title, is_active: true, is_competitive: false } }] };
      else if (request.action === "preview") {
        if (options.delayed) await pending;
        body = { preview: true, scenarioVersionId: options.wrongVersion ? adminId : versionId, scenario: tutorial };
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
