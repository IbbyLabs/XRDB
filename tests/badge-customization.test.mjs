import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_QUALITY_BADGE_PREFERENCES,
  normalizeGenreBadgeBorderWidthPx,
  normalizeGenreBadgeScalePercent,
  normalizeNoBackgroundBadgeOutlineWidthPx,
  normalizeQualityBadgeScalePercent,
  normalizeThumbnailRatingBadgeScalePercent,
  normalizeRatingProviderAppearanceOverrides,
  serializeRatingProviderAppearanceOverrides,
  parseRatingProviderAppearanceOverrides,
  encodeRatingProviderAppearanceOverrides,
  DEFAULT_STACKED_ELEMENT_OFFSET_PX,
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

test('thumbnail rating badge scale normalization clamps to 70 to 200', () => {
  assert.equal(normalizeThumbnailRatingBadgeScalePercent('205'), 200);
  assert.equal(normalizeThumbnailRatingBadgeScalePercent('70'), 70);
  assert.equal(normalizeThumbnailRatingBadgeScalePercent('40'), 70);
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
    'bdremux',
  ]);
});

test('valueOffsetX and valueOffsetY are parsed from provider appearance overrides', () => {
  const result = normalizeRatingProviderAppearanceOverrides({
    tmdb: { valueOffsetX: 10, valueOffsetY: -5 },
  });
  assert.equal(result.tmdb?.valueOffsetX, 10);
  assert.equal(result.tmdb?.valueOffsetY, -5);
});

test('valueOffsetX and valueOffsetY are clamped to the element offset range', () => {
  const result = normalizeRatingProviderAppearanceOverrides({
    tmdb: { valueOffsetX: 50, valueOffsetY: -50 },
  });
  assert.equal(result.tmdb?.valueOffsetX, 24);
  assert.equal(result.tmdb?.valueOffsetY, -24);
});

test('valueOffsetX and valueOffsetY default values are omitted from serialization', () => {
  const serialized = serializeRatingProviderAppearanceOverrides({
    tmdb: { valueOffsetX: 0, valueOffsetY: 0 },
  });
  assert.equal(serialized, '');
});

test('valueOffsetX and valueOffsetY non-default values are included in serialization', () => {
  const encoded = encodeRatingProviderAppearanceOverrides({
    tmdb: { valueOffsetX: 8, valueOffsetY: -3 },
  });
  assert.ok(encoded.length > 0);
  const parsed = parseRatingProviderAppearanceOverrides(encoded);
  assert.equal(parsed.tmdb?.valueOffsetX, 8);
  assert.equal(parsed.tmdb?.valueOffsetY, -3);
});

test('valueOffsetX and valueOffsetY parse from backward-compatible alias scoreOffsetX', () => {
  const result = normalizeRatingProviderAppearanceOverrides({
    imdb: { scoreOffsetX: 6, scoreOffsetY: -2 },
  });
  assert.equal(result.imdb?.valueOffsetX, 6);
  assert.equal(result.imdb?.valueOffsetY, -2);
});
