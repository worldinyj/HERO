import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import draft from "../scenarios/drafts/S03_procedure_reality_v1.json" with { type: "json" };
const versionId = "f6200000-0000-0000-0000-000000000001";
async function fixture(page: Page, options: { delayed?: boolean; mismatch?: boolean; error?: boolean; empty?: boolean } = {}) {
  const user = { id: "f6100000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const calls: Array<Record<string, unknown>> = [];
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
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
    if (url.pathname === "/auth/v1/user") body = user;
    else if (url.pathname === "/rest/v1/profiles") body = { id: user.id, plant_id: null, role: "admin", real_name: "테스트", nickname: "TESTADMIN", is_active: true, nickname_reset_required: false, job_role: null };
    else if (url.pathname === "/functions/v1/admin-scenario") {
      const request = route.request().postDataJSON(); calls.push(request);
      if (request.action === "list") body = { versions: options.empty ? [] : [{ id: versionId, version: draft.version, status: "review", default_perspective_role: draft.defaultPerspectiveRole, approved_at: null, published_at: null, created_at: new Date().toISOString(), scenarios: { id: "f6300000-0000-0000-0000-000000000001", slug: draft.id, title: draft.title, is_active: true, is_competitive: true } }] };
      else if (request.action === "season-overview") body = { season: null, scenarios: [] };
      else if (request.action === "preview") {
        if (options.delayed) await pending;
        if (options.error) { await route.fulfill({ status: 500, json: { error: "scenario_preview_unavailable" } }); return; }
        body = { preview: true, scenarioVersionId: versionId, scenario: options.mismatch ? { ...draft, title: "변경된 내용" } : draft };
      } else throw new Error(`Review made a mutating request: ${request.action}`);
    } else throw new Error(`Unexpected API: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/admin/scenarios");
  const panel = page.getByRole("region", { name: "S03 검토 및 승인 진행", exact: true });
  await expect(panel).toBeVisible();
  if (!options.empty) await expect(panel.getByRole("combobox")).toBeEnabled();
  return { panel, calls, release };
}
test("review areas show actual pending evidence and matched stored content opens a read-only preview", async ({ page }, info) => {
  const { panel, calls } = await fixture(page);
  await expect(panel).toContainText("필수 검토 0/5 통과");
  await expect(panel.locator("ol li")).toHaveCount(5);
  await panel.getByRole("combobox").selectOption(versionId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  await expect(panel).toContainText("검토 대상과 내용이 일치합니다");
  await panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true }).click();
  await expect(page.getByRole("region", { name: `${draft.title} · 미리보기`, exact: true })).toBeVisible();
  expect(calls.every(c => ["list", "season-overview", "preview"].includes(String(c.action)))).toBe(true);
  await page.getByRole("button", { name: "미리보기 닫기", exact: true }).click();
  await expect(panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await panel.screenshot({ path: info.outputPath("scenario-review-progress.png") });
});
for (const options of [{ mismatch: true }, { error: true }]) test(`changed or unreadable content cannot confirm review target: ${JSON.stringify(options)}`, async ({ page }) => {
  const { panel } = await fixture(page, options);
  await panel.getByRole("combobox").selectOption(versionId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true })).toHaveCount(0);
});
test("editor changes invalidate a checked target and canceled late reads cannot restore it", async ({ page }) => {
  const { panel, release } = await fixture(page, { delayed: true });
  await panel.getByRole("combobox").selectOption(versionId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("일치");
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(draft));
  release();
  await expect(panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: "입력한 S03 내용 확인", exact: true }).click();
  await expect(panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify({ ...draft, title: "수정본" }));
  await expect(panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true })).toHaveCount(0);
});
test("an empty scenario database still provides the review criteria without creating a version", async ({ page }) => {
  const { panel, calls } = await fixture(page, { empty: true });
  await expect(panel).toContainText("저장된 S03 버전이 없습니다");
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(draft));
  await panel.getByRole("button", { name: "입력한 S03 내용 확인", exact: true }).click();
  await expect(panel).toContainText("검토 대상과 내용이 일치합니다");
  expect(calls.every(c => ["list", "season-overview"].includes(String(c.action)))).toBe(true);
});
