import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const row = { session_id: "fixture-session-one", title: "2장 · 아마 이 설비가 맞을 겁니다", scenario_version: 4, season_title: "테스트 시즌", completed_at: "2026-10-15T07:00:00Z", hp_point: 233, ending: "safe_complete", reflection_state: "available", reflection_label: "작업 대상을 확신하기 어려운 상황입니다. 어떻게 하시겠습니까?" };

async function fixture(page: Page, role = "player") {
  const state = { calls: 0, fail: false, response: [row] as unknown };
  const user = { id: "fa100000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw new Error("History fixture requires loopback Supabase");
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: { id: user.id, role, is_active: true, plant_id: null, real_name: "테스트", nickname: "TEST", nickname_reset_required: false, job_role: "worker" } });
    if (url.pathname === "/rest/v1/rpc/my_record_summary") return route.fulfill({ json: {
      profile: { nickname: "TEST", role, job_role: "worker" }, metrics: { safety: 50, awareness: 50, communication: 50, procedure: 50, challenge: 50, completed_sessions: 2 },
      scenario_records: [{ scenario_slug: "s02_equipment_identity", title: row.title, best_hp: 245, play_count: 2, last_completed_at: row.completed_at }], season_history: [], current_season: null,
    } });
    if (url.pathname === "/functions/v1/nickname-action") return route.fulfill({ json: { canChange: false, resetRequired: false, changedThisSeason: false, seasonKey: null, nickname: "TEST" } });
    if (url.pathname === "/rest/v1/rpc/my_reflection_history") {
      state.calls++;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({});
      return state.fail ? route.fulfill({ status: 400, json: { message: "fixture failed" } }) : route.fulfill({ json: state.response });
    }
    throw new Error(`Unexpected history API: ${url.pathname}`);
  });
  await page.goto("/me");
  await expect(page.getByRole("heading", { name: "장별 최고 기록", exact: true })).toBeVisible();
  return state;
}

test("history loads on demand with version, per-play HP and explicit missing reflections", async ({ page }, testInfo) => {
  const state = await fixture(page);
  expect(state.calls).toBe(0);
  state.response = [row, { ...row, session_id: "fixture-session-two", reflection_state: "not_recorded", reflection_label: null }, { ...row, session_id: "fixture-session-three", reflection_state: "unavailable", reflection_label: null }];
  const section = page.getByRole("region", { name: "내 회고 다시보기", exact: true });
  await section.getByRole("button", { name: "최근 회고 불러오기", exact: true }).click();
  await expect(section.getByRole("article")).toHaveCount(3);
  await expect(section).toContainText("내가 돌아본 시점: 작업 대상을 확신하기 어려운");
  await expect(section).toContainText("이 플레이에는 회고 시점 선택이 저장되어 있지 않습니다.");
  await expect(section).toContainText("당시 장면과 연결할 수 없습니다.");
  await expect(section).toContainText("233 HP");
  await expect(section).not.toContainText("245 HP");
  await expect(section).not.toContainText("fixture-session");
  await expect(section.locator("time").first()).toHaveAttribute("datetime", row.completed_at);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("reflection-history.png"), fullPage: true });
});

test("history failure is separate from summary and retries successfully", async ({ page }) => {
  const state = await fixture(page); state.fail = true;
  await page.getByRole("button", { name: "최근 회고 불러오기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("회고 기록을 불러오지 못했습니다.");
  await expect(page.getByRole("heading", { name: "장별 최고 기록", exact: true })).toBeVisible();
  state.fail = false;
  await page.getByRole("button", { name: "회고 다시 불러오기", exact: true }).click();
  await expect(page.getByRole("region", { name: "내 회고 다시보기", exact: true })).toContainText("최근 완료 기록 1건");
});

test("empty and malformed history are different states", async ({ page }) => {
  const state = await fixture(page); state.response = [];
  await page.getByRole("button", { name: "최근 회고 불러오기", exact: true }).click();
  await expect(page.getByText("아직 완료한 경쟁 플레이가 없습니다.", { exact: true })).toBeVisible();
  state.response = [{ ...row, completed_at: "invalid" }];
  await page.getByRole("button", { name: "회고 새로고침", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("아직 완료한 경쟁 플레이가 없습니다.", { exact: true })).toHaveCount(0);
});

for (const role of ["admin", "plant_manager"]) test(`${role} does not request participant reflection history`, async ({ page }) => {
  const state = await fixture(page, role);
  await expect(page.getByRole("region", { name: "내 회고 다시보기", exact: true })).toHaveCount(0);
  expect(state.calls).toBe(0);
});
