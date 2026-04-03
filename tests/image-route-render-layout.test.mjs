import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveImageRouteRenderLayout } from '../lib/imageRouteRenderLayout.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

const createBadge = (key, value) => ({
  key,
  label: key.toUpperCase(),
  value,
  sourceValue: value,
  iconUrl: '',
  accentColor: '#ffffff',
});

test('image route render layout expands logo canvases to fit badge rows', async () => {
  const layout = await resolveImageRouteRenderLayout({
    imageType: 'logo',
    isThumbnailRequest: false,
    ratingPresentation: 'standard',
    outputWidth: 420,
    outputHeight: 120,
    overlayAutoScale: 1,
    displayRatingBadges: [createBadge('imdb', '7.5'), createBadge('tmdb', '8.0')],
    streamBadges: [createBadge('hdr', '')],
    effectivePosterRatingsLayout: 'top',
    effectivePosterRatingsMaxPerSide: 3,
    effectiveBackdropRatingsLayout: 'top',
    backdropBottomRatingsRow: false,
    logoBottomRatingsRow: false,
    posterRatingBadgeScale: 100,
    backdropRatingBadgeScale: 100,
    logoRatingBadgeScale: 100,
    posterQualityBadgeScale: 100,
    backdropQualityBadgeScale: 100,
    ratingStyle: 'plain',
    qualityBadgesMax: null,
    mediaType: 'movie',
    media: { id: 1 },
    tmdbKey: 'tmdb-key',
    requestedImageLang: 'en',
    phases: { ...phases },
    fetchJsonCached: async () => {
      throw new Error('unexpected fetch');
    },
  });

  assert.equal(layout.logoBadgesPerRow, 2);
  assert.equal(layout.qualityBadges.length, 1);
  assert.equal(layout.logoImageHeight, 120);
  assert.ok(layout.finalOutputWidth >= 420);
  assert.ok(layout.finalOutputHeight > 120);
  assert.ok(layout.logoBadgeBandHeight > 0);
});

test('image route render layout collapses backdrop ratings into one bottom row when enabled', async () => {
  const layout = await resolveImageRouteRenderLayout({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    ratingPresentation: 'standard',
    outputWidth: 1280,
    outputHeight: 720,
    overlayAutoScale: 1,
    displayRatingBadges: [
      createBadge('imdb', '7.5'),
      createBadge('tmdb', '8.0'),
      createBadge('tomatoes', '91'),
    ],
    streamBadges: [],
    effectivePosterRatingsLayout: 'top',
    effectivePosterRatingsMaxPerSide: 3,
    effectiveBackdropRatingsLayout: 'right-vertical',
    backdropBottomRatingsRow: true,
    logoBottomRatingsRow: false,
    posterRatingBadgeScale: 100,
    backdropRatingBadgeScale: 100,
    logoRatingBadgeScale: 100,
    posterQualityBadgeScale: 100,
    backdropQualityBadgeScale: 100,
    ratingStyle: 'plain',
    qualityBadgesMax: null,
    mediaType: 'movie',
    media: { id: 1 },
    tmdbKey: 'tmdb-key',
    requestedImageLang: 'en',
    phases: { ...phases },
    fetchJsonCached: async () => {
      throw new Error('unexpected fetch');
    },
  });

  assert.equal(layout.backdropBottomRatingsRow, true);
  assert.equal(layout.backdropRows.length, 1);
  assert.deepEqual(
    layout.backdropRows[0].map((badge) => badge.key),
    ['imdb', 'tmdb', 'tomatoes'],
  );
  assert.deepEqual(layout.rightRatingBadges, []);
});

test('image route render layout adds extra safe inset for thumbnail backdrop renders', async () => {
  const normalLayout = await resolveImageRouteRenderLayout({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    ratingPresentation: 'standard',
    outputWidth: 1280,
    outputHeight: 720,
    overlayAutoScale: 1,
    displayRatingBadges: [createBadge('imdb', '7.5')],
    streamBadges: [],
    effectivePosterRatingsLayout: 'top',
    effectivePosterRatingsMaxPerSide: 3,
    effectiveBackdropRatingsLayout: 'right-vertical',
    backdropBottomRatingsRow: false,
    logoBottomRatingsRow: false,
    posterRatingBadgeScale: 100,
    backdropRatingBadgeScale: 100,
    logoRatingBadgeScale: 100,
    posterQualityBadgeScale: 100,
    backdropQualityBadgeScale: 100,
    ratingStyle: 'plain',
    qualityBadgesMax: null,
    mediaType: 'tv',
    media: { id: 1 },
    tmdbKey: 'tmdb-key',
    requestedImageLang: 'en',
    phases: { ...phases },
    fetchJsonCached: async () => {
      throw new Error('unexpected fetch');
    },
  });
  const thumbnailLayout = await resolveImageRouteRenderLayout({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    ratingPresentation: 'standard',
    outputWidth: 1280,
    outputHeight: 720,
    overlayAutoScale: 1,
    displayRatingBadges: [createBadge('imdb', '7.5')],
    streamBadges: [],
    effectivePosterRatingsLayout: 'top',
    effectivePosterRatingsMaxPerSide: 3,
    effectiveBackdropRatingsLayout: 'right-vertical',
    backdropBottomRatingsRow: false,
    logoBottomRatingsRow: false,
    posterRatingBadgeScale: 100,
    backdropRatingBadgeScale: 100,
    logoRatingBadgeScale: 100,
    posterQualityBadgeScale: 100,
    backdropQualityBadgeScale: 100,
    ratingStyle: 'plain',
    qualityBadgesMax: null,
    mediaType: 'tv',
    media: { id: 1 },
    tmdbKey: 'tmdb-key',
    requestedImageLang: 'en',
    phases: { ...phases },
    fetchJsonCached: async () => {
      throw new Error('unexpected fetch');
    },
  });

  assert.equal(normalLayout.backdropEdgeInset, 12);
  assert.equal(thumbnailLayout.backdropEdgeInset, 24);
  assert.equal(thumbnailLayout.badgeTopOffset > normalLayout.badgeTopOffset, true);
  assert.equal(thumbnailLayout.badgeBottomOffset > normalLayout.badgeBottomOffset, true);
});

test('image route render layout keeps logo ratings on one row in blockbuster mode when enabled', async () => {
  const layout = await resolveImageRouteRenderLayout({
    imageType: 'logo',
    isThumbnailRequest: false,
    ratingPresentation: 'blockbuster',
    outputWidth: 420,
    outputHeight: 120,
    overlayAutoScale: 1,
    displayRatingBadges: [
      createBadge('imdb', '7.5'),
      createBadge('tmdb', '8.0'),
      createBadge('tomatoes', '91'),
      createBadge('metacritic', '68'),
      createBadge('letterboxd', '4.1'),
    ],
    streamBadges: [],
    effectivePosterRatingsLayout: 'top',
    effectivePosterRatingsMaxPerSide: 3,
    effectiveBackdropRatingsLayout: 'top',
    backdropBottomRatingsRow: false,
    logoBottomRatingsRow: true,
    posterRatingBadgeScale: 100,
    backdropRatingBadgeScale: 100,
    logoRatingBadgeScale: 100,
    posterQualityBadgeScale: 100,
    backdropQualityBadgeScale: 100,
    ratingStyle: 'plain',
    qualityBadgesMax: null,
    mediaType: 'movie',
    media: { id: 1 },
    tmdbKey: 'tmdb-key',
    requestedImageLang: 'en',
    phases: { ...phases },
    fetchJsonCached: async () => {
      throw new Error('unexpected fetch');
    },
  });

  assert.equal(layout.logoBadgesPerRow, 5);
});
