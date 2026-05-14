import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildForcedPreviewTrendingBadges,
  resolveFinalImageCacheTtlMs,
} from '../lib/imageRouteExecution.ts';

test('image route execution shortens final image ttl when provider fetch is transiently degraded', () => {
  const ttlMs = resolveFinalImageCacheTtlMs({
    renderedRatingCacheKeys: ['imdb', 'trakt'],
    renderedRatingTtlByProvider: new Map([
      ['imdb', 604_800_000],
      ['trakt', 604_800_000],
    ]),
    hasCertificationBadge: false,
    streamBadgeCount: 0,
    streamBadgesCacheTtlMs: null,
    transientProviderFailureTtlMs: 120_000,
  });

  assert.equal(ttlMs, 120_000);
});

test('forced preview trending badges do not override real fetched trending recognition badges', () => {
  const badges = buildForcedPreviewTrendingBadges({
    existingBadges: [
      { key: 'fanfavourite' },
      { key: 'toprated' },
    ],
    qualityBadgePreferences: ['trendingtoday', 'trendingweek'],
  });

  assert.deepEqual(badges, []);
});

test('forced preview trending badges fall back to a neutral preview label when no real badge exists', () => {
  const badges = buildForcedPreviewTrendingBadges({
    existingBadges: [],
    qualityBadgePreferences: ['trendingtoday', 'trendingweek'],
  });

  assert.deepEqual(badges, [
    {
      key: 'trendingtoday',
      label: 'Preview Tag',
      value: '',
      iconUrl: '',
      accentColor: '',
    },
  ]);
});
