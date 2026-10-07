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

test("invitation → mocked Kakao → play → result → leaderboard", async ({
  page,
}, testInfo) => {
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
