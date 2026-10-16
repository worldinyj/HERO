import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import tutorial from "../scenarios/data/S00_tutorial.json" with { type: "json" };
import s03 from "../scenarios/data/S03_procedure_reality_v1.json" with { type: "json" };

const admin = "fa100000-0000-0000-0000-000000000001";
const first = "fa200000-0000-0000-0000-000000000001";
const second = "fa200000-0000-0000-0000-000000000002";
const reviewId = "fa200000-0000-0000-0000-000000000003";
const seasonId = "fa300000-0000-0000-0000-000000000001";
const scenarioId = "fa400000-0000-0000-0000-000000000001";
async function fixture(page: Page, hold: string | null = null, allowWrites = false) {
  const state = { hold, holdAlso: null as string | null, malformed: false };
  const calls: Array<Record<string, unknown>> = [];
  const releases: Array<() => void> = [];
  let status = "draft";
  let bound = false;
  const user = { id: admin, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expires_at = Math.floor(Date.now() / 1000) + 3600;
    const access_token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expires_at }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token, refresh_token: "fixture", expires_at, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:auth|rest|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw Error("Read recovery fixture requires loopback Supabase");
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: { id: admin, role: "admin", plant_id: null, real_name: "시험", nickname: "TEST", is_active: true, nickname_reset_required: false, job_role: null } });
    if (url.pathname === "/rest/v1/audit_logs") return route.fulfill({ json: [] });
    if (url.pathname !== "/functions/v1/admin-scenario") throw Error(`Unexpected API ${url.pathname}`);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push(body);
    let response: unknown;
    if (body.action === "list") response = state.malformed ? {} : { versions: [first, second, reviewId].map((id, index) => {
      const content = index === 2 ? s03 : tutorial;
      return { id, version: index === 1 ? tutorial.version + 1 : content.version, status: index === 0 ? status : index === 2 ? "review" : "draft", default_perspective_role: content.defaultPerspectiveRole, created_at: "2026-10-16T00:00:00Z", approved_at: null, published_at: null, scenarios: { id: index === 2 ? scenarioId : first, slug: content.id, title: content.title, is_active: true, is_competitive: index === 2 } };
    }) };
    else if (body.action === "preview") response = { preview: true, scenarioVersionId: body.scenarioVersionId, scenario: body.scenarioVersionId === reviewId ? s03 : body.scenarioVersionId === second ? { ...tutorial, version: tutorial.version + 1, title: "비교용 제목" } : tutorial };
    else if (body.action === "season-overview") response = { season: { id: seasonId, seasonKey: "2026-10", title: "시험 시즌", startsAt: "2026-09-30T15:00:00Z", endsAt: "2026-10-31T15:00:00Z" }, scenarios: [{ id: scenarioId, slug: s03.id, title: s03.title, isActive: true, isCompetitive: true, publishedVersionId: reviewId, publishedVersion: s03.version, revision: "a".repeat(32), bindings: bound ? [{ versionId: reviewId, version: s03.version, status: "published", isActive: true }] : [] }] };
    else if (allowWrites && body.action === "set-status") {
      status = String(body.status);
      response = { updated: true, version: { id: first, version: tutorial.version, status } };
    } else if (allowWrites && body.action === "upload") {
      response = { uploaded: true, warnings: [] };
    } else if (allowWrites && body.action === "set-season-scenario") {
      bound = true;
      response = { updated: true, seasonId, scenarioId, versionId: reviewId, isActive: true };
    } else throw Error(`Unexpected mutation: ${body.action}`);
    if (body.action === state.hold || body.action === state.holdAlso) await new Promise<void>(resolve => releases.push(resolve));
    await route.fulfill({ json: response }).catch(() => {});
  });
  await page.goto("/admin/scenarios");
  await expect(page.getByRole("heading", { name: "시나리오 관리", exact: true })).toBeVisible();
  return { state, calls, release: () => releases.splice(0).forEach(resolve => resolve()) };
}
const previewButton = (page: Page) => page.getByRole("button", { name: `${tutorial.title} v${tutorial.version} 미리보기`, exact: true });
const readOnly = (calls: Array<Record<string, unknown>>) => expect(calls.every(call => ["list", "preview", "season-overview"].includes(String(call.action)))).toBe(true);

test("list timeout permits refresh without claiming no saved versions or publishing late rows", async ({ page }, info) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page, "list");
  await expect.poll(() => calls.filter(x => x.action === "list").length).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("시나리오 목록 조회 응답이 지연");
  await expect(page.getByText("저장된 시나리오 버전이 없습니다.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("저장된 버전 목록을 확인하지 못했습니다. 목록을 새로고침해주세요.", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("scenario-list-timeout.png") });
  state.hold = null;
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(previewButton(page)).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toHaveCount(0);
  readOnly(calls);
});

test("malformed list hides old status controls and recovers through a deliberate read", async ({ page }) => {
  const { state, calls } = await fixture(page);
  await expect(previewButton(page)).toBeVisible();
  state.malformed = true;
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("시나리오 목록을 불러오지 못했습니다");
  await expect(previewButton(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "검토로", exact: true })).toHaveCount(0);
  await expect(page.getByText("저장된 시나리오 버전이 없습니다.", { exact: true })).toHaveCount(0);
  state.malformed = false;
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect(previewButton(page)).toBeVisible();
  readOnly(calls);
});

test("saved preview timeout releases its button and a retry validates the requested version", async ({ page }) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page);
  await expect(previewButton(page)).toBeVisible();
  state.hold = "preview";
  await previewButton(page).click();
  await expect.poll(() => calls.filter(x => x.action === "preview").length).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("미리보기 조회 응답이 지연");
  await expect(previewButton(page)).toBeEnabled();
  state.hold = null;
  await previewButton(page).click();
  const preview = page.getByRole("region", { name: `${tutorial.title} · 미리보기`, exact: true });
  await expect(preview).toBeVisible();
  release();
  await expect(preview).toBeVisible();
  readOnly(calls);
});

test("comparison timeout can retry without accepting canceled results", async ({ page }) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page);
  await expect(previewButton(page)).toBeVisible();
  await page.getByLabel("변경 전 · 기준 버전", { exact: true }).selectOption(first);
  await page.getByLabel("변경 후 · 비교 대상", { exact: true }).selectOption(second);
  state.hold = "preview";
  const compare = page.getByRole("button", { name: "변경 사항 비교", exact: true });
  await compare.click();
  await expect.poll(() => calls.filter(x => x.action === "preview").length).toBe(2);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("alert")).toContainText("버전 비교 조회 응답이 지연");
  await expect(compare).toBeEnabled();
  state.hold = null;
  await compare.click();
  await expect(page.getByRole("heading", { name: /비교 결과 ·/ })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: /비교 결과 ·/ })).toBeVisible();
  readOnly(calls);
});

test("review read timeout cannot verify content or unlock review downloads", async ({ page }) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page);
  const panel = page.getByRole("region", { name: "S03 검토 및 승인 진행", exact: true });
  await panel.getByLabel("저장된 S03 버전", { exact: true }).selectOption(reviewId);
  state.hold = "preview";
  const check = panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true });
  await check.click();
  await expect.poll(() => calls.filter(x => x.action === "preview").length).toBe(1);
  await page.clock.runFor(15_001);
  await expect(panel.getByRole("alert")).toContainText("검토 대상 조회 응답이 지연");
  await expect(panel.getByRole("button", { name: "검토 결과 JSON 다운로드", exact: true })).toBeDisabled();
  state.hold = null;
  await check.click();
  await expect(panel.getByText("S03 v7 검토 대상과 내용이 일치합니다.", { exact: true })).toBeVisible();
  release();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  readOnly(calls);
});

test("season read timeout enables refresh without assuming no open season", async ({ page }) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page);
  const panel = page.getByRole("region", { name: "활성 시즌 시나리오 연결", exact: true });
  const refresh = panel.getByRole("button", { name: "시즌 연결 새로고침", exact: true });
  await expect(refresh).toBeEnabled();
  state.hold = "season-overview";
  const before = calls.length;
  await refresh.click();
  await expect.poll(() => calls.length).toBeGreaterThan(before);
  await page.clock.runFor(15_001);
  await expect(panel.getByRole("alert")).toContainText("시즌 연결 조회 응답이 지연");
  await expect(refresh).toBeEnabled();
  await expect(panel.getByText("현재 열린 시즌이 없습니다.", { exact: false })).toHaveCount(0);
  state.hold = null;
  await refresh.click();
  await expect(panel).toContainText("시험 시즌");
  release();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  readOnly(calls);
});

for (const action of ["set-status", "set-season-scenario"]) test(`${action} remains pending beyond read deadline and sends only once`, async ({ page }) => {
  await page.clock.install();
  const { calls, release } = await fixture(page, action, true);
  await expect(previewButton(page)).toBeVisible();
  if (action === "set-status") {
    const row = page.locator(".scenario-version-card").filter({ has: previewButton(page) });
    await row.getByRole("button", { name: "검토로", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "검토 상태로 변경", exact: true }).click();
  } else {
    const panel = page.getByRole("region", { name: "활성 시즌 시나리오 연결", exact: true });
    await panel.getByRole("button", { name: "v7 시즌에 연결", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "이 버전 연결", exact: true }).click();
  }
  await expect.poll(() => calls.filter(x => x.action === action).length).toBe(1);
  await page.clock.runFor(15_001);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "변경 중…", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "취소", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  release();
  await expect(dialog).not.toBeVisible();
  expect(calls.filter(x => x.action === action)).toHaveLength(1);
});


test("a failed list refresh retains review text while disabling content confirmation and download", async ({ page }) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page);
  const panel = page.getByRole("region", { name: "S03 검토 및 승인 진행", exact: true });
  await panel.getByLabel("저장된 S03 버전", { exact: true }).selectOption(reviewId);
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  const reviewer = panel.getByLabel("검토자 성명 또는 공식 역할", { exact: true });
  await expect(reviewer).toBeEnabled();
  await reviewer.fill("보존할 검토 초안");
  state.hold = "list";
  const before = calls.filter(x => x.action === "list").length;
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await expect.poll(() => calls.filter(x => x.action === "list").length).toBe(before + 1);
  await page.clock.runFor(15_001);
  await expect(reviewer).toBeDisabled();
  await expect(reviewer).toHaveValue("보존할 검토 초안");
  await expect(panel.getByRole("button", { name: "검토 결과 JSON 다운로드", exact: true })).toBeDisabled();
  state.hold = null;
  await page.getByRole("button", { name: "목록 새로고침", exact: true }).click();
  await panel.getByRole("button", { name: "저장된 검토 대상 확인", exact: true }).click();
  await expect(reviewer).toBeEnabled();
  await expect(reviewer).toHaveValue("보존할 검토 초안");
  release();
  readOnly(calls);
});

for (const action of ["set-status", "set-season-scenario"]) test(`${action} confirmed write is never resent when its following read times out`, async ({ page }) => {
  await page.clock.install();
  const { state, calls, release } = await fixture(page, null, true);
  await expect(previewButton(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "시즌 연결 새로고침", exact: true })).toBeEnabled();
  state.hold = action === "set-status" ? "list" : "season-overview";
  const followingRead = state.hold;
  const beforeReads = calls.filter(x => x.action === followingRead).length;
  const beforeSeasonReads = calls.filter(x => x.action === "season-overview").length;
  // A version refresh also refreshes the independent season panel. Exercise both errors deliberately.
  if (action === "set-status") state.holdAlso = "season-overview";
  if (action === "set-status") {
    await page.locator(".scenario-version-card").filter({ has: previewButton(page) }).getByRole("button", { name: "검토로", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "검토 상태로 변경", exact: true }).click();
  } else {
    await page.getByRole("region", { name: "활성 시즌 시나리오 연결", exact: true }).getByRole("button", { name: "v7 시즌에 연결", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "이 버전 연결", exact: true }).click();
  }
  await expect.poll(() => calls.filter(x => x.action === action).length).toBe(1);
  await expect.poll(() => calls.filter(x => x.action === followingRead).length).toBeGreaterThan(beforeReads);
  if (action === "set-status") await expect.poll(() => calls.filter(x => x.action === "season-overview").length).toBeGreaterThan(beforeSeasonReads);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: action === "set-status" ? "시나리오 목록 조회 응답이 지연" : "시즌 연결 조회 응답이 지연" })).toBeVisible();
  if (action === "set-status") await expect(page.getByRole("region", { name: "활성 시즌 시나리오 연결", exact: true }).getByRole("alert")).toContainText("시즌 연결 조회 응답이 지연");
  state.hold = null;
  state.holdAlso = null;
  await page.getByRole("button", { name: action === "set-status" ? "목록 새로고침" : "시즌 연결 새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  release();
  expect(calls.filter(x => x.action === action)).toHaveLength(1);
});

test("upload keeps its write pending beyond the read deadline", async ({ page }) => {
  await page.clock.install();
  const { calls, release } = await fixture(page, "upload", true);
  await expect(previewButton(page)).toBeVisible();
  await page.getByRole("textbox", { name: "시나리오 JSON", exact: true }).fill(JSON.stringify(tutorial));
  await page.getByRole("button", { name: "서버 검증 후 초안 저장", exact: true }).click();
  await expect.poll(() => calls.filter(x => x.action === "upload").length).toBe(1);
  await page.clock.runFor(15_001);
  await expect(page.getByRole("button", { name: "검증·저장 중…", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "시나리오 JSON", exact: true })).not.toBeEmpty();
  release();
  await expect(page.getByRole("button", { name: "서버 검증 후 초안 저장", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "시나리오 JSON", exact: true })).toBeEmpty();
  expect(calls.filter(x => x.action === "upload")).toHaveLength(1);
});
