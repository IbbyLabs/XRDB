import { test, expect } from '@playwright/test';

// Without a saved profile there is no config key, so an install URL would come
// out as /stremio/c//manifest.json and resolve to nothing. The whole section
// stays hidden until there is something to install.
//
// The populated case needs a live API to save and load a profile, which this
// harness does not run; it is covered by the Go tests over the /stremio/c/
// routes in internal/server/stremio_test.go.
test('the Stremio install section is hidden until a profile is saved', async ({ page }) => {
  await page.goto('/configurator');
  await page.getByRole('tab', { name: /install/i }).click();

  await expect(page.getByText(/save a profile first/i)).toBeVisible();
  await expect(page.locator('code', { hasText: '/stremio/c/' })).toHaveCount(0);
});
