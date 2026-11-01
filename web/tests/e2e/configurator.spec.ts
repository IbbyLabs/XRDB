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

test('Nuvio crop preview lists the square episode list first and frames it', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.route(/\/(poster|backdrop|thumbnail)\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.goto('/configurator');
  await page.getByRole('tab', { name: /thumbnail/i }).click();
  const pick = page.getByLabel(/see it in nuvio/i);
  await expect(pick.locator('option').nth(1)).toHaveText(/episode list \(square\)/i);
  await pick.selectOption({ index: 1 });
  const card = page.getByTestId('nuvio-frame-card');
  const box = await card.boundingBox();
  expect(Math.abs((box?.width ?? 0) - (box?.height ?? 1))).toBeLessThan(2);
  await expect(page.getByText('Nuvio shows 56% of the width here.')).toBeVisible();
});
