import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUALITY_BADGE_PREFERENCES,
  normalizeGenreBadgeScalePercent,
} from '../lib/badgeCustomization.ts';

test('genre badge scale normalization clamps to 70 to 200', () => {
  assert.equal(normalizeGenreBadgeScalePercent('205'), 200);
  assert.equal(normalizeGenreBadgeScalePercent('70'), 70);
  assert.equal(normalizeGenreBadgeScalePercent('40'), 70);
});

test('default quality badge preferences stay focused on core quality badges', () => {
  assert.deepEqual(DEFAULT_QUALITY_BADGE_PREFERENCES, [
    'certification',
    '4k',
    'bluray',
    'hdr',
    'dolbyvision',
    'dolbyatmos',
    'remux',
  ]);
});
