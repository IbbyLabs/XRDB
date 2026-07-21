import { test, expect } from '@playwright/test';

test.describe('touch layout', () => {
  // hasTouch is what flips `(pointer: coarse)`; spreading a whole device
  // descriptor here would force a new worker.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('standalone secondary links are thumb-sized', async ({ page }) => {
    await page.goto('/');
    const footerLinks = page.locator('.home-footer-links a');
    await expect(footerLinks.first()).toBeVisible();

    for (const box of await footerLinks.evaluateAll(els =>
      els.map(e => e.getBoundingClientRect().height))) {
      expect(box).toBeGreaterThanOrEqual(44);
    }

    await page.goto('/integrations');
    const docs = page.locator('.docs-link').first();
    await docs.scrollIntoViewIfNeeded();
    expect(await docs.evaluate(e => e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  });

  test('preview actions sit in even rows, never one stranded button', async ({ page }) => {
    await page.goto('/configurator');
    const actions = page.locator('.preview-actions');
    await expect(actions).toBeVisible();

    const rows = await actions.evaluate(el => {
      const tops = [...el.children].map(c => Math.round(c.getBoundingClientRect().top));
      return [...new Set(tops)].map(t => tops.filter(x => x === t).length);
    });
    expect(rows.length).toBeGreaterThan(0);
    // a lone button on its own row is the layout this guards against
    expect(rows.filter(n => n === 1)).toHaveLength(0);
  });
});

test('desktop keeps compact footer links', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const h = await page.locator('.home-footer-links a').first()
    .evaluate(e => e.getBoundingClientRect().height);
  expect(h).toBeLessThan(44);
});
