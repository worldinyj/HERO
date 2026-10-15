import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import targets from "../apps/web/src/features/admin/scenarioReviewTargets.generated.json" with { type: "json" };
import { EXPLORATION_QUESTIONS } from "../apps/web/src/features/exploration/feedbackContract";
import { parseExplorationFeedback } from "../apps/web/src/features/admin/explorationFeedbackValidation";
import { validateReviewSubmission } from "../apps/web/src/features/admin/scenarioReviewSubmission";
import { HERO_FEEDBACK_FORM_URL } from "../apps/web/src/components/FeedbackLink";

async function fixture(page: Page) {
  const writes: string[] = [];
  const user = { id: "f7100000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw new Error("Fixture requires loopback Supabase");
    if (route.request().method() !== "GET" && !["list", "season-overview"].includes(String(route.request().postDataJSON()?.action))) writes.push(url.pathname);
    const body = url.pathname === "/functions/v1/admin-scenario" ? { versions: [], season: null, scenarios: [] } : url.pathname === "/auth/v1/user" ? user : url.pathname === "/rest/v1/profiles" ? { id: user.id, plant_id: null, role: "admin", real_name: "테스트 관리자", nickname: "TESTADMIN", is_active: true, nickname_reset_required: false, job_role: null } : [];
    await route.fulfill({ json: body });
  });
  await page.goto("/experience/s02-exploration");
  await expect(page.getByRole("button", { name: "현장 탐색 시작", exact: true })).toBeVisible();
  return writes;
}
async function choose(page: Page, label: string) {
  await page.getByRole("button", { name: "다음 행동 결정", exact: true }).click();
  await page.getByRole("radio", { name: new RegExp(label) }).click();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
}
test("free exploration, one-time information and original card costs lead to an unsaved two-decision debrief", async ({ page }) => {
  const writes = await fixture(page);
  await page.getByRole("button", { name: "현장 탐색 시작", exact: true }).click();
  const clock = page.locator(".game-clock__value");
  for (const name of ["현장 패널", "작업 문서", "동료", "연락 수단"]) {
    await page.getByRole("button", { name: `${name} 열어 살펴보기`, exact: true }).click();
    await expect(clock).toHaveText("09:30");
  }
  await page.getByRole("button", { name: "현장 패널 열어 살펴보기", exact: true }).click();
  await page.getByRole("button", { name: "표시와 조작 요소의 구분 단서를 확인한다. · 1분", exact: true }).click();
  await expect(clock).toHaveText("09:31");
  await expect(page.getByRole("button", { name: "확인 완료 · 다시 읽기 무료", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "현장으로 돌아가기", exact: true }).click();
  await page.getByRole("button", { name: "현장 패널 열어 살펴보기", exact: true }).click();
  await expect(clock).toHaveText("09:31");
  await page.getByRole("button", { name: "멈추고 자기확인하기 · STAR · 1분", exact: true }).click();
  await expect(clock).toHaveText("09:32");
  await expect(page.getByRole("button", { name: /STAR.*사용 완료/ })).toBeDisabled();
  await choose(page, "현장 표식과 조작부를 가까이서 다시 식별한다");
  await expect(clock).toHaveText("09:34");
  await page.getByRole("button", { name: "다음 확인으로", exact: true }).click();
  await page.getByRole("button", { name: "작업 문서 열어 살펴보기", exact: true }).click();
  await page.getByRole("button", { name: "작업경계와 현재 대상의 식별정보를 다시 읽는다. · 1분", exact: true }).click();
  await expect(clock).toHaveText("09:35");
  await page.getByRole("button", { name: "동료 열어 살펴보기", exact: true }).click();
  await expect(clock).toHaveText("09:35");
  await page.getByRole("button", { name: "별도 근거로 독립확인 요청하기 · 5분", exact: true }).click();
  await expect(clock).toHaveText("09:40");
  await expect(page.getByRole("button", { name: /독립확인.*사용 완료/ })).toBeDisabled();
  await choose(page, "다른 근거와 사람을 이용해 독립확인을 요청한다");
  await expect(clock).toHaveText("09:44");
  await expect(page.getByRole("heading", { name: "확인과 판단 돌아보기", exact: true })).toBeVisible();
  const feedbackLink = page.locator(".exploration-feedback").getByRole("link", { name: /사용자 의견 남기기/ });
  await expect(feedbackLink).toHaveAttribute("href", HERO_FEEDBACK_FORM_URL);
  await expect(feedbackLink).toHaveAttribute("target", "_blank");
  await expect(feedbackLink).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".exploration-feedback")).toContainText("아래 입력과 판단 기록은 자동으로 옮겨지지 않습니다.");
  await expect(page.getByText("실제 조작 요소의 상태는 별도 확인이 필요합니다.", { exact: false })).toBeVisible();
  await expect(page.locator(".exploration-page ol")).toContainText("독립확인 요청하기");
  await expect(page.locator(".exploration-page")).not.toContainText("회고 전 HP");
  const download = page.getByRole("button", { name: "체험 의견과 판단 기록 내려받기", exact: true });
  await expect(download).toBeDisabled();
  await page.getByLabel("어떤 근거와 불확실성으로 판단했나요? (선택)", { exact: true }).fill("표시의 혼동과 상태의 불확실성을 이유로 추가 확인 요청");
  await page.getByLabel("현장에서 직접 조사한다는 느낌이 들었나요?", { exact: true }).fill("직접 살펴볼 수 있었음");
  await expect(download).toBeDisabled();
  await page.getByLabel("발견한 정보 때문에 처음 생각을 바꿨나요?", { exact: true }).fill(" ");
  await page.getByLabel("다른 순서나 방법으로 다시 확인해 보고 싶나요?", { exact: true }).fill("문서부터 다시 확인하고 싶음");
  await expect(download).toBeDisabled();
  await page.getByLabel("발견한 정보 때문에 처음 생각을 바꿨나요?", { exact: true }).fill("추가 정보로 독립확인이 필요하다고 생각했음");
  const pending = page.waitForEvent("download");
  await download.click();
  const file = await pending;
  const packet = JSON.parse(await readFile((await file.path())!, "utf8"));
  const target = targets.find(target => target.scenarioId === "s02_equipment_identity")!;
  expect(packet).toMatchObject({ kind: "exploration_usability_feedback", experienceVersion: 2, scenarioId: target.scenarioId, scenarioVersion: 4, sourceContentSha256: target.contentSha256 });
  expect(Object.keys(packet).sort()).toEqual(["schemaVersion", "kind", "experienceId", "experienceVersion", "scenarioId", "scenarioVersion", "sourceContentSha256", "createdAt", "scope", "notes", "actions", "judgmentBasis", "feedback"].sort());
  expect(packet.actions).toHaveLength(6);
  expect(packet.actions.map((action: { minutes: number }) => action.minutes)).toEqual([1, 1, 2, 1, 5, 4]);
  for (const action of packet.actions) expect(Object.keys(action).sort()).toEqual(["step", "nodeId", "actionType", "actionId", "label", "minutes"].sort());
  expect(packet.notes).toHaveLength(2);
  expect(packet.feedback).toHaveLength(3);
  expect(parseExplorationFeedback(JSON.stringify(packet)).error).toBeNull();
  expect(packet.judgmentBasis).toContain("불확실성");
  expect(validateReviewSubmission(packet, target).error).not.toBeNull();
  await expect(page.getByText("다운로드를 요청했습니다. 받은 파일은 직접 공유해주세요.", { exact: true })).toBeVisible();
  await page.getByLabel("현장에서 직접 조사한다는 느낌이 들었나요?", { exact: true }).fill("수정된 의견");
  await expect(page.getByText("다운로드를 요청했습니다. 받은 파일은 직접 공유해주세요.", { exact: true })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /game|explor|session.*queue/i.test(key)))).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "다시 해보기", exact: true }).click();
  await expect(clock).toHaveText("09:30");
  await page.getByRole("button", { name: "현장 탐색 시작", exact: true }).click();
  await expect(page.getByRole("complementary")).toContainText("확인 행동으로 확보한 단서가 여기에 모입니다");
});
test("decisions stay available without checking every target and keyboard returns to the hotspot", async ({ page }, info) => {
  const writes = await fixture(page);
  await page.getByRole("button", { name: "현장 탐색 시작", exact: true }).click();
  await page.getByRole("button", { name: "동료 열어 살펴보기", exact: true }).click();
  await page.getByRole("heading", { name: "동료", exact: true }).press("Escape");
  await expect(page.getByRole("button", { name: "동료 열어 살펴보기", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `/tmp/hero-exploration-room-${info.project.name}.png`, fullPage: true });
  await choose(page, "현재 위치와 작업 맥락");
  await page.getByRole("button", { name: "다음 확인으로", exact: true }).click();
  await choose(page, "현재까지 모은 정보로 자기확인을 한 뒤 진행한다");
  await expect(page.getByRole("heading", { name: "확인과 판단 돌아보기", exact: true })).toBeVisible();
  await expect(page.getByText("추가 정보 확인으로 확보한 단서는 없습니다.", { exact: false })).toBeVisible();
  expect(writes).toEqual([]);
});

test("campaign exposes a separate exploration entry", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".app-feedback").getByRole("link", { name: /사용자 의견 남기기/ })).toHaveAttribute("href", HERO_FEEDBACK_FORM_URL);
  const entry = page.getByRole("link", { name: /탐색형 체험.*약 5분/ });
  await expect(entry).toHaveAttribute("href", "/experience/s02-exploration");
  await entry.click();
  await expect(page.getByRole("button", { name: "현장 탐색 시작", exact: true })).toBeVisible();
});

test("administrator reviews local opinions, rejects altered files and clears old results without server writes", async ({ page }) => {
  const writes = await fixture(page);
  await page.goto("/admin/scenarios");
  await page.getByRole("button", { name: "체험 의견 파일 검토 열기", exact: true }).click();
  const input = page.getByLabel("체험 의견 JSON 파일 선택", { exact: true });
  const packet = {
    schemaVersion: 1, kind: "exploration_usability_feedback", experienceId: "s02_field_exploration", experienceVersion: 2,
    scenarioId: "s02_equipment_identity", scenarioVersion: 4, sourceContentSha256: targets.find(target => target.scenarioId === "s02_equipment_identity")!.contentSha256,
    createdAt: "2026-10-15T01:00:00.000Z", scope: "테스트", notes: [],
    actions: [
      { step: 1, nodeId: "decision_identify", actionType: "choice", actionId: "compare_work_document", label: "작업 문서와 현장 상태를 한 항목씩 대조한다.", minutes: 3 },
      { step: 3, nodeId: "decision_verify", actionType: "choice", actionId: "request_independent_check", label: "다른 근거와 사람을 이용해 독립확인을 요청한다.", minutes: 4 },
    ], judgmentBasis: "검증용 판단 근거", feedback: EXPLORATION_QUESTIONS.map(question => ({ question, response: "검증용 사용성 의견" })),
  };
  await input.setInputFiles({ name: "feedback.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(packet)) });
  const review = page.getByRole("region", { name: "체험 의견 파일 검토", exact: true });
  await expect(review).toContainText("S02 v4 대상·파일 구조·행동 순서·시간 비용 일치 확인");
  await expect(review).toContainText("검증용 판단 근거");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  packet.actions[0]!.minutes = 0;
  await input.setInputFiles({ name: "changed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(packet)) });
  await expect(review.getByRole("alert")).toContainText("시간 비용");
  await expect(review).not.toContainText("검증용 판단 근거");
  await input.setInputFiles({ name: "oversized.json", mimeType: "application/json", buffer: Buffer.from(" ".repeat(65537)) });
  await expect(review.getByRole("alert")).toContainText("64KB");
  await review.getByRole("button", { name: "검토 파일 닫기", exact: true }).click();
  await expect(review.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "S03 검토 및 승인 진행", exact: true })).toContainText("필수 검토 5/5 통과");
  expect(writes).toEqual([]);
});
