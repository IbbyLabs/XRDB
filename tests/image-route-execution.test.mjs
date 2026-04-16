import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFinalImageCacheTtlMs } from '../lib/imageRouteExecution.ts';

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
