import { test, expect } from '@playwright/test';

const health = (body: Record<string, unknown>) => (route: { fulfill: (r: object) => Promise<void> }) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function openDisplayTab(page: import('@playwright/test').Page) {
  await page.goto('/configurator');
  await page.getByRole('tab', { name: /display/i }).click();
}

test('top rated is greyed with a reason when the instance reports it off', async ({ page }) => {
  await page.route('**/healthz', health({ status: 'ok', version: '3.114.0', features: { imdbTopRated: false } }));
  await openDisplayTab(page);
  await expect(page.getByRole('switch', { name: /top rated badge/i })).toBeDisabled();
  await expect(page.getByText(/not enabled on this instance/i)).toBeVisible();
});

test('top rated stays live when the instance reports it on', async ({ page }) => {
  await page.route('**/healthz', health({ status: 'ok', version: '3.114.0', features: { imdbTopRated: true } }));
  await openDisplayTab(page);
  await expect(page.getByRole('switch', { name: /top rated badge/i })).toBeEnabled();
  await expect(page.getByText(/not enabled on this instance/i)).toHaveCount(0);
});

test('an older instance that omits the field leaves the control live', async ({ page }) => {
  await page.route('**/healthz', health({ status: 'ok', version: '3.110.0' }));
  await openDisplayTab(page);
  await expect(page.getByRole('switch', { name: /top rated badge/i })).toBeEnabled();
});

test('an unreadable healthz leaves the control live', async ({ page }) => {
  await page.route('**/healthz', route => route.fulfill({ status: 503, body: 'down' }));
  await openDisplayTab(page);
  await expect(page.getByRole('switch', { name: /top rated badge/i })).toBeEnabled();
  await expect(page.getByText(/not enabled on this instance/i)).toHaveCount(0);
});

test('greying keeps the saved value so it draws once the instance enables it', async ({ page }) => {
  await page.route('**/healthz', health({ status: 'ok', version: '3.114.0', features: { imdbTopRated: true } }));
  await openDisplayTab(page);
  const toggle = page.getByRole('switch', { name: /top rated badge/i });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.unroute('**/healthz');
  await page.route('**/healthz', health({ status: 'ok', version: '3.114.0', features: { imdbTopRated: false } }));
  await page.reload();
  await page.getByRole('tab', { name: /display/i }).click();
  const greyed = page.getByRole('switch', { name: /top rated badge/i });
  await expect(greyed).toBeDisabled();
  await expect(greyed).toHaveAttribute('aria-checked', 'true');
});
