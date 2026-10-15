import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function checkLayout(page: Page) {
  await expect(page.getByRole("heading", { name: "함께 확인하고, 함께 배웁니다." })).toBeVisible();
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "이용약관", exact: true })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "개인정보 처리방침", exact: true })).toHaveAttribute("href", "/privacy");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

for (const path of ["/login", "/login?reason=invite_required"]) {
  test(`Suri login keeps images, invitation guidance and keyboard access: ${path}`, async ({ page }, testInfo) => {
    const images: string[] = [];
    page.on("request", request => { if (request.url().includes("/images/")) images.push(request.url()); });
    await page.goto(path);
    await checkLayout(page);
    for (const selector of [".suri-illustration img", ".khnp-brand img"]) {
      await expect.poll(() => page.locator(selector).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    expect(images.some(url => /suri-(check|reflect)/.test(url))).toBe(false);
    if (path.includes("reason")) await expect(page.getByRole("status")).toContainText("유효한 초대 링크");
    const button = page.getByRole("button", { name: "카카오로 시작하기" });
    await button.focus(); await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "이용약관", exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath("suri-login.png"), fullPage: true });
    await page.getByRole("link", { name: "이용약관", exact: true }).click();
    await expect(page.getByRole("heading", { name: "HERO 이용약관", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "개인정보 처리방침", exact: true }).click();
    await expect(page.getByRole("heading", { name: "개인정보 처리방침", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "로그인으로", exact: true }).click();
    await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeEnabled();
  });
}

test("blocked images preserve login action and recover from login errors", async ({ page }) => {
  await page.route("**/images/**", route => route.abort());
  await page.goto("/login?reason=invite_required");
  await expect(page.locator(".suri-illustration img")).toBeHidden();
  await checkLayout(page);
  await page.getByRole("button", { name: "카카오로 시작하기" }).click();
  await expect(page.getByRole("alert")).toHaveText("E2E 테스트 계정이 설정되지 않았습니다.");
  await expect(page.getByRole("button", { name: "카카오로 시작하기" })).toBeEnabled();
});

test("desktop Suri login has no overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/login?reason=invite_required");
  await checkLayout(page);
  await expect.poll(() => page.locator(".suri-illustration img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("suri-login-desktop.png"), fullPage: true });
});
