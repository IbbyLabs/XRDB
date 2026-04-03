import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUALITY_BADGE_PREFERENCES,
  normalizeGenreBadgeBorderWidthPx,
  normalizeGenreBadgeScalePercent,
  normalizeNoBackgroundBadgeOutlineWidthPx,
  normalizeQualityBadgeScalePercent,
} from '../lib/badgeCustomization.ts';

test('genre badge scale normalization clamps to 70 to 200', () => {
  assert.equal(normalizeGenreBadgeScalePercent('205'), 200);
  assert.equal(normalizeGenreBadgeScalePercent('70'), 70);
  assert.equal(normalizeGenreBadgeScalePercent('40'), 70);
});

test('quality badge scale normalization clamps to 70 to 200', () => {
  assert.equal(normalizeQualityBadgeScalePercent('205'), 200);
  assert.equal(normalizeQualityBadgeScalePercent('70'), 70);
  assert.equal(normalizeQualityBadgeScalePercent('40'), 70);
});

test('genre badge border width normalization clamps to 0 to 6 and keeps decimal precision', () => {
  assert.equal(normalizeGenreBadgeBorderWidthPx('7.4'), 6);
  assert.equal(normalizeGenreBadgeBorderWidthPx('0'), 0);
  assert.equal(normalizeGenreBadgeBorderWidthPx('-1'), 0);
  assert.equal(normalizeGenreBadgeBorderWidthPx('1.46'), 1.5);
});

test('no background badge outline width normalization clamps to 0 to 4', () => {
  assert.equal(normalizeNoBackgroundBadgeOutlineWidthPx('7.4'), 4);
  assert.equal(normalizeNoBackgroundBadgeOutlineWidthPx('0'), 0);
  assert.equal(normalizeNoBackgroundBadgeOutlineWidthPx('-1'), 0);
  assert.equal(normalizeNoBackgroundBadgeOutlineWidthPx('2.6'), 2.6);
});

test('default quality badge preferences include network and core quality badges', () => {
  assert.deepEqual(DEFAULT_QUALITY_BADGE_PREFERENCES, [
    'certification',
    'netflix',
    'hbo',
    'primevideo',
    'disneyplus',
    'appletvplus',
    'hulu',
    'paramountplus',
    'peacock',
    '4k',
    'bluray',
    'hdr',
    'dolbyvision',
    'dolbyatmos',
    'remux',
  ]);
});
