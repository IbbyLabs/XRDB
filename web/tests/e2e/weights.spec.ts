import { test, expect, type Page } from '@playwright/test';

// Per-provider weights and the top-critic/top-audience order both change what
// number the renderer prints, so what matters is that a change in the controls
// reaches the render URL the poster is fetched from.

async function openFineTuning(page: Page) {
  await page.goto('/configurator');
  // The page is a static export, so nothing is interactive until React hydrates.
  // The preview URL is computed after mount, which makes it a real ready signal.
  await expect(page.locator('.urlbar')).toBeVisible();
  await page.getByRole('tab', { name: /ratings/i }).click();
  const toggle = page.getByRole('switch', { name: /toggle fine tuning/i });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

/** The ring's own controls only exist once the ring itself is switched on. */
async function enableRing(page: Page) {
  await page.getByRole('button', { name: 'Ring', exact: true }).click();
}

const renderUrl = (page: Page) => page.locator('.urlbar-code').first();

test('a provider weight reaches the render URL', async ({ page }) => {
  await openFineTuning(page);
  await expect(renderUrl(page)).not.toContainText('ratingProviderWeights');

  await page.getByText('Per-provider weight').click();
  const weights = page.getByRole('group', { name: 'Per-provider weight' });
  await weights.getByLabel('IMDb', { exact: true }).fill('4');

  await expect(renderUrl(page)).toContainText('ratingProviderWeights');
  await expect(renderUrl(page)).toContainText('4');
});

test('weighting a source back to normal drops it from the URL again', async ({ page }) => {
  await openFineTuning(page);
  await page.getByText('Per-provider weight').click();
  const weights = page.getByRole('group', { name: 'Per-provider weight' });
  const imdb = weights.getByLabel('IMDb', { exact: true });

  await imdb.fill('3');
  await expect(renderUrl(page)).toContainText('ratingProviderWeights');

  // A source at 1 counts exactly as much as one that was never touched, so it
  // should leave the config rather than sit in it as a no-op.
  await imdb.fill('1');
  await expect(renderUrl(page)).not.toContainText('ratingProviderWeights');
});

test('reordering the critics list reaches the render URL', async ({ page }) => {
  await openFineTuning(page);
  await enableRing(page);
  await page.getByText('Top critic / top audience order').click();

  const critics = page.getByRole('group', { name: 'Critics' });
  // The list starts on the built-in order, which leads with RT critics.
  await expect(critics.getByRole('listitem').first()).toContainText('RT critics');

  await critics.getByRole('button', { name: /move metacritic up/i }).click();
  await expect(critics.getByRole('listitem').first()).toContainText('Metacritic');
  await expect(renderUrl(page)).toContainText('ringCriticsPriority');

  await critics.getByRole('button', { name: 'Default order' }).click();
  await expect(critics.getByRole('listitem').first()).toContainText('RT critics');
  await expect(renderUrl(page)).not.toContainText('ringCriticsPriority');
});
