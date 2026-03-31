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
    ratingPresentation: 'standard',
    outputWidth: 420,
    outputHeight: 120,
    overlayAutoScale: 1,
    displayRatingBadges: [createBadge('imdb', '7.5'), createBadge('tmdb', '8.0')],
    streamBadges: [createBadge('hdr', '')],
    effectivePosterRatingsLayout: 'top',
    effectivePosterRatingsMaxPerSide: 3,
    effectiveBackdropRatingsLayout: 'top',
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
