import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BLOCKBUSTER_DENSITY,
  DEFAULT_POSTER_IMAGE_SIZE,
  MDBLIST_API_KEYS,
  normalizeArtworkSource,
  normalizeBlockbusterDensity,
  normalizeBooleanSearchFlag,
  normalizeOptionalBadgeCount,
  normalizePosterImageSize,
  normalizeRpdbFontScalePercent,
  parseApiKeyList,
  parseCacheTtlMs,
  parseNonNegativeInt,
  resolveRpdbRatingBarPositionAliases,
  toAnimeMappingProvider,
} from '../lib/imageRouteConfig.ts';

test('parseApiKeyList dedupes values across separators', () => {
  assert.deepEqual(parseApiKeyList('a, b;c', 'c d', '  ', undefined), ['a', 'b', 'c', 'd']);
});

test('image route config keeps poster aliases stable', () => {
  assert.equal(DEFAULT_POSTER_IMAGE_SIZE, 'normal');
  assert.equal(normalizePosterImageSize('standard'), 'normal');
  assert.equal(normalizePosterImageSize('4k-slow'), '4k');
  assert.equal(normalizePosterImageSize('unknown'), 'normal');
});

test('image route config normalizes artwork and boolean flags safely', () => {
  assert.equal(normalizeArtworkSource('fanart'), 'fanart');
  assert.equal(normalizeArtworkSource('mystery'), 'tmdb');
  assert.equal(normalizeBooleanSearchFlag('yes'), true);
  assert.equal(normalizeBooleanSearchFlag('off'), false);
  assert.equal(normalizeBooleanSearchFlag('maybe'), null);
});

test('image route config maps RPDB aliases to local layouts', () => {
  assert.deepEqual(resolveRpdbRatingBarPositionAliases('bottom'), {
    posterRatingsLayout: 'bottom',
  });
  assert.deepEqual(resolveRpdbRatingBarPositionAliases('right-center'), {
    posterRatingsLayout: 'right',
    backdropRatingsLayout: 'right-vertical',
    sideRatingsPosition: 'middle',
  });
});

test('image route config keeps numeric normalization predictable', () => {
  assert.equal(normalizeRpdbFontScalePercent('1.25'), 125);
  assert.equal(normalizeRpdbFontScalePercent('140%'), 140);
  assert.equal(normalizeOptionalBadgeCount('0'), null);
  assert.equal(normalizeOptionalBadgeCount('3.8'), 3);
  assert.equal(parseNonNegativeInt('-1'), null);
  assert.equal(parseNonNegativeInt('6.9', 5), 5);
  assert.equal(parseCacheTtlMs('200', 50, 100, 150), 150);
  assert.equal(parseCacheTtlMs('bad', 50, 100, 150), 50);
});

test('image route config normalizes provider and density aliases', () => {
  assert.equal(toAnimeMappingProvider('myanimelist'), 'mal');
  assert.equal(toAnimeMappingProvider('tmdb'), 'tmdb');
  assert.equal(toAnimeMappingProvider('invalid'), null);
  assert.equal(DEFAULT_BLOCKBUSTER_DENSITY, 'balanced');
  assert.equal(normalizeBlockbusterDensity('packed'), 'packed');
  assert.equal(normalizeBlockbusterDensity('invalid'), 'balanced');
});

test('MDBList key export stays array shaped', () => {
  assert.ok(Array.isArray(MDBLIST_API_KEYS));
});
