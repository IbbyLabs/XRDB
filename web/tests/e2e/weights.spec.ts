import { test, expect, type Page } from '@playwright/test';

// The source weighting splits 100% between the selected rating sources, and the
// top-critic / top-audience order decides which single source those ring modes
// read. Both change what number the poster prints, so what matters is that the
// controls stay whole and that a change reaches the render URL.

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

async function openWeighting(page: Page) {
  await page.getByText('Source weighting').click();
  return page.getByRole('group', { name: 'Source weighting' });
}

/** Every source's share, read straight off the number inputs. */
async function shares(group: ReturnType<Page['getByRole']>): Promise<number[]> {
  return (await group.locator('input[type="number"]').all())
    .reduce(async (acc, input) => [...(await acc), Number(await input.inputValue())],
      Promise.resolve([] as number[]));
}

const renderUrl = (page: Page) => page.locator('.urlbar-code').first();

test('the weighting starts as an even split that adds up to 100', async ({ page }) => {
  await openFineTuning(page);
  const group = await openWeighting(page);

  const values = await shares(group);
  expect(values.length).toBeGreaterThan(1);
  expect(values.reduce((a, b) => a + b, 0)).toBe(100);
  // An untouched split is the renderer's own default, so it should not need
  // spelling out in the URL.
  await expect(renderUrl(page)).not.toContainText('ratingProviderWeights');
  await expect(group).toContainText('100%');
});

test('moving one source rebalances the rest to keep the total at 100', async ({ page }) => {
  await openFineTuning(page);
  const group = await openWeighting(page);

  await group.getByRole('spinbutton', { name: 'IMDb (%)' }).fill('70');
  await expect(renderUrl(page)).toContainText('ratingProviderWeights');

  const values = await shares(group);
  expect(values.reduce((a, b) => a + b, 0)).toBe(100);
  expect(values[0]).toBe(70);
});

test('a source added after weighting gets a share instead of counting for nothing', async ({ page }) => {
  await openFineTuning(page);
  const group = await openWeighting(page);
  await group.getByRole('spinbutton', { name: 'IMDb (%)' }).fill('80');

  const before = (await shares(group)).length;
  await page.getByRole('button', { name: /^Trakt/ }).click();

  const after = await shares(group);
  expect(after.length).toBe(before + 1);
  expect(after.reduce((a, b) => a + b, 0)).toBe(100);
  // The point of the sync: the newcomer carries real weight rather than 0.
  expect(after[after.length - 1]).toBeGreaterThan(0);
});

test('even split clears the weighting from the URL again', async ({ page }) => {
  await openFineTuning(page);
  const group = await openWeighting(page);

  await group.getByRole('spinbutton', { name: 'IMDb (%)' }).fill('65');
  await expect(renderUrl(page)).toContainText('ratingProviderWeights');

  await group.getByRole('button', { name: 'Even split' }).click();
  await expect(renderUrl(page)).not.toContainText('ratingProviderWeights');
  expect((await shares(group)).reduce((a, b) => a + b, 0)).toBe(100);
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
