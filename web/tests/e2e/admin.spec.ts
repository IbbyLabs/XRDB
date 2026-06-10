import { test, expect } from '@playwright/test';

test('admin page loads with metrics tab', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /metrics/i })).toBeVisible();
  await expect(page.getByRole('tab', { name: /cache/i })).toBeVisible();
});

test('admin page has refresh button', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible();
});

test('admin tab switching shows cache panel', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('tab', { name: /cache/i }).click();
  await expect(page.getByRole('tab', { name: /cache/i })).toHaveAttribute('aria-selected', 'true');
});
