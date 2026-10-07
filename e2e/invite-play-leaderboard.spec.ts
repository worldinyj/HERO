import { expect, test } from "@playwright/test";

const identities = {
  "mobile-390x844": {
    email: "hero-e2e-a@example.test",
    password: "HeroE2E!2026A",
    token: "hero-e2e-invite-token-mobile-a-2026",
    inviteeName: "E2E Player A",
    nickname: "E2EHERO1",
  },
  "mobile-360x800": {
    email: "hero-e2e-b@example.test",
    password: "HeroE2E!2026B",
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

  await page.addInitScript(
    ({ email, password }) => {
      window.sessionStorage.setItem("hero:e2e-email", email);
      window.sessionStorage.setItem("hero:e2e-password", password);
    },
    { email: identity.email, password: identity.password },
  );

  await page.goto(`/i/${identity.token}`);

  await expect(
    page.getByRole("heading", {
      name: `${identity.inviteeName} 님, 초대되었습니다`,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "카카오로 시작하기" })
    .click();

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
  await expect(
    page.getByText("E2E 안전 확인 시나리오", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: /E2E 안전 확인 시나리오/ })
    .click();

  await expect(
    page.getByRole("heading", { name: /E2E 안전 확인 시나리오/ }),
  ).toBeVisible();

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

  await page.getByRole("link", { name: "캠페인으로" }).click();
  await page.getByRole("link", { name: "리더보드" }).click();

  await expect(
    page.getByRole("heading", { name: "리더보드" }),
  ).toBeVisible();
  await expect(page.getByText(identity.nickname, { exact: true })).toBeVisible();
  await expect(page.getByText(identity.inviteeName, { exact: true })).toHaveCount(
    0,
  );
});
