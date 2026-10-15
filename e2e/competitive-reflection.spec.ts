import { expect, test } from "@playwright/test";
import { act, createGame, evaluate, type GameAction } from "../packages/engine/src/index";
import { ScenarioSchema } from "../packages/schema/src/scenario";
import tutorial from "../scenarios/data/S00_tutorial.json" with { type: "json" };

// Isolated competitive UI fixture: no production login, sessions or scores.
const scenario = ScenarioSchema.parse({ ...tutorial, id: "reflection_fixture" });
const sessionId = "f9100000-0000-4000-8000-000000000001";
const seed = "reflection-fixture";

for (const selection of ["initial_conditions", "decision_identify", "legacy_server"]) {
  test(`competitive review submits and displays reflection: ${selection}`, async ({ page }, testInfo) => {
    const bodies: Array<{ reflectionSelection?: string; reflectionAnswered: boolean; swissCheeseViewed: boolean }> = [];
    const user = { id: "f9100000-0000-4000-8000-000000000002", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    await page.addInitScript(({ user }) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
      localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
    }, { user });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "127.0.0.1") throw new Error("Reflection fixture requires loopback Supabase");
      if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
      if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: { id: user.id, role: "player", is_active: true, plant_id: null, real_name: "테스트", nickname: "TEST", nickname_reset_required: false, job_role: "worker" } });
      if (url.pathname === "/functions/v1/start-session") return route.fulfill({ json: {
        sessionId, seasonId: "fixture-season", seasonKey: "fixture", scenarioVersionId: "fixture-version", scenarioVersion: scenario.version,
        scenario, simulationSeed: seed, presentationSeed: seed, perspectiveRole: "worker", startedAt: new Date().toISOString(),
      } });
      if (url.pathname === "/functions/v1/submit-session") {
        const body = route.request().postDataJSON(); bodies.push(body);
        let game = createGame(scenario, { simulationSeed: seed, presentationSeed: seed });
        for (const action of body.actions as GameAction[]) game = act(scenario, game, action);
        const evaluation = evaluate(scenario, game, body);
        return route.fulfill({ json: { sessionId, alreadyCompleted: false, evaluation: {
          ...evaluation, ...(selection === "legacy_server" ? {} : { reflectionSelection: body.reflectionSelection }),
        } } });
      }
      throw new Error(`Unexpected reflection API: ${url.pathname}`);
    });
    await page.goto(`/play/${scenario.id}`);
    await page.getByRole("button", { name: "계속", exact: true }).click();
    await page.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ }).click();
    await page.getByRole("button", { name: "선택 확정", exact: true }).click();
    await page.getByRole("button", { name: "결과 돌아보기", exact: true }).click();
    await page.getByRole("radio", { name: selection === "decision_identify" ? /작업 대상을 확신하기 어려운/ : /상황이 시작되기 전부터/ }).click();
    await page.getByRole("button", { name: "내 생각 확인", exact: true }).click();
    await page.getByRole("button", { name: "HP 리뷰 보기", exact: true }).click();
    await expect(page.getByText("서버 검증 완료 · 시즌 기록에 반영되었습니다.", { exact: true })).toBeVisible();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ reflectionSelection: selection === "legacy_server" ? "initial_conditions" : selection, reflectionAnswered: true, swissCheeseViewed: true });
    const reflection = page.getByRole("region", { name: "내 회고 선택", exact: true });
    if (selection === "legacy_server") await expect(reflection).toHaveCount(0);
    else {
      await expect(reflection).toContainText(selection === "decision_identify" ? "작업 대상을 확신하기 어려운" : "상황이 시작되기 전부터");
      await expect(reflection).toContainText("정답 여부를 판정하거나");
      await reflection.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("reflection-review.png"), fullPage: true });
    }
  });
}
