import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('configurator workspace uses scrollable side rails instead of sticky preview controls', async () => {
  const [
    centerStageSource,
    configureViewSource,
    inputsPanelSource,
    pageChromeSource,
    responsiveStyles,
  ] = await Promise.all([
    readFile(new URL('../components/configurator-center-stage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/configure-view.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/configurator-inputs-panel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/useConfiguratorPageChrome.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/styles/xrdb-responsive.css', import.meta.url), 'utf8'),
  ]);

  assert.equal(centerStageSource.includes('Sticky rail'), false);
  assert.equal(centerStageSource.includes('workspace-sticky-preview'), false);
  assert.equal(inputsPanelSource.includes('xrdb-workspace-scroll-region'), true);
  assert.equal(inputsPanelSource.includes('xrdb-workspace-scroll-region min-h-0'), true);
  assert.equal(configureViewSource.includes('min-w-0 min-h-0'), true);
  assert.equal(pageChromeSource.includes(".closest('.xrdb-workspace-scroll-region')"), true);
  assert.equal(responsiveStyles.includes('height: calc(100svh - 6.5rem);'), true);
  assert.equal(responsiveStyles.includes('overscroll-behavior-y: contain;'), true);
});
