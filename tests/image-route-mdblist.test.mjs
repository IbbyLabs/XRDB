import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getMdbListCacheTtlMs,
  getMdbListResponseMessage,
  getRatingCacheTtlMs,
  isMdbListRateLimitedResponse,
  shouldRetryMdbListWithAnotherKey,
} from '../lib/imageRouteMdbList.ts';

test('image route MDBList combines response messages into lower case text', () => {
  assert.equal(
    getMdbListResponseMessage({
      error: 'Quota',
      detail: 'Limit reached',
    }),
    'quota limit reached',
  );
});

test('image route MDBList detects retryable responses', () => {
  assert.equal(
    isMdbListRateLimitedResponse({ ok: false, status: 429, data: null }),
    true,
  );
  assert.equal(
    isMdbListRateLimitedResponse({
      ok: false,
      status: 400,
      data: { message: 'Too many requests right now' },
    }),
    true,
  );
  assert.equal(
    shouldRetryMdbListWithAnotherKey({ ok: false, status: 401, data: null }),
    true,
  );
  assert.equal(
    shouldRetryMdbListWithAnotherKey({ ok: false, status: 404, data: null }),
    false,
  );
});

test('image route MDBList derives stable cache TTL values', () => {
  const oldMovieTtl = getRatingCacheTtlMs({
    id: 'tt1234567',
    mediaType: 'movie',
    releaseDate: '2001-01-01',
    defaultTtlMs: 24 * 60 * 60 * 1000,
    oldTtlMs: 7 * 24 * 60 * 60 * 1000,
  });
  const showTtl = getRatingCacheTtlMs({
    id: 'tt7654321',
    mediaType: 'tv',
    releaseDate: '2001-01-01',
    defaultTtlMs: 24 * 60 * 60 * 1000,
    oldTtlMs: 7 * 24 * 60 * 60 * 1000,
  });
  const mdbListTtl = getMdbListCacheTtlMs({
    imdbId: 'tt0944947',
    mediaType: 'movie',
    releaseDate: '2001-01-01',
  });

  assert.ok(oldMovieTtl >= 60_000);
  assert.ok(showTtl >= 60_000);
  assert.ok(oldMovieTtl > showTtl);
  assert.ok(mdbListTtl >= 60_000);
});
