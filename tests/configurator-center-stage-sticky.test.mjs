import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('configurator workspace uses scrollable side rails instead of sticky preview controls', async () => {
  const [centerStageSource, inputsPanelSource, workspaceColumnsSource, supportPanelsSource, pageChromeSource] = await Promise.all([
    readFile(new URL('../components/configurator-center-stage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/configurator-inputs-panel.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/configurator-workspace-columns.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/configurator-support-panels.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../lib/useConfiguratorPageChrome.ts', import.meta.url), 'utf8'),
  ]);

  assert.equal(centerStageSource.includes('Sticky rail'), false);
  assert.equal(centerStageSource.includes('workspace-sticky-preview'), false);
  assert.equal(inputsPanelSource.includes('xrdb-workspace-scroll-region'), true);
  assert.equal(workspaceColumnsSource.includes('xrdb-workspace-side-rail xrdb-workspace-scroll-region'), true);
  assert.equal(supportPanelsSource.includes('2xl:sticky'), false);
  assert.equal(pageChromeSource.includes(".closest('.xrdb-workspace-scroll-region')"), true);
});
