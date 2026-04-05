import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveImageRouteDisplayState } from '../lib/imageRouteDisplayState.ts';

const createBaseInput = () => ({
  imageType: 'poster',
  ratingPresentation: 'editorial',
  aggregateRatingSource: 'overall',
  aggregateAccentMode: 'source',
  aggregateAccentColor: null,
  aggregateCriticsAccentColor: null,
  aggregateAudienceAccentColor: null,
  aggregateDynamicStops: '0:#7f1d1d,40:#dc2626,60:#f59e0b,75:#84cc16,85:#16a34a',
  aggregateAccentBarOffset: 0,
  aggregateAccentBarVisible: true,
  posterRingValueSource: 'highest',
  posterRingProgressSource: 'tmdb',
  posterRatingsLayout: 'top',
  posterRatingsMaxPerSide: 3,
  backdropRatingsLayout: 'top',
  logoRatingsMax: 4,
  posterRatingsMax: 3,
  backdropRatingsMax: 3,
  effectiveRatingPreferences: ['tomatoes', 'imdb'],
  hasExplicitRatingOrder: false,
  allowAnimeOnlyRatings: false,
  shouldRenderRawKitsuFallbackRating: false,
  tmdbRating: '7.1',
  providerRatings: new Map([
    ['tomatoes', '92'],
    ['imdb', '7.1'],
  ]),
  ratingValueMode: 'native',
  providerAppearanceOverrides: {},
  primaryGenreFamily: {
    id: 'horror',
    label: 'Horror',
    accentColor: '#ef4444',
  },
  streamBadges: [],
  genreBadge: {
    familyId: 'horror',
    label: 'Horror',
    accentColor: '#ef4444',
    mode: 'text',
    style: 'glass',
    position: 'topLeft',
    scalePercent: 100,
  },
  outputWidth: 580,
  outputHeight: 859,
});

test('image route display state builds editorial overlays and clears genre badges for editorial posters', () => {
  const state = resolveImageRouteDisplayState(createBaseInput());

  assert.equal(state.usePosterBadgeLayout, true);
  assert.equal(state.useEditorialPosterPresentation, true);
  assert.equal(state.displayRatingBadges.length, 0);
  assert.equal(state.genreBadge, null);
  assert.ok(state.editorialOverlay);
  assert.deepEqual(state.debugResolvedRatingProviders, ['tomatoes', 'imdb']);
});

test('image route display state builds compact ring overlays for poster ring presentation', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    ratingPresentation: 'ring',
    aggregateAccentMode: 'genre',
  });

  assert.equal(state.displayRatingBadges.length, 0);
  assert.equal(state.genreBadge, null);
  assert.equal(state.editorialOverlay, null);
  assert.ok(state.compactRingOverlay);
  assert.match(state.compactRingOverlay?.svg ?? '', /92/);
  assert.match(state.compactRingOverlay?.svg ?? '', /#ef4444/i);
});

test('image route display state keeps compact ring overlay when value source is unavailable but progress source is available', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    ratingPresentation: 'ring',
    posterRingValueSource: 'anilist',
    posterRingProgressSource: 'imdb',
    effectiveRatingPreferences: ['imdb'],
    providerRatings: new Map([['imdb', '7.1']]),
  });

  assert.ok(state.compactRingOverlay);
  assert.match(state.compactRingOverlay?.svg ?? '', /71/);
});

test('image route display state maps dynamic aggregate accents from score stops', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    ratingPresentation: 'average',
    aggregateRatingSource: 'overall',
    aggregateAccentMode: 'dynamic',
    aggregateDynamicStops: '0:#111111,80:#ffffff',
  });

  assert.equal(state.displayRatingBadges.length, 1);
  assert.equal(state.displayRatingBadges[0]?.accentColor, '#ffffff');
});

test('image route display state keeps direct rating badges for standard backdrop renders', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    imageType: 'backdrop',
    ratingPresentation: 'standard',
    aggregateRatingSource: 'overall',
    posterRatingsLayout: 'left',
    genreBadge: null,
  });

  assert.equal(state.useBackdropBadgeLayout, true);
  assert.equal(state.usesAggregatePresentation, false);
  assert.equal(state.editorialOverlay, null);
  assert.equal(state.displayRatingBadges.length, 2);
  assert.deepEqual(
    state.displayRatingBadges.map((badge) => badge.key),
    ['tomatoes', 'imdb'],
  );
});

test('image route display state applies XRDB provider icon tuning defaults', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    imageType: 'logo',
    ratingPresentation: 'standard',
    effectiveRatingPreferences: ['tmdb', 'mdblist', 'imdb', 'simkl'],
    providerRatings: new Map([
      ['tmdb', '7.1'],
      ['mdblist', '78'],
      ['imdb', '7.4'],
      ['simkl', '74'],
    ]),
    genreBadge: null,
  });

  const iconScaleByKey = new Map(
    state.displayRatingBadges.map((badge) => [badge.key, badge.iconScalePercent]),
  );

  assert.equal(iconScaleByKey.get('tmdb'), 108);
  assert.equal(iconScaleByKey.get('mdblist'), 108);
  assert.equal(iconScaleByKey.get('imdb'), 106);
  assert.equal(iconScaleByKey.get('simkl'), 88);
});

test('image route display state leaves non logo badge icon scale at the standard default', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    imageType: 'poster',
    ratingPresentation: 'standard',
    effectiveRatingPreferences: ['tmdb', 'imdb'],
    providerRatings: new Map([
      ['tmdb', '7.1'],
      ['imdb', '7.4'],
    ]),
    genreBadge: null,
  });

  const iconScaleByKey = new Map(
    state.displayRatingBadges.map((badge) => [badge.key, badge.iconScalePercent]),
  );

  assert.equal(iconScaleByKey.get('tmdb'), 100);
  assert.equal(iconScaleByKey.get('imdb'), 100);
});

test('image route display state keeps explicit XRDB provider overrides over default icon tuning', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    imageType: 'logo',
    ratingPresentation: 'standard',
    effectiveRatingPreferences: ['imdb'],
    providerRatings: new Map([['imdb', '7.4']]),
    providerAppearanceOverrides: {
      imdb: { iconScalePercent: 132 },
    },
    genreBadge: null,
  });

  assert.equal(state.displayRatingBadges[0]?.iconScalePercent, 132);
});

test('image route display state marks custom provider icon overrides for downstream rendering', () => {
  const state = resolveImageRouteDisplayState({
    ...createBaseInput(),
    imageType: 'poster',
    ratingPresentation: 'standard',
    effectiveRatingPreferences: ['tomatoes'],
    providerRatings: new Map([['tomatoes', '93']]),
    providerAppearanceOverrides: {
      tomatoes: { iconUrl: 'https://cdn.example.com/custom-rt.svg' },
    },
    genreBadge: null,
  });

  assert.equal(state.displayRatingBadges[0]?.iconUrl, 'https://cdn.example.com/custom-rt.svg');
  assert.equal(state.displayRatingBadges[0]?.hasCustomIconOverride, true);
});
