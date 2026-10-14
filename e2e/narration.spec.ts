import { readFile } from "node:fs/promises";
import resultQc from "../assets/audio/reviews/RESULT_AUDIO_PROCESSED_QC.json" with { type: "json" };
import competitiveFixture from "./fixtures/e2e_competitive.json" with { type: "json" };
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pack from "../assets/audio/prompts/NARRATION_S00_V2.json" with { type: "json" };
async function fixture(page: Page, withAssets = true, nativeAudio = false, briefingCapture?: string, extraAssets: Array<{ id: string; kind: string; approved: boolean; path: string }> = []) {
  const user = { id: "f6100000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user, nativeAudio }) => {
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
    if (nativeAudio) {
      const NativeAudio = window.Audio;
      const voices: Array<{ path: string; audio: HTMLAudioElement }> = [];
      (window as unknown as { audioVoices: typeof voices }).audioVoices = voices;
      window.Audio = function(src: string) {
        const audio = new NativeAudio(src);
        audio.addEventListener("playing", () => events.push({ event: "play", path: src }));
        voices.push({ path: src, audio });
        return audio;
      } as unknown as typeof Audio;
    } else window.Audio = FakeAudio as unknown as typeof Audio;
  }, { user, nativeAudio });
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
  if (!nativeAudio) await page.route("**/audio/audio_manifest.json", route => route.fulfill({ json: { version: "test", project: "HERO", assets: withAssets ? [...extraAssets, ...pack.clips.filter(c => c.status === "registered").map(c => ({ id: c.asset_id, kind: "narration", approved: true, path: `/audio/narration/${c.filename}`, narration: { scenarioId: pack.scenario_id, scenarioVersion: pack.scenario_version, nodeId: c.node_id, field: c.field, ...(c.action_id ? { actionId: c.action_id } : {}), text: c.text } }))] : [] } }));
  await page.goto("/briefing/s00_tutorial");
  await expect(page.locator('.learning-mascot-heading img')).toHaveAttribute('src', '/images/mascot/suri-check-v1.webp');
  if (briefingCapture) {
    await expect.poll(() => page.locator('.learning-mascot-heading img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: briefingCapture, fullPage: true });
  }
  await page.getByRole("button", { name: "소리 켜고 시작", exact: true }).click();
  await page.getByRole("button", { name: /튜토리얼 시작/ }).click();
  await expect(page.getByText(pack.clips[0]!.text, { exact: true })).toBeVisible();
}
async function played(page: Page) {
  return page.evaluate(() => (window as unknown as { audioEvents: Array<{ event: string; path: string }> }).audioEvents.filter(e => e.event === "play").map(e => e.path));
}
test("narration follows displayed scene, info and reached ending; replay and stop are accessible", async ({ page }, testInfo) => {
  await fixture(page, true, false, testInfo.outputPath('suri-briefing.png'));
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
  const reflect = page.locator('.learning-mascot-heading img');
  await expect(reflect).toHaveAttribute('src', '/images/mascot/suri-reflect-v1.webp');
  await expect.poll(() => reflect.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('suri-reflection.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('suri-reflection-desktop.png'), fullPage: true });
});
test("profile companion preserves the difference between an unranked and ranked season", async ({ page }, testInfo) => {
  await fixture(page);
  let ranked = false;
  await page.route("**/rest/v1/rpc/my_record_summary", route => route.fulfill({ json: {
    profile: { role: "player", nickname: "TESTPLAYER", real_name: "테스트", job_role: "worker" },
    metrics: { safety: 0, awareness: 0, communication: 0, procedure: 0, challenge: 0, completed_sessions: ranked ? 1 : 0 },
    scenario_records: [], season_history: [],
    current_season: { season_key: "2026-10", season_title: "10월 시즌", hp_point: ranked ? 120 : 0,
      scenario_count: ranked ? 1 : 0, overall_rank: ranked ? 1 : 0, overall_top_percent: ranked ? 10 : 0,
      plant_rank: ranked ? 1 : 0, job_rank: ranked ? 1 : 0 },
  } }));
  await page.goto("/me");
  const season = page.getByRole("region", { name: "현재 시즌" });
  await expect(season).toContainText("순위 미집계");
  await expect(season).not.toContainText("#0");
  await expect(season).not.toContainText("상위 0%");
  const companion = page.locator(".learning-mascot-heading img");
  await expect(companion).toHaveAttribute("src", "/images/mascot/suri-reflect-v1.webp");
  await expect.poll(() => companion.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("profile-companion.png"), fullPage: true });
  ranked = true;
  await page.reload();
  await expect(season).toContainText("#1");
  await expect(season).toContainText("상위 10%");
  await expect(season).not.toContainText("순위 미집계");
});

test("empty manifest keeps tutorial playable without narration controls", async ({ page }) => {
  await fixture(page, false);
  await expect(page.getByRole("button", { name: "나레이션 다시 듣기" })).toHaveCount(0);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await expect(page.getByRole("heading", { name: pack.clips[1]!.text })).toBeVisible();
  expect(await played(page)).toEqual([]);
});

test("approved near-miss v2 voice follows barrier wording and supports replay and stop", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("radio", { name: /현재 정보로 판단해 바로 진행한다/ }).click();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
  await expect(page.getByText(pack.clips[4]!.text, { exact: true })).toBeVisible();
  await expect.poll(() => played(page)).toContain("/audio/narration/nar_s00_near_miss_end_summary_v2.mp3");
  expect((await played(page)).some(path => path.includes("near_miss_end_summary_v1"))).toBe(false);
  const plays = (await played(page)).length;
  await page.getByRole("button", { name: "나레이션 다시 듣기", exact: true }).click();
  await expect.poll(() => played(page)).toHaveLength(plays + 1);
  await page.getByRole("button", { name: "나레이션 중단", exact: true }).click();
  await expect(page.getByRole("button", { name: "결과 돌아보기", exact: true })).toBeEnabled();
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


test("registered audio MP3 files play and decode in the native browser audio element", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await fixture(page, true, true);
  await expect.poll(async () => (await played(page)).filter(path => path.includes("/narration/"))).toHaveLength(1);
  expect((await played(page)).some(path => path.includes("nar_s00_intro_text_v1.mp3"))).toBe(true);
  await expect.poll(async () => (await played(page)).some(path => path.includes("bgm_operation_base_v1.mp3"))).toBe(true);
  await page.getByRole("button", { name: "나레이션 중단", exact: true }).click();
  const results = await page.evaluate(async () => {
    const manifest = await (await fetch("/audio/audio_manifest.json")).json();
    const values: Array<{ id: string; kind: string; duration: number; played: boolean }> = [];
    for (const asset of manifest.assets) {
      const audio = new Audio(asset.path);
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
        audio.addEventListener("error", () => reject(new Error(`Cannot decode ${asset.id}`)), { once: true });
        audio.load();
      });
      await audio.play();
      values.push({ id: asset.id, kind: asset.kind, duration: audio.duration, played: !audio.paused });
      audio.pause();
    }
    return values;
  });
  expect(results).toHaveLength(17);
  expect(results.every(r => r.duration > 0 && Number.isFinite(r.duration) && r.played)).toBe(true);
  expect(results.filter(r => r.kind === "narration").every(r => r.duration > 4 && r.duration < 8)).toBe(true);
  expect(results.filter(r => r.kind === "bgm")).toHaveLength(4);
  expect(results.filter(r => r.kind === "bgm").every(r => r.duration > 44 && r.duration < 61)).toBe(true);
  expect(results.filter(r => r.kind === "sfx")).toHaveLength(5);
  expect(results.filter(r => r.kind === "stinger")).toHaveLength(3);
  expect(results.filter(r => r.kind === "stinger").every(r => r.duration > 4 && r.duration < 7)).toBe(true);
  expect(errors).toEqual([]);
});

test("missing learning companion images keep briefing and reflection playable", async ({ page }, testInfo) => {
  await page.route("**/images/mascot/**", route => route.abort());
  await fixture(page, false);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ }).click();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
  await page.getByRole("button", { name: "결과 돌아보기", exact: true }).click();
  await expect(page.locator('.learning-mascot-heading img')).toBeHidden();
  await page.getByRole("radio", { name: /상황이 시작되기 전부터/ }).click();
  await page.getByRole("button", { name: "내 생각 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "방벽은 한 번에 무너지지 않습니다" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('missing-mascot-timeline.png'), fullPage: true });
});

test("registered music and effects follow play actions and muted settings", async ({ page }) => {
  await fixture(page, true, true);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("button", { name: /표식의 글자를 가까이서 확인한다/ }).click();
  await expect.poll(async () => (await played(page)).some(path => path.includes("sfx_info_open_v1.mp3"))).toBe(true);
  await page.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ }).click();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
  await expect.poll(async () => (await played(page)).some(path => path.includes("sfx_choice_confirm_v1.mp3"))).toBe(true);
  await expect.poll(async () => (await played(page)).some(path => path.includes("sfx_stamp_result_v1.mp3"))).toBe(true);
  await page.goto("/me");
  await page.getByLabel("BGM", { exact: true }).uncheck();
  await page.getByLabel("효과음", { exact: true }).uncheck();
  await page.goto("/briefing/s00_tutorial");
  await page.getByRole("button", { name: /^이어하기$|튜토리얼 시작/ }).click();
  await expect(page.getByRole("button", { name: "결과 돌아보기", exact: true })).toBeVisible();
  expect((await played(page)).filter(path => path.includes("/bgm/") || path.includes("/sfx/"))).toEqual([]);
});

const resultAudio = [
  { id: "BGM-03", kind: "bgm", approved: true, path: "/audio/bgm/bgm_operation_base_v1.mp3" },
  { id: "BGM-05", kind: "bgm", approved: true, path: "/audio/bgm/bgm_review_reflective_v1.mp3" },
  { id: "BGM-07", kind: "stinger", approved: true, path: "/audio/bgm/stinger_near_miss_v1.mp3" },
  { id: "SFX-10", kind: "sfx", approved: true, path: "/audio/sfx/sfx_stamp_result_v1.mp3" },
];
for (const approved of [true, false]) {
  test(`result music and ending cues respect approval=${approved}, review cleanup and replay`, async ({ page }) => {
    await fixture(page, true, false, undefined, resultAudio.map(a => ({ ...a, approved: a.id === "BGM-05" || a.id === "BGM-07" ? approved : a.approved })));
    await expect.poll(async () => (await played(page)).filter(p => p.includes("operation_base"))).toHaveLength(1);
    await page.getByRole("button", { name: "계속", exact: true }).click();
    await page.getByRole("radio", { name: /현재 정보로 판단해 바로 진행한다/ }).click();
    await page.getByRole("button", { name: "선택 확정", exact: true }).click();
    await expect(page.getByRole("status", { name: "결과: 근접오류", exact: true })).toBeVisible();
    const endingPath = approved ? "stinger_near_miss" : "sfx_stamp_result";
    await expect.poll(async () => (await played(page)).filter(p => p.includes(endingPath))).toHaveLength(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioEvents: Array<{ event: string; path: string }> }).audioEvents.some(e => e.event === "pause" && e.path.includes("operation_base")))).toBe(true);
    if (approved) await expect.poll(async () => (await played(page)).filter(p => p.includes("review_reflective"))).toHaveLength(1);
    else expect((await played(page)).some(p => p.includes("review_reflective") || p.includes("stinger_near_miss"))).toBe(false);
    await page.getByRole("button", { name: "결과 돌아보기", exact: true }).click();
    await expect.poll(() => page.evaluate(path => (window as unknown as { audioEvents: Array<{ event: string; path: string }> }).audioEvents.some(e => e.event === "pause" && e.path.includes(path)), endingPath)).toBe(true);
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: "내 생각 확인", exact: true }).click();
    await page.getByRole("button", { name: "이 지점부터 리플레이", exact: true }).click();
    await expect.poll(async () => (await played(page)).filter(p => p.includes("operation_base"))).toHaveLength(2);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioEvents: Array<{ event: string; path: string }> }).audioEvents.filter(e => e.event === "pause" && e.path.includes("operation_base")).length)).toBe(2);
  });
}

test("processed result audio copies decode and play as native audio", async ({ page }) => {
  const paths = resultQc.files.map(file => `/audio/candidate-review/${file.asset_id}.mp3`);
  for (const [index, file] of resultQc.files.entries()) {
    await page.route(`**${paths[index]}`, async route => route.fulfill({ contentType: "audio/mpeg", body: await readFile(file.processed_path) }));
  }
  await fixture(page, true, true);
  const result = await page.evaluate(async paths => {
    const context = new AudioContext();
    const values = [];
    try {
      for (const path of paths) {
        const response = await fetch(path);
        const decoded = await context.decodeAudioData(await response.arrayBuffer());
        const voice = new Audio(path);
        try {
          await voice.play();
          await new Promise<void>(resolve => setTimeout(resolve, 100));
          values.push({ path, duration: decoded.duration, advancing: voice.currentTime > 0 && !voice.paused });
        } finally { voice.pause(); voice.src = ""; }
      }
    } finally { await context.close(); }
    return values;
  }, paths);
  expect(result).toHaveLength(4);
  expect(result.every(r => r.duration > 4 && r.advancing)).toBe(true);
});

test("competitive play switches to review music from the same game route", async ({ page }) => {
  await fixture(page, true, false, undefined, resultAudio);
  await page.route("**/functions/v1/start-session", route => route.fulfill({ json: {
    sessionId: "f6200000-0000-0000-0000-000000000001", seasonId: "f6300000-0000-0000-0000-000000000001", seasonKey: "2026-10",
    scenarioVersionId: "f6400000-0000-0000-0000-000000000001", scenarioVersion: competitiveFixture.version,
    simulationSeed: "audio-fixture", presentationSeed: "audio-fixture", perspectiveRole: "worker", startedAt: new Date().toISOString(), scenario: competitiveFixture,
  } }));
  await expect.poll(async () => (await played(page)).filter(p => p.includes("operation_base"))).toHaveLength(1);
  await page.evaluate(() => {
    history.pushState({}, "", "/play/e2e_competitive");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect.poll(async () => (await played(page)).filter(p => p.includes("operation_base"))).toHaveLength(2);
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ }).click();
  await page.getByRole("button", { name: "선택 확정", exact: true }).click();
  await expect(page.getByRole("button", { name: "결과 돌아보기", exact: true })).toBeVisible();
  await expect.poll(async () => (await played(page)).filter(p => p.includes("review_reflective"))).toHaveLength(1);
  expect(page.url()).toContain("/play/e2e_competitive");
});

for (const [ending, stinger] of [
  ["safe_stop", "stinger_safe_stop"], ["near_miss", "stinger_near_miss"], ["event", "stinger_event"],
] as const) {
  test(`registered ${ending} stinger and review BGM play once and stop on leaving ending`, async ({ page }) => {
    await fixture(page, true, true);
    await expect.poll(async () => (await played(page)).filter(p => p.includes("operation_base"))).toHaveLength(1);
    const scenario = structuredClone(competitiveFixture);
    for (const node of Object.values(scenario.nodes)) {
      if (node.type === "ending" && "ending" in node) node.ending = ending;
    }
    await page.route("**/functions/v1/start-session", route => route.fulfill({ json: {
      sessionId: "f6200000-0000-0000-0000-000000000001", seasonId: "f6300000-0000-0000-0000-000000000001", seasonKey: "2026-10",
      scenarioVersionId: "f6400000-0000-0000-0000-000000000001", scenarioVersion: scenario.version,
      simulationSeed: "audio-fixture", presentationSeed: "audio-fixture", perspectiveRole: "worker", startedAt: new Date().toISOString(), scenario,
    } }));
    await page.evaluate(() => {
      history.pushState({}, "", "/play/e2e_competitive");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await page.getByRole("button", { name: "계속", exact: true }).click();
    await page.getByRole("radio", { name: /절차와 표식을 다시 대조한다/ }).click();
    await page.getByRole("button", { name: "선택 확정", exact: true }).click();
    await expect(page.getByRole("button", { name: "결과 돌아보기", exact: true })).toBeVisible();
    await expect.poll(async () => (await played(page)).filter(p => p.includes(stinger))).toHaveLength(1);
    await expect.poll(async () => (await played(page)).filter(p => p.includes("review_reflective"))).toHaveLength(1);
    expect((await played(page)).some(p => p.includes("stamp_result"))).toBe(false);
    await page.getByRole("button", { name: "결과 돌아보기", exact: true }).click();
    await expect.poll(() => page.evaluate(stinger => (window as unknown as { audioVoices: Array<{ path: string; audio: HTMLAudioElement }> }).audioVoices.filter(v => v.path.includes(stinger)).every(v => v.audio.paused && v.audio.getAttribute("src") === ""), stinger)).toBe(true);
    await page.getByRole("radio").first().click();
    await page.getByRole("button", { name: "내 생각 확인", exact: true }).click();
    expect((await played(page)).filter(p => p.includes("review_reflective"))).toHaveLength(1);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => (window as unknown as { audioVoices: Array<{ path: string; audio: HTMLAudioElement }> }).audioVoices.filter(v => v.path.includes("review_reflective")).every(v => v.audio.paused && v.audio.getAttribute("src") === ""))).toBe(true);
  });
}
