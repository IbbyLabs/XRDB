import { test, expect } from '@playwright/test';

test('configurator page loads with media type and ID inputs', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByRole('heading', { name: /configurator/i })).toBeVisible();
  await expect(page.getByLabel(/media id/i)).toBeVisible();
});

test('configurator shows preview section', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByText(/preview/i).first()).toBeVisible();
});

test('configurator has media type tabs', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByRole('button', { name: /poster/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /backdrop/i })).toBeVisible();
});

test('configurator media ID input accepts text', async ({ page }) => {
  await page.goto('/configurator');
  const input = page.getByLabel(/media id/i);
  await input.fill('tt0816692');
  await expect(input).toHaveValue('tt0816692');
});

test('configurator profile card is present', async ({ page }) => {
  await page.goto('/configurator');
  await expect(page.getByText(/profile/i).first()).toBeVisible();
});

test('configurator persists media ID across reload', async ({ page }) => {
  await page.goto('/configurator');
  await page.getByLabel(/media id/i).fill('tt1234567');
  await page.reload();
  await expect(page.getByLabel(/media id/i)).toHaveValue('tt1234567');
});
