import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('presentation section order includes compact ring mode', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'lib/configuratorPageOptions.ts'),
    'utf8',
  );
  assert.match(source, /export const PRESENTATION_SECTION_ORDER:[\s\S]*'ring'/);
});

test('simple quick tune presentation list includes compact ring mode', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'lib/useConfiguratorWorkspaceSummary.ts'),
    'utf8',
  );
  assert.match(source, /const SIMPLE_PRESENTATION_IDS:[\s\S]*'ring'/);
});
