import { test, expect, type Page } from '@playwright/test';

// "Share this look" packs the whole configurator state into a link and copies
// it. Two things have to hold: the copy has to succeed on the origins people
// actually self-host on, and the link has to rebuild the look it captured.

/**
 * The page is a static export, so controls are inert until React hydrates and a
 * click landing in that window is dropped. The preview URL is computed after
 * mount, so its arrival is a real signal rather than an arbitrary sleep.
 */
async function gotoConfigurator(page: Page) {
  await page.goto('/configurator');
  await expect(page.locator('.urlbar')).toBeVisible();
}

const genreToggle = (page: Page) => page.getByRole('switch', { name: /toggle genre badge/i });
const shareButton = (page: Page) => page.getByRole('button', { name: /share this look/i });

test('sharing works without the async clipboard API', async ({ page }) => {
  // navigator.clipboard only exists on secure origins. A self-hosted instance
  // reached over plain http on a LAN address has no such thing, which is the
  // normal way this app is run, so the copy has to survive its absence.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });
  await gotoConfigurator(page);

  await shareButton(page).click();

  await expect(page.locator('.notice')).toHaveText(/share link copied/i);
});

test('the copy is acknowledged where the click happened', async ({ page }) => {
  await gotoConfigurator(page);

  // The notice renders at the top of the page and this button sits well below
  // it, so a confirmation that only appears up there is one nobody sees.
  const btn = shareButton(page);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();

  const copied = page.getByRole('button', { name: /link copied/i });
  await expect(copied).toBeVisible();
  await expect(copied).toBeInViewport();
});

test('the shared link rebuilds the look for someone else', async ({ page, context, browser }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await gotoConfigurator(page);

  // A setting that is off by default, so seeing it on can only have come from
  // the link rather than from a default or a leftover session.
  await genreToggle(page).click();
  await expect(genreToggle(page)).toHaveAttribute('aria-checked', 'true');

  await shareButton(page).click();
  await expect(page.locator('.notice')).toHaveText(/share link copied/i);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain('#c=');

  // A fresh context has no sessionStorage, so the recipient starts from
  // defaults and only the link can turn the genre badge on.
  const recipient = await browser.newContext();
  const theirPage = await recipient.newPage();
  await theirPage.goto(link);
  await expect(theirPage.locator('.urlbar')).toBeVisible();

  await expect(genreToggle(theirPage)).toHaveAttribute('aria-checked', 'true');
  await recipient.close();
});
