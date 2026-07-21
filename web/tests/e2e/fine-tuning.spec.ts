import { test, expect, type Page } from '@playwright/test';

// Every badge's fine controls (scale, offset, colour) sit directly under that
// badge rather than in a separate destination, so one badge is configured in
// one place. A single switch reveals them all.
const DESKTOP = { width: 1280, height: 900 };

/** The genre badge is off by default; its controls only exist once it's on. */
async function enableGenreBadge(page: Page) {
  const toggle = page.getByRole('switch', { name: /toggle genre badge/i });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

/** Visible field labels inside the Display panel, in DOM order. */
function labelOrder(page: Page) {
  return page.locator('[id$="panel-display"]').evaluate(el =>
    [...el.querySelectorAll('.label')].map(n => n.textContent?.trim() ?? ''));
}

/**
 * The page ships as a static export, so every control is inert until React
 * hydrates and attaches its handlers — a click that lands in that window is
 * silently dropped. The preview URL is computed after mount, so its arrival is
 * a genuine signal that the page is live rather than an arbitrary sleep.
 */
async function gotoConfigurator(page: Page) {
  await page.goto('/configurator');
  await expect(page.locator('.urlbar')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  await gotoConfigurator(page);
});

test('fine tuning is off until asked for', async ({ page }) => {
  await enableGenreBadge(page);

  const fine = page.getByRole('switch', { name: /toggle fine tuning/i });
  await expect(fine).toHaveAttribute('aria-checked', 'false');

  // the genre badge shows only its common controls
  let labels = await labelOrder(page);
  expect(labels).toContain('Genre position');
  expect(labels).not.toContain('Background opacity (%)');

  await fine.click();
  await expect(fine).toHaveAttribute('aria-checked', 'true');

  labels = await labelOrder(page);
  expect(labels).toContain('Background opacity (%)');
});

test('a badge is configured in one place', async ({ page }) => {
  await enableGenreBadge(page);
  await page.getByRole('switch', { name: /toggle fine tuning/i }).click();

  const labels = await labelOrder(page);
  const genre = labels.indexOf('Genre position');
  const nextBadge = labels.indexOf('Where to watch');
  // the first Scale after the genre controls start is the genre one; the
  // quality badge has its own further down the panel
  const genreScale = labels.indexOf('Scale (%)', genre);

  expect(genre, 'genre badge should be on').toBeGreaterThan(-1);
  expect(nextBadge, 'a later control is needed to bound the genre group').toBeGreaterThan(genre);
  // This is the whole point of the layout: the genre badge's fine controls sit
  // between the genre badge and the next control, not in a bucket elsewhere.
  expect(genreScale).toBeGreaterThan(genre);
  expect(genreScale).toBeLessThan(nextBadge);
});

test('the fine tuning preference outlives a reload', async ({ page }) => {
  const fine = page.getByRole('switch', { name: /toggle fine tuning/i });
  await fine.click();
  await expect(fine).toHaveAttribute('aria-checked', 'true');

  await page.reload();
  await expect(page.locator('.urlbar')).toBeVisible();
  await expect(page.getByRole('switch', { name: /toggle fine tuning/i }))
    .toHaveAttribute('aria-checked', 'true');
});

test('there is no separate advanced destination', async ({ page }) => {
  await expect(page.getByRole('tab', { name: /advanced/i })).toHaveCount(0);
});

test('the revealed controls fit a phone', async ({ page }) => {
  // Each group is indented under its badge, which costs horizontal room the
  // narrowest viewport has none of.
  await page.setViewportSize({ width: 390, height: 844 });
  await enableGenreBadge(page);
  await page.getByRole('switch', { name: /toggle fine tuning/i }).click();
  await expect(page.locator('.fine-group').first()).toBeVisible();

  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
});
