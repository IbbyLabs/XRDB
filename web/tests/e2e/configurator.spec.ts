import { test, expect } from '@playwright/test';

test('configurator page loads with media type tabs and title search', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByRole('heading', { name: /configurator/i })).toBeVisible();
  await expect(page.getByLabel(/find a title/i)).toBeVisible();
});

test('configurator shows preview section', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByText(/preview/i).first()).toBeVisible();
});

test('configurator has media type tabs', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByRole('tab', { name: /poster/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /backdrop/i })).toBeVisible();
});

test('direct ID entry selects the title', async ({ page }) => {
  await page.goto('/configurator');
  const input = page.getByLabel(/find a title/i);
  await input.fill('tt0816692');
  await input.press('Enter');
  await expect(page.locator('.media-current-title')).toHaveText('tt0816692');
});

test('configurator profile tab is present', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByRole('tab', { name: /profile/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /install/i })).toBeVisible();
});

test('configurator persists selected media across reload', async ({ page }) => {
  await page.goto('/configurator');
  const input = page.getByLabel(/find a title/i);
  await input.fill('tt1234567');
  await input.press('Enter');
  await page.reload();
  await expect(page.locator('.media-current-title')).toHaveText('tt1234567');
});
