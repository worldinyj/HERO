import { expect, test, type Page } from "@playwright/test";
import { heldAdminRead } from "./heldAdminRead";

const managerId = "fa100000-0000-0000-0000-000000000001";
const playerId = "fa100000-0000-0000-0000-000000000002";
const plantId = "fa100000-0000-0000-0000-000000000003";
const inviteId = "fa100000-0000-0000-0000-000000000004";
const rows = [{ profile_id: playerId, real_name: "검증 사용자", nickname: "CURRENT", job_role: "worker", team_name: null, is_active: true, completed_scenarios: 2, last_activity_at: null }];
const invites = [{ invitation_id: inviteId, invitee_name: "검증 초대", job_role: "worker", team_name: null, expires_at: "2027-01-01T00:00:00Z", created_at: "2026-10-01T00:00:00Z" }];

async function fixture(page: Page) {
  const state = { mode: "ok" as "ok" | "invalid" | "denied", failWrites: false, writes: [] as string[] };
  const user = { id: managerId, aud: "authenticated", role: "authenticated", email: "fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  await page.addInitScript(({ user }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp }))}.fixture`;
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: token, refresh_token: "fixture", expires_at: exp, expires_in: 3600, token_type: "bearer", user }));
  }, { user });
  await page.route(/\/(?:rest|auth|functions)\/v1\//, async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") throw Error("Manager fixture requires loopback Supabase");
    if (url.pathname === "/auth/v1/user") return route.fulfill({ json: user });
    if (url.pathname === "/rest/v1/profiles") return route.fulfill({ json: {
      id: managerId, plant_id: plantId, role: "plant_manager", real_name: "검증 담당자", nickname: "MANAGER", is_active: true, nickname_reset_required: false, job_role: null,
    } });
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.split("/").at(-1);
      if (!["manager_player_rows", "manager_pending_invites", "manager_job_aggregates"].includes(name!)) throw Error(`Unexpected RPC ${name}`);
      if (state.mode === "denied") return route.fulfill({ status: 403, json: { message: "denied" } });
      if (state.mode === "invalid") return route.fulfill({ json: null });
      return route.fulfill({ json: name === "manager_player_rows" ? rows : name === "manager_pending_invites" ? invites : [] });
    }
    if (url.pathname.startsWith("/functions/v1/")) {
      const action = route.request().postDataJSON()?.action ?? "create-invite";
      state.writes.push(action);
      if (state.failWrites) return route.fulfill({ status: 503, json: { error: "internal_error" } });
      if (action === "reissue-invite") return route.fulfill({ json: {
        reissued: true, oldInvitationId: inviteId, invitationId: "fa100000-0000-0000-0000-000000000005", inviteUrl: "http://127.0.0.1:4173/i/saved-fixture", expiresAt: "2027-01-01T00:00:00Z", plantDisplayName: "검증 사업소",
      } });
    }
    throw Error(`Unexpected request: ${url.pathname}`);
  });
  return state;
}

for (const mode of ["invalid", "denied"] as const) test(`${mode} reads are not shown as a verified zero and can be retried`, async ({ page }) => {
  const state = await fixture(page);
  state.mode = mode;
  await page.goto("/manager");
  await expect(page.getByRole("alert")).toContainText("참여 현황을 불러오지 못했습니다");
  await expect(page.locator(".manager-summary")).toHaveCount(0);
  await expect(page.getByText("아직 초대를 수락한 사용자가 없습니다.", { exact: true })).toHaveCount(0);
  state.mode = "ok";
  await page.getByRole("button", { name: "참여 현황 다시 조회", exact: true }).click();
  await expect(page.getByText("검증 사용자", { exact: true })).toBeVisible();
  await expect(page.locator(".manager-summary")).toBeVisible();
  expect(state.writes).toEqual([]);
});

for (const rpc of ["manager_player_rows", "manager_pending_invites", "manager_job_aggregates"]) test(`hung ${rpc} ends at the deadline and ignores late results`, async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page);
  const held = await heldAdminRead(page, url => url.pathname.endsWith(`/rpc/${rpc}`), { json: [] });
  try {
    await page.goto("/manager");
    await expect.poll(() => held.calls).toBeGreaterThan(0);
    await page.clock.runFor(15_001);
    await expect(page.getByRole("alert")).toContainText("응답이 지연되어 대기를 마쳤습니다");
    const refresh = page.getByRole("button", { name: "참여 현황 다시 조회", exact: true });
    await expect(refresh).toBeEnabled();
    await expect(page.locator(".manager-summary")).toHaveCount(0);
    held.holding = false;
    await refresh.click();
    await expect(page.getByText("검증 사용자", { exact: true })).toBeVisible();
    held.release();
    await expect(page.getByText("검증 초대", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(state.writes).toEqual([]);
  } finally { held.release(); }
});

test("an issued one-time link survives a failed background refresh", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/manager");
  await page.getByRole("button", { name: "새 링크", exact: true }).click();
  const link = page.locator("code").filter({ hasText: "/i/saved-fixture" });
  await expect(link).toBeVisible();
  await expect(page.getByRole("button", { name: "참여 현황 다시 조회", exact: true })).toBeEnabled();
  state.mode = "denied";
  await page.getByRole("button", { name: "참여 현황 다시 조회", exact: true }).click();
  await expect(page.getByText("현재 명단을 확인하지 못했습니다.", { exact: false })).toBeVisible();
  await expect(link).toBeVisible();
  await expect(page.getByText("검증 사용자", { exact: true })).toHaveCount(0);
  expect(state.writes).toEqual(["reissue-invite"]);
});

for (const kind of ["player", "nickname", "cancel"] as const) test(`${kind} confirmation cannot use an old successful read after a failed refresh`, async ({ page }) => {
  const state = await fixture(page);
  state.failWrites = true;
  await page.goto("/manager");
  const action = kind === "player" ? "비활성화" : kind === "nickname" ? "닉네임 초기화" : "취소";
  await page.getByRole("button", { name: action, exact: true }).click();
  const reconcile = page.getByRole("button", { name: kind === "player" ? "1. Player 명단 다시 조회" : kind === "nickname" ? "1. 닉네임 명단 다시 조회" : "1. 초대 명단 다시 조회", exact: true });
  await expect(reconcile).toBeEnabled();
  await reconcile.click();
  const confirm = page.getByRole("button", { name: kind === "player" ? "2. 활성 상태 확인 완료 · 잠금 해제" : "2. 결과 확인 완료 · 잠금 해제", exact: true });
  await expect(confirm).toBeEnabled();
  state.mode = "denied";
  await page.getByRole("button", { name: "참여 현황 다시 조회", exact: true }).click();
  await expect(confirm).toBeDisabled();
  state.mode = "ok";
  await page.getByRole("button", { name: "참여 현황 다시 조회", exact: true }).click();
  await expect(page.getByText("검증 사용자", { exact: true })).toBeVisible();
  await expect(confirm).toBeDisabled();
  await reconcile.click();
  await expect(confirm).toBeEnabled();
  expect(state.writes).toHaveLength(1);
});

test("single invite uncertainty cannot be unlocked while the current roster is unverified", async ({ page }) => {
  const state = await fixture(page);
  state.failWrites = true;
  await page.goto("/manager");
  await page.getByPlaceholder("예: 홍길동", { exact: true }).fill("검증 신규 사용자");
  await page.getByRole("button", { name: "초대 링크 생성", exact: true }).click();
  const reconcile = page.getByRole("button", { name: "1. 수락 대기 초대 다시 조회", exact: true });
  await reconcile.click();
  const confirm = page.getByRole("button", { name: "2. 결과 확인 · 새 요청 허용", exact: true });
  await expect(confirm).toBeEnabled();
  state.mode = "denied";
  await page.getByRole("button", { name: "참여 현황 다시 조회", exact: true }).click();
  await expect(confirm).toBeDisabled();
  await expect(page.getByRole("button", { name: "초대 링크 생성", exact: true })).toBeDisabled();
  expect(state.writes).toEqual(["create-invite"]);
});
