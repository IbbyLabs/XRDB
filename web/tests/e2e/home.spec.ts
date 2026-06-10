import { test, expect } from '@playwright/test';

test('home page loads with hero and navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('XRDB');
  await expect(page.getByRole('link', { name: /open configurator/i })).toBeVisible();
});

test('home page shows the long product name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Xtended Ratings DataBase')).toBeVisible();
});

test('home page CTA navigates to configurator', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /open configurator/i }).click();
  await expect(page).toHaveURL('/configurator');
});

test('nav admin link navigates to admin', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: /admin/i }).click();
  await expect(page).toHaveURL('/admin');
});
