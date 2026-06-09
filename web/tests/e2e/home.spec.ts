import { test, expect } from '@playwright/test';

test('home page loads with hero and navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('XRDB');
  await expect(page.getByRole('link', { name: /open configurator/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /admin panel/i })).toBeVisible();
});

test('home page has capability stats', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Render pipeline')).toBeVisible();
  await expect(page.getByText('Profile storage')).toBeVisible();
});

test('home page CTA navigates to configurator', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /open configurator/i }).click();
  await expect(page).toHaveURL('/configurator');
});

test('home page admin link navigates to admin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /admin panel/i }).click();
  await expect(page).toHaveURL('/admin');
});
