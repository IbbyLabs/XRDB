import { test, expect, type Page } from '@playwright/test';

// A phone can't fit five tabs on one line. The row used to be clipped by an
// ancestor, which left the last tab unreachable rather than merely off-screen.
//
// Note: an `overflow: hidden` box is still scrollable programmatically, so
// Playwright's auto-scroll happily reaches a tab a finger never could. These
// tests scroll the row the way a user does and then assert the tab is really
// on screen before clicking it.
const PHONE = { width: 390, height: 844 };

async function pageOverflow(page: Page) {
  return page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function expectTabsReachable(page: Page, names: string[]) {
  const row = page.locator('.tabs').first();
  await expect(row).toBeVisible();

  for (const name of names) {
    const tab = page.getByRole('tab', { name: new RegExp(name, 'i') });

    // scroll the row itself, which is all a user can do
    await row.evaluate((el, label) => {
      const match = [...el.querySelectorAll<HTMLElement>('[role="tab"]')]
        .find(t => new RegExp(label, 'i').test(t.textContent || ''));
      if (match) el.scrollLeft = match.offsetLeft - 8;
    }, name);

    const onScreen = await tab.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.right <= document.documentElement.clientWidth + 1;
    });
    expect(onScreen, `${name} tab should be on screen after scrolling its row`).toBe(true);

    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
  expect(await pageOverflow(page)).toBeLessThanOrEqual(1);
}

test('every admin tab is reachable at phone width', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/admin');
  await expectTabsReachable(page, ['Metrics', 'Cache', 'Logs', 'Runtime', 'Warm']);
});

test('every configurator tab is reachable at phone width', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/configurator');
  await expectTabsReachable(page, ['Display', 'Ratings', 'Profile', 'Install']);
});

test('a tab row scrolls itself rather than the page', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto('/admin');

  const geo = await page.locator('.tabs').first().evaluate(el => ({
    overflowX: getComputedStyle(el).overflowX,
    verticalOverflow: el.scrollHeight - el.clientHeight,
  }));
  expect(geo.overflowX).toBe('auto');
  // the active-tab underline must not leave the row scrollable vertically
  expect(geo.verticalOverflow).toBe(0);
});
