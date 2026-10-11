import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pack from "../assets/audio/prompts/NARRATION_S00_V1.json" with { type: "json" };
async function fixture(page: Page, withAssets = true) {
  const user = { id: "f6100000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: expiresAt }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture-refresh", expires_at: expiresAt, expires_in: 3600, token_type: "bearer", user }));
    const events: Array<{ event: string; path: string }> = [];
    (window as unknown as { audioEvents: typeof events }).audioEvents = events;
    class FakeAudio extends EventTarget {
      src: string; volume = 1; preload = ""; loop = false; paused = true;
      constructor(src: string) { super(); this.src = src; }
      async play() { this.paused = false; events.push({ event: "play", path: this.src }); }
      pause() { this.paused = true; events.push({ event: "pause", path: this.src }); }
    }
    window.Audio = FakeAudio as unknown as typeof Audio;
  }, { user });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw new Error("Fixture requires loopback Supabase");
    if (url.pathname === "/auth/v1/user") await route.fulfill({ json: user });
    else if (url.pathname === "/rest/v1/profiles") await route.fulfill({ json: { id: user.id, plant_id: null, role: "player", real_name: "테스트", nickname: "TESTPLAYER", is_active: true, nickname_reset_required: false, job_role: "worker" } });
    else if (url.pathname === "/rest/v1/rpc/my_record_summary") await route.fulfill({ json: {
      profile: { role: "player", nickname: "TESTPLAYER", real_name: "테스트", job_role: "worker" },
      metrics: { safety: 0, awareness: 0, communication: 0, procedure: 0, challenge: 0, completed_sessions: 0 },
      scenario_records: [], season_history: [], current_season: null,
    } });
    else if (url.pathname === "/functions/v1/nickname-action") await route.fulfill({ json: { canChange: false, resetRequired: false, changedThisSeason: false, seasonKey: null, nickname: "TESTPLAYER" } });
    else await route.fulfill({ json: [] });
  });
  await page.route("**/audio/audio_manifest.json", route => route.fulfill({ json: { version: "test", project: "HERO", assets: withAssets ? pack.clips.map(c => ({ id: c.asset_id, kind: "narration", approved: true, path: `/audio/narration/${c.filename}`, narration: { scenarioId: pack.scenario_id, scenarioVersion: pack.scenario_version, nodeId: c.node_id, field: c.field, ...(c.action_id ? { actionId: c.action_id } : {}), text: c.text } })) : [] } }));
  await page.goto("/briefing/s00_tutorial");
  await page.getByRole("button", { name: "소리 켜고 시작", exact: true }).click();
  await page.getByRole("button", { name: /튜토리얼 시작/ }).click();
  await expect(page.getByText(pack.clips[0]!.text, { exact: true })).toBeVisible();
}
async function played(page: Page) {
  return page.evaluate(() => (window as unknown as { audioEvents: Array<{ event: string; path: string }> }).audioEvents.filter(e => e.event === "play").map(e => e.path));
}
test("narration follows displayed scene, info and reached ending; replay and stop are accessible", async ({ page }) => {
  await fixture(page);
  await expect.poll(() => played(page)).toHaveLength(1);
  await page.getByRole("button", { name: "나레이션 다시 듣기", exact: true }).click();
  await expect.poll(() => played(page)).toHaveLength(2);
  await page.getByRole("button", { name: "나레이션 중단", exact: true }).click();
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect.poll(() => played(page)).toHaveLength(3);
  expect((await played(page))[2]).toContain("decision_identify_prompt");
  expect((await played(page)).some(p => p.includes("read_label"))).toBe(false);
  await page.getByRole("button", { name: /표식의 글자를 가까이서 확인한다/ }).click();
  await expect.poll(() => played(page)).toHaveLength(4);
  expect((await played(page))[3]).toContain("read_label");
  await page.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ }).click();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
  await expect.poll(() => played(page)).toHaveLength(5);
  expect((await played(page))[4]).toContain("safe_end_summary");
  expect((await played(page)).some(p => p.includes("near_miss_end"))).toBe(false);
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations;
  expect(violations).toEqual([]);
  await page.getByRole("button", { name: "결과 돌아보기", exact: true }).click();
  await expect(page.getByRole("button", { name: "나레이션 다시 듣기" })).toHaveCount(0);
});
test("empty manifest keeps tutorial playable without narration controls", async ({ page }) => {
  await fixture(page, false);
  await expect(page.getByRole("button", { name: "나레이션 다시 듣기" })).toHaveCount(0);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.getByRole("heading", { name: pack.clips[1]!.text })).toBeVisible();
  expect(await played(page)).toEqual([]);
});
test("narration mute is independent, persists and prevents scene autoplay", async ({ page }) => {
  await fixture(page);
  await expect.poll(() => played(page)).toHaveLength(1);
  await page.goto("/me");
  const mute = page.getByLabel("나레이션", { exact: true });
  await expect(mute).toBeChecked();
  await mute.uncheck();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("hero-audio-settings-v1")!));
  expect(saved.narrationMuted).toBe(true);
  expect(saved.bgmMuted).toBe(false);
  expect(saved.sfxMuted).toBe(false);
  await page.goto("/play/s00_tutorial");
  await expect(page.getByRole("button", { name: "나레이션 다시 듣기", exact: true })).toBeDisabled();
  expect(await played(page)).toEqual([]);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.getByRole("heading", { name: pack.clips[1]!.text })).toBeVisible();
  expect(await played(page)).toEqual([]);
});
