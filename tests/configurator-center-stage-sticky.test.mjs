import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('configurator center stage sticky rail wrappers do not override sticky positioning', async () => {
  const source = await readFile(
    new URL('../components/configurator-center-stage.tsx', import.meta.url),
    'utf8',
  );

  assert.equal(source.includes('relative z-30 space-y-4 ${stickyRailClass}'), false);
  assert.equal(source.includes('relative z-30 space-y-3 ${stickyRailClass}'), false);
  assert.equal(source.includes('relative z-30 ${stickyRailClass}'), false);
  assert.equal(source.includes('z-30 space-y-4 ${stickyRailClass}'), true);
  assert.equal(source.includes('z-30 space-y-3 ${stickyRailClass}'), true);
  assert.equal(source.includes('z-30 ${stickyRailClass}'), true);
});
