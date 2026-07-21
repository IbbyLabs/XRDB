import { test, expect } from '@playwright/test';

// Dev builds stamp a long `channel.date.time.sha` version into the nav badge,
// which is what pushed the bar past the viewport on phones.
const LONG_VERSION = 'dev.20260714.0056.0da1218';

const PHONE_WIDTHS = [320, 375, 390, 430];
const PAGES = ['/', '/configurator', '/integrations', '/help', '/admin'];

test.describe('nav bar fits narrow viewports', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/healthz', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: LONG_VERSION }),
      }));
  });

  for (const width of PHONE_WIDTHS) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.locator('.nav-badge, .nav-logo').first()).toBeVisible();
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, `${path} overflows at ${width}px`).toBeLessThanOrEqual(clientWidth + 1);
      }
    });
  }

  test('version badge stays legible instead of clipping', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.nav-badge-short')).toHaveText('vdev·0da1218');
    await expect(page.locator('.nav-badge-full')).toBeHidden();
    const clipped = await page.locator('.nav-badge')
      .evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
  });

  test('desktop keeps the wordmark and the full version', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.locator('.nav-word')).toBeVisible();
    await expect(page.locator('.nav-badge-full')).toHaveText(`v${LONG_VERSION}`);
    await expect(page.locator('.nav-badge-short')).toBeHidden();
  });
});
