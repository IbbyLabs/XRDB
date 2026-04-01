import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFinalImageRenderSeedKey } from '../lib/finalImageRenderSeed.ts';

const createInput = (overrides = {}) => ({
  cacheVersion: 'poster-backdrop-logo-v72',
  imageType: 'poster',
  outputFormat: 'png',
  cleanId: 'tt0111161',
  requestedImageLang: 'en',
  posterTextPreference: 'clean',
  posterArtworkSource: 'fanart',
  backdropArtworkSource: 'tmdb',
  logoArtworkSource: 'tmdb',
  posterRatingsLayout: 'left-right',
  posterRatingsMaxPerSide: 2,
  posterRatingsMax: 3,
  posterEdgeOffset: 0,
  backdropRatingsLayout: 'right-vertical',
  backdropRatingsMax: 2,
  logoRatingsMax: 3,
  qualityBadgesSide: 'left',
  posterQualityBadgesPosition: 'auto',
  qualityBadgesStyle: 'plain',
  qualityBadgesMax: 2,
  qualityBadgePreferences: ['certification', 'hdr'],
  posterSideRatingsPosition: 'center',
  posterSideRatingsOffset: 50,
  backdropSideRatingsPosition: 'center',
  backdropSideRatingsOffset: 50,
  ratingPresentation: 'average',
  blockbusterDensity: 'balanced',
  aggregateRatingSource: 'combined',
  ratingStyle: 'stacked',
  ratingValueMode: 'normalized',
  posterRatingBadgeScale: 100,
  backdropRatingBadgeScale: 100,
  logoRatingBadgeScale: 100,
  posterQualityBadgeScale: 100,
  backdropQualityBadgeScale: 100,
  genreBadgeMode: 'text',
  genreBadgeStyle: 'plain',
  genreBadgePosition: 'bottomCenter',
  genreBadgeScale: 100,
  logoBackground: 'dark',
  effectiveRatingPreferences: ['imdb', 'tmdb'],
  providerAppearanceOverrides: {},
  mdblistStateKey: 'mdblist:none',
  simklStateKey: 'simkl:none',
  streamBadgesCacheKeySeed: 'off',
  fanartKeyHash: 'fanart-hash',
  fanartClientKeyHash: 'fanart-client-hash',
  sourceFallbackKey: '-',
  renderCacheBuster: '',
  ...overrides,
});

const buildScaleOverrideForType = (imageType, scale) =>
  imageType === 'poster'
    ? { posterRatingBadgeScale: scale }
    : imageType === 'backdrop'
      ? { backdropRatingBadgeScale: scale }
      : { logoRatingBadgeScale: scale };

const findChangedTokenIndexes = (leftKey, rightKey) => {
  const left = leftKey.split('|');
  const right = rightKey.split('|');
  const changed = [];
  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    if ((left[index] || '') !== (right[index] || '')) {
      changed.push(index);
    }
  }
  return changed;
};

const resolveRatingScaleTokenIndex = (imageType) => {
  const baseKey = buildFinalImageRenderSeedKey(createInput({ imageType }));
  const scaledKey = buildFinalImageRenderSeedKey(
    createInput({ imageType, ...buildScaleOverrideForType(imageType, 131) }),
  );
  const changedIndexes = findChangedTokenIndexes(baseKey, scaledKey);
  assert.equal(changedIndexes.length, 1);
  return changedIndexes[0];
};

test('final image render seed changes when poster rating badge scale changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const scaledKey = buildFinalImageRenderSeedKey(
    createInput({ posterRatingBadgeScale: 118 }),
  );

  assert.notEqual(baseKey, scaledKey);
});

test('final image render seed changes when cache version changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ cacheVersion: 'poster-backdrop-logo-v73' }),
  );

  assert.notEqual(baseKey, changedKey);
});

test('final image render seed changes when backdrop rating badge scale changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'backdrop' }));
  const scaledKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', backdropRatingBadgeScale: 121 }),
  );

  assert.notEqual(baseKey, scaledKey);
});

test('final image render seed changes when logo rating badge scale changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'logo' }));
  const scaledKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'logo', logoRatingBadgeScale: 127 }),
  );

  assert.notEqual(baseKey, scaledKey);
});

test('historical regression: genre scale and rating scale each bust the render cache key', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const ratingScaledKey = buildFinalImageRenderSeedKey(
    createInput({ posterRatingBadgeScale: 118 }),
  );
  const genreScaledKey = buildFinalImageRenderSeedKey(
    createInput({ genreBadgeScale: 152 }),
  );

  assert.notEqual(baseKey, ratingScaledKey);
  assert.notEqual(baseKey, genreScaledKey);
});

test('historical regression: changing genre scale does not alter rating scale cache input token', () => {
  for (const imageType of ['poster', 'backdrop', 'logo']) {
    const ratingTokenIndex = resolveRatingScaleTokenIndex(imageType);
    const baseKey = buildFinalImageRenderSeedKey(createInput({ imageType }));
    const genreScaledKey = buildFinalImageRenderSeedKey(
      createInput({ imageType, genreBadgeScale: 163 }),
    );
    const baseTokens = baseKey.split('|');
    const genreTokens = genreScaledKey.split('|');
    assert.equal(baseTokens[ratingTokenIndex], genreTokens[ratingTokenIndex]);
  }
});

test('final image render seed changes when poster edge offset changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const offsetKey = buildFinalImageRenderSeedKey(
    createInput({ posterEdgeOffset: 24 }),
  );

  assert.notEqual(baseKey, offsetKey);
});

test('final image render seed isolates poster side placement from backdrop side placement', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'poster' }));
  const posterSideChangedKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'poster', posterSideRatingsPosition: 'custom', posterSideRatingsOffset: 64 }),
  );
  const backdropSideChangedKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'poster', backdropSideRatingsPosition: 'custom', backdropSideRatingsOffset: 64 }),
  );

  assert.notEqual(baseKey, posterSideChangedKey);
  assert.equal(baseKey, backdropSideChangedKey);
});

test('final image render seed isolates backdrop side placement from poster side placement', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'backdrop' }));
  const backdropSideChangedKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', backdropSideRatingsPosition: 'custom', backdropSideRatingsOffset: 41 }),
  );
  const posterSideChangedKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', posterSideRatingsPosition: 'custom', posterSideRatingsOffset: 41 }),
  );

  assert.notEqual(baseKey, backdropSideChangedKey);
  assert.equal(baseKey, posterSideChangedKey);
});

test('final image render seed changes when quality badge settings change', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const changedPreferenceKey = buildFinalImageRenderSeedKey(
    createInput({ qualityBadgePreferences: ['certification', 'dolbyvision'] }),
  );
  const changedScaleKey = buildFinalImageRenderSeedKey(
    createInput({ posterQualityBadgeScale: 114 }),
  );

  assert.notEqual(baseKey, changedPreferenceKey);
  assert.notEqual(baseKey, changedScaleKey);
});

test('final image render seed includes canonical provider appearance overrides', () => {
  const baseOverrides = {
    imdb: { iconScalePercent: 112 },
    trakt: { stackedWidthPercent: 88, stackedAccentMode: 'logo' },
  };
  const reorderedOverrides = {
    trakt: { stackedWidthPercent: 88, stackedAccentMode: 'logo' },
    imdb: { iconScalePercent: 112 },
  };
  const changedOverrides = {
    imdb: { iconScalePercent: 112 },
    trakt: { stackedWidthPercent: 92, stackedAccentMode: 'logo' },
  };

  const baseKey = buildFinalImageRenderSeedKey(
    createInput({ providerAppearanceOverrides: baseOverrides }),
  );
  const reorderedKey = buildFinalImageRenderSeedKey(
    createInput({ providerAppearanceOverrides: reorderedOverrides }),
  );
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ providerAppearanceOverrides: changedOverrides }),
  );

  assert.equal(baseKey, reorderedKey);
  assert.notEqual(baseKey, changedKey);
});

test('final image render seed changes when MDBList provider state changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ mdblistStateKey: 'mdblist:manual:abcd1234' }),
  );

  assert.notEqual(baseKey, changedKey);
});

test('final image render seed changes when SIMKL provider state changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ simklStateKey: 'simkl:client:abcd1234' }),
  );

  assert.notEqual(baseKey, changedKey);
});

test('final image render seed changes when the fallback image source changes', () => {
  const baseKey = buildFinalImageRenderSeedKey(createInput());
  const fallbackKey = buildFinalImageRenderSeedKey(
    createInput({ sourceFallbackKey: 'fallback-hash-123' }),
  );

  assert.notEqual(baseKey, fallbackKey);
});
