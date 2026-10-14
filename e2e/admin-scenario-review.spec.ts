import { readFile } from "node:fs/promises";
import reviewTarget from "../apps/web/src/features/admin/scenarioReviewStatus.generated.json" with { type: "json" };
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import draft from "../scenarios/data/S03_procedure_reality_v1.json" with { type: "json" };
import s02 from "../scenarios/drafts/S02_equipment_identity_v1.json" with { type: "json" };
import targets from "../apps/web/src/features/admin/scenarioReviewTargets.generated.json" with { type: "json" };
import htoTarget from "../apps/web/src/features/admin/htoReviewTarget.generated.json" with { type: "json" };
import { validateReviewSubmission } from "../apps/web/src/features/admin/scenarioReviewSubmission";
const versionId = "f6200000-0000-0000-0000-000000000001";
async function fixture(page: Page, options: { delayed?: boolean; mismatch?: boolean; error?: boolean; empty?: boolean; s02?: boolean } = {}) {
  const stored = options.s02 ? s02 : draft;
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
      if (request.action === "list") body = { versions: options.empty ? [] : [{ id: versionId, version: stored.version, status: "review", default_perspective_role: stored.defaultPerspectiveRole, approved_at: null, published_at: null, created_at: new Date().toISOString(), scenarios: { id: "f6300000-0000-0000-0000-000000000001", slug: stored.id, title: stored.title, is_active: true, is_competitive: true } }] };
      else if (request.action === "season-overview") body = { season: null, scenarios: [] };
      else if (request.action === "preview") {
        if (options.delayed) await pending;
        if (options.error) { await route.fulfill({ status: 500, json: { error: "scenario_preview_unavailable" } }); return; }
        body = { preview: true, scenarioVersionId: versionId, scenario: options.mismatch ? { ...stored, title: "변경된 내용" } : stored };
      } else throw new Error(`Review made a mutating request: ${request.action}`);
    } else throw new Error(`Unexpected API: ${url.pathname}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/admin/scenarios");
  const panel = page.getByRole("region", { name: "S03 검토 및 승인 진행", exact: true });
  await expect(panel).toBeVisible();
  if (!options.empty && !options.s02) await expect(panel.getByLabel("저장된 S03 버전", { exact: true })).toBeEnabled();
  return { panel, calls, release };
}
test("review areas show actual recorded evidence and matched stored content opens a read-only preview", async ({ page }, info) => {
  const { panel, calls } = await fixture(page);
  await expect(panel).toContainText(`필수 검토 ${reviewTarget.areas.filter(area => area.decision === "pass").length}/5 통과`);
  await expect(panel.locator("ol li")).toHaveCount(5);
  await panel.getByLabel("저장된 S03 버전", { exact: true }).selectOption(versionId);
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
  await panel.getByLabel("저장된 S03 버전", { exact: true }).selectOption(versionId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(panel.getByRole("button", { name: "S03 검토용 미리보기 열기", exact: true })).toHaveCount(0);
});
test("editor changes invalidate a checked target and canceled late reads cannot restore it", async ({ page }) => {
  const { panel, release } = await fixture(page, { delayed: true });
  await panel.getByLabel("저장된 S03 버전", { exact: true }).selectOption(versionId);
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

async function reviewForm(page: Page) {
  const context = await fixture(page, { empty: true });
  const form = context.panel.getByRole("region", { name: "검토 결과 작성·다운로드", exact: true });
  const download = form.getByRole("button", { name: "검토 결과 JSON 다운로드", exact: true });
  await expect(download).toBeDisabled();
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(draft));
  await context.panel.getByRole("button", { name: "입력한 S03 내용 확인", exact: true }).click();
  await expect(form.getByLabel("검토 영역", { exact: true })).toBeEnabled();
  return { ...context, form, download };
}
test("a human-confirmed HOLD downloads a hash-bound file while progress and server records stay unchanged", async ({ page }, info) => {
  const { panel, form, download, calls } = await reviewForm(page);
  await expect(form.getByLabel("검토 판정", { exact: true })).toHaveValue("");
  await form.getByLabel("검토 영역", { exact: true }).selectOption("hf_accuracy");
  await form.getByLabel("검토 판정", { exact: true }).selectOption("hold");
  await form.getByLabel("검토자 성명 또는 공식 역할", { exact: true }).fill("HF 검토 담당자");
  await form.getByLabel("근거 문서·결재·티켓 참조", { exact: true }).fill("내부 검토 문서 001");
  const confirmation = form.getByRole("checkbox");
  await expect(confirmation).toBeDisabled();
  await form.getByLabel("보완할 내용 (필수)", { exact: true }).fill("직접 원인과 기여 조건의 경계를 보완해주세요.");
  await expect(download).toBeDisabled();
  await confirmation.check();
  const pending = page.waitForEvent("download");
  await download.click();
  const file = await pending;
  const path = await file.path(); expect(path).not.toBeNull();
  const packet = JSON.parse(await readFile(path!, "utf8"));
  expect(packet.kind).toBe("human_review_submission");
  expect(packet.contentSha256).toBe(reviewTarget.contentSha256);
  expect(packet.version).toBe(draft.version);
  expect(packet.reviews).toHaveLength(1);
  expect(packet.reviews[0]).toMatchObject({ area: "hf_accuracy", decision: "hold", reviewedBy: "HF 검토 담당자", evidenceRef: "내부 검토 문서 001" });
  expect(packet).not.toHaveProperty("approved"); expect(packet).not.toHaveProperty("nodes");
  await expect(panel).toContainText(`필수 검토 ${reviewTarget.areas.filter(area => area.decision === "pass").length}/5 통과`);
  expect(calls.every(c => ["list", "season-overview"].includes(String(c.action)))).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes("review")))).toBe(false);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.screenshot({ path: info.outputPath("review-submission-form.png") });
});
test("editing a confirmed result or changing the target locks download while retaining the unsaved draft", async ({ page }) => {
  const { panel, form, download } = await reviewForm(page);
  await form.getByLabel("검토 영역", { exact: true }).selectOption("just_culture");
  await form.getByLabel("검토 판정", { exact: true }).selectOption("pass");
  await form.getByLabel("검토자 성명 또는 공식 역할", { exact: true }).fill("교육 검토자");
  await form.getByLabel("근거 문서·결재·티켓 참조", { exact: true }).fill("검토 티켓 002");
  await form.getByRole("checkbox").check(); await expect(download).toBeEnabled();
  await form.getByLabel("근거 문서·결재·티켓 참조", { exact: true }).fill("검토 티켓 003");
  await expect(form.getByRole("checkbox")).not.toBeChecked(); await expect(download).toBeDisabled();
  await form.getByRole("checkbox").check();
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify({ ...draft, title: "변경된 내용" }));
  await expect(download).toBeDisabled(); await expect(form.getByRole("checkbox")).not.toBeChecked();
  await expect(form.getByLabel("검토자 성명 또는 공식 역할", { exact: true })).toHaveValue("교육 검토자");
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(draft));
  await panel.getByRole("button", { name: "입력한 S03 내용 확인", exact: true }).click();
  await expect(form.getByLabel("검토 영역", { exact: true })).toBeEnabled();
  await expect(download).toBeDisabled(); await expect(form.getByRole("checkbox")).not.toBeChecked();
});


test("S02 review selection binds its own content hash and cannot inherit S03 approval", async ({ page }) => {
  const { calls } = await fixture(page, { s02: true });
  await page.getByLabel("검토할 시나리오", { exact: true }).selectOption(s02.id);
  const panel = page.getByRole("region", { name: "S02 검토 및 승인 진행", exact: true });
  await expect(panel).toContainText("필수 검토 0/5 통과");
  await expect(panel).toContainText("최종 콘텐츠 승인: 대기");
  await panel.getByLabel("저장된 S02 버전", { exact: true }).selectOption(versionId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  const form = panel.getByRole("region", { name: "검토 결과 작성·다운로드", exact: true });
  await form.getByLabel("검토 영역", { exact: true }).selectOption("just_culture");
  await form.getByLabel("검토 판정", { exact: true }).selectOption("hold");
  await form.getByLabel("검토자 성명 또는 공식 역할", { exact: true }).fill("테스트 검토자");
  await form.getByLabel("근거 문서·결재·티켓 참조", { exact: true }).fill("fixture-s02-review");
  await form.getByLabel("보완할 내용 (필수)", { exact: true }).fill("교육 조건의 경계를 확인해주세요.");
  await form.getByRole("checkbox").check();
  const pending = page.waitForEvent("download");
  await form.getByRole("button", { name: "검토 결과 JSON 다운로드", exact: true }).click();
  const file = await pending;
  const packet = JSON.parse(await readFile((await file.path())!, "utf8"));
  const target = targets.find(target => target.scenarioId === s02.id)!;
  expect(packet.scenarioId).toBe(s02.id);
  expect(packet.contentSha256).toBe(target.contentSha256);
  expect(validateReviewSubmission(packet, target).error).toBeNull();
  expect(packet).not.toHaveProperty("artifactSha256");
  await panel.getByRole("button", { name: "S02 검토용 미리보기 열기", exact: true }).click();
  await expect(page.locator(".admin-preview-player")).toContainText("S02 검토 대상과 내용 일치 확인");
  await expect(panel).toContainText("필수 검토 0/5 통과");
  await page.getByLabel("검토할 시나리오", { exact: true }).selectOption(draft.id);
  await expect(page.locator(".admin-preview-player")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "S03 검토 및 승인 진행", exact: true })).toContainText("필수 검토 5/5 통과");
  await page.getByLabel("검토할 시나리오", { exact: true }).selectOption(s02.id);
  await expect(form.getByLabel("검토자 성명 또는 공식 역할", { exact: true })).toHaveValue("");
  await expect(form.getByRole("button", { name: "검토 결과 JSON 다운로드", exact: true })).toBeDisabled();
  expect(calls.every(call => ["list", "season-overview", "preview"].includes(String(call.action)))).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("switching scenario cancels a late verification response", async ({ page }) => {
  const { panel, release } = await fixture(page, { delayed: true });
  await panel.getByLabel("저장된 S03 버전", { exact: true }).selectOption(versionId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  await page.getByLabel("검토할 시나리오", { exact: true }).selectOption(s02.id);
  release();
  const current = page.getByRole("region", { name: "S02 검토 및 승인 진행", exact: true });
  await expect(current.getByRole("button", { name: "S02 검토용 미리보기 열기", exact: true })).toHaveCount(0);
  await expect(current.getByLabel("검토 영역", { exact: true })).toBeDisabled();
});

test("HTO feedback downloads separately and cannot be imported as scenario approval", async ({ page }, info) => {
  const { calls } = await fixture(page, { s02: true });
  await page.getByRole("button", { name: `${s02.title} v4 미리보기`, exact: true }).click();
  const preview = page.locator(".admin-preview-player");
  await expect(preview).toHaveAttribute("aria-labelledby", "admin-preview-title");
  await expect(preview.getByRole("heading", { name: `${s02.title} · 미리보기`, exact: true })).toBeVisible();
  await preview.locator(".hto-review-draft > summary").click();
  const form = preview.locator(".scenario-review-form");
  await expect(form).toHaveAttribute("aria-labelledby", "hto-feedback-title");
  await expect(form.getByRole("heading", { name: "HTO 시안 의견 작성", exact: true })).toBeVisible();
  const download = form.getByRole("button", { name: "HTO 시안 의견 JSON 다운로드", exact: true });
  await expect(download).toBeDisabled();
  await form.getByLabel("HTO 시안 의견 판정", { exact: true }).selectOption("needs_revision");
  await form.getByLabel("HTO 의견 작성자", { exact: true }).fill("테스트 검토자");
  await form.getByLabel("HTO 검토 의견 (필수)", { exact: true }).fill("조직 지원의 가상 조건을 더 쉽게 설명해주세요.");
  await form.getByRole("checkbox").check();
  const pending = page.waitForEvent("download"); await download.click();
  const packet = JSON.parse(await readFile((await (await pending).path())!, "utf8"));
  expect(packet).toMatchObject({ kind: "hto_draft_feedback", scenarioId: s02.id, contentSha256: htoTarget.contentSha256, artifactSha256: htoTarget.artifactSha256 });
  expect(packet).not.toHaveProperty("approved");
  expect(validateReviewSubmission(packet, htoTarget).submission).toBeNull();
  await form.getByLabel("HTO 검토 의견 (필수)", { exact: true }).fill("수정한 의견");
  await expect(download).toBeDisabled(); await expect(form.getByRole("checkbox")).not.toBeChecked();
  await form.screenshot({ path: `/tmp/hero-hto-feedback-${info.project.name}.png` });
  expect(calls.every(call => ["list", "season-overview", "preview"].includes(String(call.action)))).toBe(true);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes("review")))).toBe(false);
  expect((await new AxeBuilder({ page }).include(".hto-review-draft").analyze()).violations).toEqual([]);
});
