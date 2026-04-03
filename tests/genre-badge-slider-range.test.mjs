import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_GENRE_BADGE_SCALE_PERCENT,
  MAX_QUALITY_BADGE_SCALE_PERCENT,
} from '../lib/badgeCustomization.ts';

test('genre badge slider max stays at 200 percent', () => {
  assert.equal(MAX_GENRE_BADGE_SCALE_PERCENT, 200);

  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/configurator-appearance-sections.tsx'),
    'utf8',
  );
  assert.match(source, /label="Genre badge"[\s\S]*max=\{MAX_GENRE_BADGE_SCALE_PERCENT\}/);
});

test('quality badge slider max stays at 200 percent', () => {
  assert.equal(MAX_QUALITY_BADGE_SCALE_PERCENT, 200);

  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/configurator-appearance-sections.tsx'),
    'utf8',
  );
  assert.match(source, /label="Quality badges"[\s\S]*max=\{MAX_QUALITY_BADGE_SCALE_PERCENT\}/);
});
