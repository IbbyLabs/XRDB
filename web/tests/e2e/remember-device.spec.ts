import { test, expect } from '@playwright/test';

// FR-215: the instance key survives a closed browser only when the user opts in.
test('the instance key is remembered on this device only when switched on', async ({ page, context }) => {
  await page.goto('/configurator');
  await page.getByRole('tab', { name: /install/i }).click();

  const toggle = page.getByRole('switch', { name: /remember on this device/i });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await page.getByLabel('Instance API key').fill('test-instance-key');
  expect(await page.evaluate(() => localStorage.getItem('xrdb-render-key'))).toBeNull();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => localStorage.getItem('xrdb-render-key'))).toBe('test-instance-key');

  // A fresh tab has an empty sessionStorage, which is what a closed browser leaves.
  const fresh = await context.newPage();
  await fresh.goto('/configurator');
  await fresh.getByRole('tab', { name: /install/i }).click();
  await expect(fresh.getByLabel('Instance API key')).toHaveValue('test-instance-key');

  await fresh.getByRole('switch', { name: /remember on this device/i }).click();
  expect(await fresh.evaluate(() => localStorage.getItem('xrdb-render-key'))).toBeNull();
  expect(await fresh.evaluate(() => localStorage.getItem('xrdb-remember'))).toBeNull();
});
