import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";


async function expectWcag22Aa(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22a",
      "wcag22aa",
    ])
    .analyze();

  expect(
    results.violations,
    `${label}: WCAG 2.2 A/AA violations\n${JSON.stringify(
      results.violations,
      null,
      2,
    )}`,
  ).toEqual([]);
}

async function expectNoHorizontalOverflowAt200Percent(
  page: Page,
  label: string,
) {
  const original = await page.evaluate(
    () => document.documentElement.style.fontSize,
  );

  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
  }));

  expect(
    metrics.scroll,
    `${label}: horizontal overflow at 200% text size (${metrics.scroll}px > ${metrics.viewport}px)`,
  ).toBeLessThanOrEqual(metrics.viewport + 1);

  await page.evaluate((fontSize) => {
    document.documentElement.style.fontSize = fontSize;
  }, original);
}

const identities = {
  "mobile-390x844": {
    email: "hero-e2e-a@example.test",
    passwordEnv: "HERO_E2E_PASSWORD_A",
    token: "hero-e2e-invite-token-mobile-a-2026",
    inviteeName: "E2E Player A",
    nickname: "E2EHERO1",
  },
  "mobile-360x800": {
    email: "hero-e2e-b@example.test",
    passwordEnv: "HERO_E2E_PASSWORD_B",
    token: "hero-e2e-invite-token-mobile-b-2026",
    inviteeName: "E2E Player B",
    nickname: "E2EHERO2",
  },
} as const;

const uninvitedIdentities = {
  "mobile-390x844": {
    email: "hero-e2e-uninvited-a@example.test",
    passwordEnv: "HERO_E2E_PASSWORD_A",
  },
  "mobile-360x800": {
    email: "hero-e2e-uninvited-b@example.test",
    passwordEnv: "HERO_E2E_PASSWORD_B",
  },
} as const;

const adminManagerIdentities = {
  "mobile-390x844": {
    adminEmail: "hero-e2e-admin-a@example.test",
    adminPasswordEnv: "HERO_E2E_PASSWORD_MANAGER",
    candidateEmail: "hero-e2e-manager-candidate-a@example.test",
    candidatePasswordEnv: "HERO_E2E_PASSWORD_A",
    candidateName: "E2E Manager Candidate A",
    nickname: "E2ELEAD1",
    playerEmail: "hero-e2e-player-candidate-a@example.test",
    playerPasswordEnv: "HERO_E2E_PASSWORD_A",
    playerName: "E2E Invited Player A",
    playerNickname: "E2ETEAM1",
  },
  "mobile-360x800": {
    adminEmail: "hero-e2e-admin-b@example.test",
    adminPasswordEnv: "HERO_E2E_PASSWORD_MANAGER",
    candidateEmail: "hero-e2e-manager-candidate-b@example.test",
    candidatePasswordEnv: "HERO_E2E_PASSWORD_B",
    candidateName: "E2E Manager Candidate B",
    nickname: "E2ELEAD2",
    playerEmail: "hero-e2e-player-candidate-b@example.test",
    playerPasswordEnv: "HERO_E2E_PASSWORD_B",
    playerName: "E2E Invited Player B",
    playerNickname: "E2ETEAM2",
  },
} as const;

test("admin creates manager invitation and invitee accepts it", async ({
  page,
}, testInfo) => {
  test.setTimeout(75_000);

  const identity =
    adminManagerIdentities[
      testInfo.project.name as keyof typeof adminManagerIdentities
    ];

  if (!identity) {
    throw new Error(`unknown_e2e_project:${testInfo.project.name}`);
  }

  const adminPassword = process.env[identity.adminPasswordEnv];
  const candidatePassword = process.env[identity.candidatePasswordEnv];
  const playerPassword = process.env[identity.playerPasswordEnv];

  if (!adminPassword || !candidatePassword || !playerPassword) {
    throw new Error("missing_e2e_invitation_chain_password");
  }

  await page.goto("/login");
  await page.evaluate(
    ({ email, password }) => {
      window.sessionStorage.setItem("hero:e2e-email", email);
      window.sessionStorage.setItem("hero:e2e-password", password);
    },
    { email: identity.adminEmail, password: adminPassword },
  );

  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "조직 관리" }),
  ).toBeVisible();

  await page.getByLabel("발전소").selectOption({ label: /E2E 발전소/ });
  await page.getByLabel("담당자 이름").fill(identity.candidateName);
  await page
    .getByRole("button", { name: "담당자 초대 링크 생성" })
    .click();

  const inviteCode = page.locator(".invite-result-box code");
  await expect(inviteCode).toContainText("/i/");
  const inviteUrl = (await inviteCode.textContent())?.trim();

  if (!inviteUrl) {
    throw new Error("manager_invite_url_missing");
  }

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto(inviteUrl);
  await expect(
    page.getByRole("heading", {
      name: `${identity.candidateName} 님, 초대되었습니다`,
    }),
  ).toBeVisible();

  await page.evaluate(
    ({ email, password }) => {
      window.sessionStorage.setItem("hero:e2e-email", email);
      window.sessionStorage.setItem("hero:e2e-password", password);
    },
    { email: identity.candidateEmail, password: candidatePassword },
  );

  await page.getByRole("button", { name: "카카오로 시작하기" }).click();

  const nickname = page.locator('input[placeholder^="2~12자"]');
  await expect(nickname).toBeVisible();
  await nickname.fill(identity.nickname);
  await expect(
    page.getByText("사용 가능한 닉네임입니다."),
  ).toBeVisible();

  const checkboxes = page.getByRole("checkbox");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await page
    .getByRole("button", { name: "초대 수락하고 시작하기" })
    .click();

  await expect(page).toHaveURL("/");
  await page.goto("/manager");
  await expect(
    page.getByRole("heading", { name: "발전소 참여 현황" }),
  ).toBeVisible();

  await page.getByLabel("이름").fill(identity.playerName);
  await page.getByLabel("직무").selectOption("worker");
  await page.getByLabel("팀/조").fill("E2E Team");
  await page.getByRole("button", { name: "초대 링크 생성" }).click();

  const playerInviteCode = page.locator(".invite-result-box code");
  await expect(playerInviteCode).toContainText("/i/");
  const playerInviteUrl = (await playerInviteCode.textContent())?.trim();

  if (!playerInviteUrl) {
    throw new Error("player_invite_url_missing");
  }

  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  await page.goto(playerInviteUrl);
  await expect(
    page.getByRole("heading", {
      name: `${identity.playerName} 님, 초대되었습니다`,
    }),
  ).toBeVisible();

  await page.evaluate(
    ({ email, password }) => {
      window.sessionStorage.setItem("hero:e2e-email", email);
      window.sessionStorage.setItem("hero:e2e-password", password);
    },
    { email: identity.playerEmail, password: playerPassword },
  );

  await page.getByRole("button", { name: "카카오로 시작하기" }).click();

  const playerNickname = page.locator('input[placeholder^="2~12자"]');
  await expect(playerNickname).toBeVisible();
  await playerNickname.fill(identity.playerNickname);
  await expect(
    page.getByText("사용 가능한 닉네임입니다."),
  ).toBeVisible();

  const playerCheckboxes = page.getByRole("checkbox");
  await playerCheckboxes.nth(0).check();
  await playerCheckboxes.nth(1).check();

  await page
    .getByRole("button", { name: "초대 수락하고 시작하기" })
    .click();

  await expect(page).toHaveURL("/");
  await page.goto("/leaderboard");
  await expect(
    page.getByRole("heading", { name: "리더보드" }),
  ).toBeVisible();
});

test("plain login without invitation is rejected", async ({
  page,
}, testInfo) => {
  const identity =
    uninvitedIdentities[
      testInfo.project.name as keyof typeof uninvitedIdentities
    ];

  if (!identity) {
    throw new Error(`unknown_e2e_project:${testInfo.project.name}`);
  }

  const password = process.env[identity.passwordEnv];
  if (!password) {
    throw new Error(`missing_e2e_password:${identity.passwordEnv}`);
  }

  await page.addInitScript(
    ({ email, password: runtimePassword }) => {
      window.sessionStorage.setItem("hero:e2e-email", email);
      window.sessionStorage.setItem("hero:e2e-password", runtimePassword);
    },
    { email: identity.email, password },
  );

  await page.goto("/login");

  await expect(
    page.getByText(/처음 이용하는 사용자는 HERO 담당자가 발급한 초대 링크/),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "카카오로 시작하기" })
    .click();

  await expect(page).toHaveURL(/\/login\?reason=invite_required$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByText("HERO 이용을 시작하려면 유효한 초대 링크가 필요합니다."),
  ).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
});

test("invitation → play → replay offline queue → leaderboard", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const identity =
    identities[testInfo.project.name as keyof typeof identities];

  if (!identity) {
    throw new Error(`unknown_e2e_project:${testInfo.project.name}`);
  }

  const password = process.env[identity.passwordEnv];
  if (!password) {
    throw new Error(`missing_e2e_password:${identity.passwordEnv}`);
  }

  await page.addInitScript(
    ({ email, password: runtimePassword }) => {
      window.sessionStorage.setItem("hero:e2e-email", email);
      window.sessionStorage.setItem("hero:e2e-password", runtimePassword);
    },
    { email: identity.email, password },
  );

  await page.goto(`/i/${identity.token}`);

  await expect(
    page.getByRole("heading", {
      name: `${identity.inviteeName} 님, 초대되었습니다`,
    }),
  ).toBeVisible();

  await expect(page.locator("#hero-main-content")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toHaveCSS("min-height", "44px");
  await expectWcag22Aa(page, "invitation");

  await page
    .getByRole("button", { name: "카카오로 시작하기" })
    .click();

  const nickname = page.locator('input[placeholder^="2~12자"]');
  await expect(nickname).toBeVisible();
  await nickname.fill(identity.nickname);

  await expect(
    page.getByText("사용 가능한 닉네임입니다."),
  ).toBeVisible();
  await expectWcag22Aa(page, "onboarding");

  const checkboxes = page.getByRole("checkbox");
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();

  await page
    .getByRole("button", { name: "초대 수락하고 시작하기" })
    .click();

  await expect(page).toHaveURL("/");
  await expect(
    page.getByText("E2E 안전 확인 시나리오", { exact: true }),
  ).toBeVisible();
  await expectWcag22Aa(page, "campaign");
  await expectNoHorizontalOverflowAt200Percent(page, "campaign");

  const chapterLink = page
    .locator("a.chapter-link")
    .filter({ hasText: "E2E 안전 확인 시나리오" });
  await expect(chapterLink).toHaveCount(1);
  await chapterLink.click();

  await expect(
    page.getByRole("heading", { name: /E2E 안전 확인 시나리오/ }),
  ).toBeVisible();
  await expectWcag22Aa(page, "chapter briefing");

  await expect(
    page.getByRole("button", { name: "무음으로 시작" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "무음으로 시작" }).click();

  await page
    .getByRole("button", { name: /출발|이어하기/ })
    .click();

  const dialogue = page.getByRole("button", {
    name: /현장에 도착했습니다/,
  });
  await expect(dialogue).toBeVisible();
  await dialogue.click();

  const continueButton = page.getByRole("button", { name: "계속" });
  await expect(continueButton).toBeVisible();
  await continueButton.click();

  const safeChoice = page.getByRole("radio", {
    name: /절차와 표식을 다시 대조한다/,
  });
  await expect(safeChoice).toBeVisible();
  await expectWcag22Aa(page, "decision screen");
  await safeChoice.click();
  await expect(safeChoice).toHaveAttribute("aria-checked", "true");
  await safeChoice.click();

  await expect(
    page.getByRole("heading", { name: "확인 후 진행" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "결과 돌아보기" })
    .click();

  await page
    .getByRole("radio", { name: /상황이 시작되기 전부터/ })
    .click();
  await page
    .getByRole("button", { name: "내 생각 확인" })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "방어막은 한 번에 무너지지 않습니다",
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "HP 리뷰 보기" })
    .click();

  await expect(
    page.getByText("서버 검증 완료 · 시즌 기록에 반영되었습니다."),
  ).toBeVisible({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { name: /\d+ HP/ }),
  ).toBeVisible();
  await expectWcag22Aa(page, "HP review");

  const replayButton = page.getByRole("button", {
    name: /작업 대상을 확신하기 어려운 상황입니다/,
  });
  await expect(replayButton).toBeVisible();
  await replayButton.click();

  const replayChoice = page.getByRole("radio", {
    name: /동료에게 함께 확인해 달라고 요청한다/,
  });
  await expect(replayChoice).toBeVisible();
  await expect(page.getByText(/리플레이/, { exact: false })).toBeVisible();

  await page.context().setOffline(true);

  await replayChoice.click();
  await expect(replayChoice).toHaveAttribute("aria-checked", "true");
  await replayChoice.click();

  await expect(
    page.getByRole("heading", { name: "확인 후 진행" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "결과 돌아보기" })
    .click();

  await page
    .getByRole("radio", { name: /상황이 시작되기 전부터/ })
    .click();
  await page
    .getByRole("button", { name: "내 생각 확인" })
    .click();

  await page
    .getByRole("button", { name: "HP 리뷰 보기" })
    .click();

  await expect(
    page.getByText(/제출 대기 중/),
  ).toBeVisible({ timeout: 10_000 });

  await page.context().setOffline(false);

  await expect(
    page.getByText("서버 검증 완료 · 시즌 기록에 반영되었습니다."),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "캠페인으로" }).click();
  await page.getByRole("link", { name: "리더보드" }).click();

  await expect(
    page.getByRole("heading", { name: "리더보드" }),
  ).toBeVisible();
  await expectWcag22Aa(page, "leaderboard");
  await expect(page.getByText(identity.nickname, { exact: true })).toBeVisible();
  await expect(page.getByText(identity.inviteeName, { exact: true })).toHaveCount(
    0,
  );
});
