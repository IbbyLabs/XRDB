import { test, expect, type Page } from '@playwright/test';

// Neither a phone nor the 340px controls column fits five tabs on one line.
// The row used to be clipped by its container, which left the last tab
// unreachable rather than merely off-screen.
//
// Note: an `overflow: hidden` box is still scrollable programmatically, so
// Playwright's auto-scroll happily reaches a tab a finger never could. These
// tests assert position before clicking, and never scroll the row first.
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

async function expectEveryTabUsable(page: Page, names: string[]) {
  const row = page.locator('.tabs').first();
  await expect(row).toBeVisible();

  for (const name of names) {
    const tab = page.getByRole('tab', { name: new RegExp(name, 'i') });
    const onScreen = await tab.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.right <= document.documentElement.clientWidth + 1;
    });
    expect(onScreen, `${name} tab should be fully on screen without scrolling`).toBe(true);

    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  // the row wraps rather than hiding tabs behind a scroll
  expect(await row.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
}

const ADMIN_TABS = ['Metrics', 'Cache', 'Logs', 'Runtime', 'Warm'];
const CONFIG_TABS = ['Display', 'Ratings', 'Advanced', 'Profile', 'Install'];

for (const [label, size] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
  test(`every admin tab is usable on ${label}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/admin');
    await expectEveryTabUsable(page, ADMIN_TABS);
  });

  test(`every configurator tab is usable on ${label}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/configurator');
    await expectEveryTabUsable(page, CONFIG_TABS);
  });
}

test('per-surface and whole-config tabs hold separate rows', async ({ page }) => {
  // 768px matters most: all five tabs fit on one line there, so the split
  // only holds if it's forced rather than a lucky wrap.
  for (const size of [PHONE, { width: 768, height: 900 }, DESKTOP]) {
    await page.setViewportSize(size);
    await page.goto('/configurator');

    const rows = await page.locator('.tabs').first().evaluate(el => {
      const tabs = [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
      const tops = tabs.map(t => Math.round(t.getBoundingClientRect().top));
      return [...new Set(tops)].map(top =>
        tabs.filter((_, i) => tops[i] === top).map(t => t.textContent?.trim()));
    });

    expect(rows, `grouping should hold at ${size.width}px`).toEqual([
      ['Display', 'Ratings', 'Advanced'],
      ['Profile', 'Install'],
    ]);
  }
});

test('advanced styling lives on its own tab', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await page.goto('/configurator');

  await page.getByRole('tab', { name: /advanced/i }).click();
  const panel = page.locator('#\\:r0\\:-panel-advanced, [id$="panel-advanced"]');
  await expect(panel).toBeVisible();
  // the eight per-badge sections, previously buried in a collapsed disclosure
  await expect(panel.locator('.adv-section')).toHaveCount(8);
  await expect(page.locator('.adv-details > summary')
    .filter({ hasText: /^Advanced styling$/ })).toHaveCount(0);
});
