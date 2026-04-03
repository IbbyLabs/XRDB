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
  posterImageSize: 'medium',
  backdropImageSize: 'normal',
  posterArtworkSource: 'fanart',
  backdropArtworkSource: 'tmdb',
  logoArtworkSource: 'tmdb',
  thumbnailEpisodeArtwork: 'still',
  backdropEpisodeArtwork: 'series',
  posterRatingsLayout: 'left-right',
  posterRatingsMaxPerSide: 2,
  posterRatingsMax: 3,
  posterEdgeOffset: 0,
  backdropRatingsLayout: 'right-vertical',
  backdropRatingsMax: 2,
  backdropBottomRatingsRow: false,
  logoRatingsMax: 3,
  logoBottomRatingsRow: false,
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
  posterRingValueSource: 'highest',
  posterRingProgressSource: 'tmdb',
  blockbusterDensity: 'balanced',
  aggregateRatingSource: 'combined',
  aggregateDynamicStops: '0:#7f1d1d,40:#dc2626,60:#f59e0b,75:#84cc16,85:#16a34a',
  posterNoBackgroundBadgeOutlineColor: '#000000',
  posterNoBackgroundBadgeOutlineWidth: 0,
  ratingStyle: 'stacked',
  ratingStackOffsetX: 0,
  ratingStackOffsetY: 0,
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
  genreBadgeBorderWidth: 1.4,
  logoBackground: 'dark',
  effectiveRatingPreferences: ['imdb', 'tmdb'],
  providerAppearanceOverrides: {},
  mdblistStateKey: 'mdblist:none',
  simklStateKey: 'simkl:none',
  streamBadgesCacheKeySeed: 'off',
  artworkSelectionSeed: 'artwork:default',
  fanartKeyHash: 'fanart-hash',
  fanartClientKeyHash: 'fanart-client-hash',
  omdbKeyHash: 'omdb-hash',
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

test('final image render seed scopes backdrop image size to backdrop renders', () => {
  const baseBackdropKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'backdrop' }));
  const changedBackdropKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', backdropImageSize: '4k' }),
  );
  const basePosterKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'poster' }));
  const changedPosterKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'poster', backdropImageSize: '4k' }),
  );

  assert.notEqual(baseBackdropKey, changedBackdropKey);
  assert.equal(basePosterKey, changedPosterKey);
});

test('final image render seed scopes thumbnail episode artwork to thumbnail renders', () => {
  const baseThumbnailKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'thumbnail' }));
  const changedThumbnailKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'thumbnail', thumbnailEpisodeArtwork: 'series' }),
  );
  const baseBackdropKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'backdrop' }));
  const changedBackdropKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', thumbnailEpisodeArtwork: 'series' }),
  );

  assert.notEqual(baseThumbnailKey, changedThumbnailKey);
  assert.equal(baseBackdropKey, changedBackdropKey);
});

test('final image render seed scopes backdrop episode artwork to backdrop renders', () => {
  const baseBackdropKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'backdrop' }));
  const changedBackdropKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', backdropEpisodeArtwork: 'still' }),
  );
  const baseThumbnailKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'thumbnail' }));
  const changedThumbnailKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'thumbnail', backdropEpisodeArtwork: 'still' }),
  );

  assert.notEqual(baseBackdropKey, changedBackdropKey);
  assert.equal(baseThumbnailKey, changedThumbnailKey);
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

test('final image render seed scopes no background outline settings to poster renders', () => {
  const basePosterKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'poster' }));
  const changedPosterKey = buildFinalImageRenderSeedKey(
    createInput({
      imageType: 'poster',
      posterNoBackgroundBadgeOutlineColor: '#112233',
      posterNoBackgroundBadgeOutlineWidth: 2,
    }),
  );
  const baseBackdropKey = buildFinalImageRenderSeedKey(createInput({ imageType: 'backdrop' }));
  const changedBackdropKey = buildFinalImageRenderSeedKey(
    createInput({
      imageType: 'backdrop',
      posterNoBackgroundBadgeOutlineColor: '#112233',
      posterNoBackgroundBadgeOutlineWidth: 2,
    }),
  );

  assert.notEqual(basePosterKey, changedPosterKey);
  assert.equal(baseBackdropKey, changedBackdropKey);
});

test('final image render seed changes when active style stack offsets change', () => {
  const baseKey = buildFinalImageRenderSeedKey(
    createInput({ ratingStyle: 'glass', ratingStackOffsetX: 0, ratingStackOffsetY: 0 }),
  );
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ ratingStyle: 'glass', ratingStackOffsetX: 22, ratingStackOffsetY: -9 }),
  );

  assert.notEqual(baseKey, changedKey);
});

test('final image render seed scopes dynamic aggregate stops to dynamic accent mode', () => {
  const baseDynamicKey = buildFinalImageRenderSeedKey(
    createInput({
      aggregateAccentMode: 'dynamic',
      aggregateDynamicStops: '0:#111111,80:#ffffff',
    }),
  );
  const changedDynamicKey = buildFinalImageRenderSeedKey(
    createInput({
      aggregateAccentMode: 'dynamic',
      aggregateDynamicStops: '0:#111111,90:#ffffff',
    }),
  );
  const baseSourceKey = buildFinalImageRenderSeedKey(
    createInput({
      aggregateAccentMode: 'source',
      aggregateDynamicStops: '0:#111111,80:#ffffff',
    }),
  );
  const changedSourceKey = buildFinalImageRenderSeedKey(
    createInput({
      aggregateAccentMode: 'source',
      aggregateDynamicStops: '0:#111111,90:#ffffff',
    }),
  );

  assert.notEqual(baseDynamicKey, changedDynamicKey);
  assert.equal(baseSourceKey, changedSourceKey);
});

test('final image render seed ignores style stack offsets for non glass and non square styles', () => {
  const baseKey = buildFinalImageRenderSeedKey(
    createInput({ ratingStyle: 'plain', ratingStackOffsetX: 0, ratingStackOffsetY: 0 }),
  );
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ ratingStyle: 'plain', ratingStackOffsetX: 22, ratingStackOffsetY: -9 }),
  );

  assert.equal(baseKey, changedKey);
});

test('final image render seed scopes compact ring sources to ring poster renders', () => {
  const baseRingKey = buildFinalImageRenderSeedKey(
    createInput({
      ratingPresentation: 'ring',
      posterRingValueSource: 'tmdb',
      posterRingProgressSource: 'imdb',
    }),
  );
  const changedRingKey = buildFinalImageRenderSeedKey(
    createInput({
      ratingPresentation: 'ring',
      posterRingValueSource: 'tomatoes',
      posterRingProgressSource: 'imdb',
    }),
  );
  const baseAverageKey = buildFinalImageRenderSeedKey(
    createInput({
      ratingPresentation: 'average',
      posterRingValueSource: 'tmdb',
      posterRingProgressSource: 'imdb',
    }),
  );
  const changedAverageKey = buildFinalImageRenderSeedKey(
    createInput({
      ratingPresentation: 'average',
      posterRingValueSource: 'tomatoes',
      posterRingProgressSource: 'imdb',
    }),
  );

  assert.notEqual(baseRingKey, changedRingKey);
  assert.equal(baseAverageKey, changedAverageKey);
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

test('backdrop bottom row render seed ignores saved side stack layout tokens', () => {
  const baseKey = buildFinalImageRenderSeedKey(
    createInput({ imageType: 'backdrop', backdropBottomRatingsRow: true }),
  );
  const changedLayoutKey = buildFinalImageRenderSeedKey(
    createInput({
      imageType: 'backdrop',
      backdropBottomRatingsRow: true,
      backdropRatingsLayout: 'right',
      backdropSideRatingsPosition: 'custom',
      backdropSideRatingsOffset: 41,
    }),
  );

  assert.equal(baseKey, changedLayoutKey);
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

test('final image render seed changes when the OMDb key state changes for OMDb poster sources', () => {
  const baseKey = buildFinalImageRenderSeedKey(
    createInput({ posterArtworkSource: 'omdb' }),
  );
  const changedKey = buildFinalImageRenderSeedKey(
    createInput({ posterArtworkSource: 'omdb', omdbKeyHash: 'different-omdb-hash' }),
  );

  assert.notEqual(baseKey, changedKey);
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
