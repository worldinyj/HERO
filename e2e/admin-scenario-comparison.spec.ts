import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import tutorial from "../scenarios/data/S00_tutorial.json" with { type: "json" };

const adminId = "f7100000-0000-0000-0000-000000000001";
const beforeId = "f7200000-0000-0000-0000-000000000001";
const afterId = "f7200000-0000-0000-0000-000000000002";
const otherId = "f7200000-0000-0000-0000-000000000003";

function editedScenario() {
  const scenario = structuredClone(tutorial);
  scenario.version = 2;
  scenario.nodes.intro.text = "변경된 현장 안내";
  scenario.nodes.decision_identify.choices.reverse();
  scenario.nodes.decision_identify.choices.find(choice => choice.actionId === "check_procedure")!.timeCostMin = 3;
  return scenario;
}

async function fixture(page: Page, options: { delay?: string; mismatch?: "id" | "number" | "slug"; many?: boolean; empty?: boolean } = {}) {
  const calls: Array<Record<string, unknown>> = [];
  let release: () => void = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const user = { id: adminId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw Error("Fixture requires loopback Supabase");
    let body: unknown;
    if (url.pathname === "/rest/v1/profiles") body = { id: adminId, plant_id: null, role: "admin", real_name: "테스트 관리자", nickname: "TESTADMIN", is_active: true, nickname_reset_required: false, job_role: null };
    else if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/functions/v1/admin-scenario") {
      const request = route.request().postDataJSON() as Record<string, unknown>; calls.push(request);
      if (request.action === "list") body = { versions: options.empty ? [] : [beforeId, afterId, otherId].map((id, index) => ({ id, version: index === 1 ? 2 : 1, status: "draft", default_perspective_role: "worker", approved_at: null, published_at: null, created_at: new Date().toISOString(), scenarios: { id: index === 2 ? otherId : beforeId, slug: index === 2 ? "other_scenario" : tutorial.id, title: index === 2 ? "다른 시나리오" : "목록의 최신 제목", is_active: true, is_competitive: false } })) };
      else if (request.action === "season-overview") body = { season: null, scenarios: [] };
      else if (request.action === "preview") {
        if (request.scenarioVersionId === options.delay) await delayed;
        const scenario = request.scenarioVersionId === afterId ? editedScenario() : structuredClone(tutorial);
        if (options.many && request.scenarioVersionId === afterId) {
          for (let index = 0; index < 25; index += 1) Object.assign(scenario.nodes, { [`extra_${index}`]: { type: "ending", ending: "safe_stop", title: `검토 ${index}`, summary: "검토 종료" } });
        }
        if (options.mismatch === "number") scenario.version = 99;
        if (options.mismatch === "slug") scenario.id = "other_scenario";
        body = { preview: true, scenarioVersionId: options.mismatch === "id" ? otherId : request.scenarioVersionId, scenario };
      } else throw Error(`Comparison attempted a mutation: ${request.action}`);
    } else throw Error(`Unexpected API: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/admin/scenarios");
  await expect(page.getByRole("button", { name: "목록 새로고침", exact: true })).toBeEnabled();
  return { calls, release };
}

async function chooseSaved(page: Page) {
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(beforeId);
  await page.getByLabel("변경 후 · 비교 대상", { exact: true }).selectOption(afterId);
  await page.getByRole("button", { name: "변경 사항 비교", exact: true }).click();
}

test("saved versions compare by stable action ID without mutating state", async ({ page }, testInfo) => {
  const { calls } = await fixture(page);
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(beforeId);
  const target = page.getByLabel("변경 후 · 비교 대상", { exact: true });
  expect(await target.locator("option").allTextContents()).toEqual(["입력 중인 JSON", "v2 · 초안"]);
  await target.selectOption(afterId);
  await page.getByRole("button", { name: "변경 사항 비교", exact: true }).click();
  const result = page.getByRole("region", { name: "비교 결과 · 3개 변경", exact: true });
  await expect(result).toBeVisible();
  await expect(result).toContainText(`변경 전: ${tutorial.title} · v1`);
  await expect(result).toContainText(`변경 후: ${tutorial.title} · v2`);
  await expect(result).not.toContainText("목록의 최신 제목");
  const time = result.locator("details").filter({ hasText: "/nodes/decision_identify/choices/check_procedure/timeCostMin" });
  await time.locator("summary").click();
  await expect(time.locator("dd")).toHaveText(["2", "3"]);
  const accessibility = await new AxeBuilder({ page }).include(".scenario-comparison-result").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations).toEqual([]);
  await time.scrollIntoViewIfNeeded();
  if (testInfo.project.name === "mobile-390x844") await page.screenshot({ path: "/tmp/hero-scenario-comparison-mobile.png" });
  expect(calls.filter(call => call.action === "preview").map(call => call.scenarioVersionId).sort()).toEqual([beforeId, afterId].sort());
  expect(calls.every(call => ["list", "preview", "season-overview"].includes(String(call.action)))).toBe(true);
  expect(await page.evaluate(async () => (await indexedDB.databases()).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await result.getByRole("button", { name: "비교 닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "변경 사항 비교", exact: true })).toBeFocused();
});

test("editor comparison validates identity and captures the clicked JSON snapshot", async ({ page }) => {
  const { calls, release } = await fixture(page, { delay: beforeId });
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(beforeId);
  const editor = page.getByRole("textbox", { name: "시나리오 JSON", exact: true });
  const compare = page.getByRole("button", { name: "변경 사항 비교", exact: true });
  for (const value of ["null", JSON.stringify({ ...tutorial, id: "other_scenario" })]) { await editor.fill(value); await expect(compare).toBeDisabled(); }
  await editor.fill(JSON.stringify(editedScenario()));
  await compare.click();
  await editor.fill(JSON.stringify({ ...tutorial, version: 3, title: "나중에 편집한 제목" }));
  release();
  const result = page.getByRole("region", { name: "비교 결과 · 3개 변경", exact: true });
  await expect(result).toContainText("입력 중인 JSON 사본 · v2");
  await expect(result).not.toContainText("나중에 편집한 제목");
  expect(calls.filter(call => call.action === "preview")).toHaveLength(1);
});

test("canceling a delayed comparison discards its late response", async ({ page }) => {
  const { release } = await fixture(page, { delay: afterId });
  await chooseSaved(page);
  await page.getByRole("button", { name: "비교 불러오기 취소", exact: true }).click();
  const response = page.waitForResponse(row => row.url().endsWith("/functions/v1/admin-scenario") && row.request().postDataJSON().scenarioVersionId === afterId);
  release(); await (await response).json();
  await expect(page.locator(".scenario-comparison-result")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "변경 사항 비교", exact: true })).toBeFocused();
});

for (const mismatch of ["id", "number", "slug"] as const) {
  test(`mismatched ${mismatch} responses cannot produce a comparison`, async ({ page }) => {
    await fixture(page, { mismatch }); await chooseSaved(page);
    await expect(page.getByRole("alert")).toContainText("비교할 버전을 확인하지 못했습니다.");
    await expect(page.locator(".scenario-comparison-result")).not.toBeVisible();
  });
}

test("all changes remain available beyond the first page", async ({ page }) => {
  await fixture(page, { many: true }); await chooseSaved(page);
  const result = page.locator(".scenario-comparison-result");
  await expect(result).toContainText("표시 20 / 전체 28");
  await result.getByRole("button", { name: "변경 사항 더 보기", exact: true }).click();
  await expect(result).toContainText("표시 28 / 전체 28");
  await expect(result.locator("details")).toHaveCount(28);
});

test("an empty production-like list explains how to start", async ({ page }) => {
  await fixture(page, { empty: true });
  const panel = page.getByRole("region", { name: "시나리오 버전 비교", exact: true });
  await expect(panel).toContainText("초안을 저장하면");
  await expect(panel.getByRole("button", { name: "변경 사항 비교", exact: true })).not.toBeVisible();
});

test("changing selections discards an in-flight comparison", async ({ page }) => {
  const { release } = await fixture(page, { delay: afterId });
  await chooseSaved(page);
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(afterId);
  const response = page.waitForResponse(row => row.url().endsWith("/functions/v1/admin-scenario") && row.request().postDataJSON().scenarioVersionId === afterId);
  release(); await (await response).json();
  await expect(page.locator(".scenario-comparison-result")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "비교 불러오기 취소", exact: true })).not.toBeVisible();
  await expect(page.getByLabel("변경 후 · 비교 대상", { exact: true })).toHaveValue("editor");
});

test("cancel returns to the comparison heading when edited JSON disables the trigger", async ({ page }) => {
  const { release } = await fixture(page, { delay: beforeId });
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(beforeId);
  const editor = page.getByRole("textbox", { name: "시나리오 JSON", exact: true });
  await editor.fill(JSON.stringify(editedScenario()));
  await page.getByRole("button", { name: "변경 사항 비교", exact: true }).click();
  await editor.fill("null");
  await page.getByRole("button", { name: "비교 불러오기 취소", exact: true }).click();
  await expect(page.getByRole("heading", { name: "시나리오 버전 비교", exact: true })).toBeFocused();
  const response = page.waitForResponse(row => row.url().endsWith("/functions/v1/admin-scenario") && row.request().postDataJSON().scenarioVersionId === beforeId);
  release(); await (await response).json();
  await expect(page.locator(".scenario-comparison-result")).not.toBeVisible();
});


test("a version-number-only editor change reports unchanged content", async ({ page }) => {
  const { calls } = await fixture(page);
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(beforeId);
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify({ ...tutorial, version: 2 }));
  await page.getByRole("button", { name: "변경 사항 비교", exact: true }).click();
  await expect(page.getByRole("region", { name: "비교 결과 · 0개 변경", exact: true })).toContainText("버전 번호를 제외한 내용이 같습니다.");
  expect(calls.filter(call => call.action === "preview")).toHaveLength(1);
});
