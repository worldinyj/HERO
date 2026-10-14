import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Installation UI is public and independent of external login providers.
test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

for (const platform of ['Win32', 'MacIntel']) {
test(`install guide downloads a safe ${platform} shortcut and works by keyboard`, async ({ page }) => {
  await page.addInitScript(platform => Object.defineProperty(navigator, 'platform', { value: platform }), platform);
  await page.goto('/login?next=%2Fadmin&token=private-test-value');
  const opener = page.getByRole('button', { name: '설치 안내', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'HERO를 아이콘으로 열기' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: '컴퓨터', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '바탕화면 바로가기 파일 저장' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(platform === 'MacIntel' ? 'HERO.webloc' : 'HERO.url');
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const contents = Buffer.concat(chunks).toString();
  expect(contents).toContain(platform === 'MacIntel' ? '<string>http://127.0.0.1:4173/</string>' : 'URL=http://127.0.0.1:4173/\r\n');
  expect(contents).not.toContain('private-test-value');
  await page.getByRole('button', { name: 'iPhone·iPad', exact: true }).click();
  await expect(dialog).toContainText('공유 메뉴 → 홈 화면에 추가');
  await page.getByRole('button', { name: 'Android', exact: true }).click();
  await expect(dialog).toContainText('Chrome 또는 Samsung Internet');
  expect((await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await opener.click();
  const bounds = await dialog.boundingBox();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - 640)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(opener).toBeFocused();
});
}

for (const outcome of ['accepted', 'dismissed', 'error'] as const) {
  test(`native installation handles ${outcome} without claiming unconfirmed installation`, async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: '설치 안내', exact: true })).toBeVisible();
    await page.evaluate(outcome => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, { prompt: async () => { if (outcome === 'error') throw new Error('test unavailable'); }, userChoice: Promise.resolve({ outcome }) });
      window.dispatchEvent(event);
    }, outcome);
    await page.getByRole('button', { name: '앱 설치', exact: true }).click();
    if (outcome === 'accepted') {
      await expect(page.getByRole('status')).toContainText('브라우저에서 설치를 마무리');
      await expect(page.getByRole('region', { name: 'HERO 앱 설치' })).toBeVisible();
      await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
      await expect(page.getByRole('region', { name: 'HERO 앱 설치' })).toHaveCount(0);
    } else if (outcome === 'dismissed') {
      await expect(page.getByRole('status')).toContainText('설치를 취소했습니다');
      await expect(page.getByRole('button', { name: '설치 안내', exact: true })).toBeEnabled();
    } else await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('standalone launch hides installation promotion', async ({ page }) => {
  await page.addInitScript(() => {
    const native = window.matchMedia.bind(window);
    window.matchMedia = query => query === '(display-mode: standalone)' ? { ...native(query), matches: true, addEventListener() {} } as MediaQueryList : native(query);
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '함께 확인하고, 함께 배웁니다.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'HERO 앱 설치' })).toHaveCount(0);
});

test('installation manifest provides PNG sizes and Apple home screen icon', async ({ page }) => {
  await page.goto('/login');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  for (const size of [192,512]) {
    const icon = manifest.icons.find((icon: {sizes: string}) => icon.sizes === `${size}x${size}`);
    expect(icon.type).toBe('image/png');
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href','/pwa-icon-180.png');
});
