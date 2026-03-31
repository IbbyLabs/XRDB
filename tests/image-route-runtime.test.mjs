import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildServerTimingHeader,
  createConcurrencyLimit,
  createImageHttpResponse,
  getCacheTtlMsFromCacheControl,
  getDeterministicTtlMs,
  isImdbId,
  parseRetryAfterMs,
  safeCompareText,
  sha1Hex,
  withDedupe,
} from '../lib/imageRouteRuntime.ts';

test('image route runtime hashes and compares deterministically', () => {
  assert.equal(sha1Hex('xrdb').length, 40);
  assert.equal(safeCompareText('abc', 'abc'), true);
  assert.equal(safeCompareText('abc', 'abd'), false);
  assert.equal(isImdbId('tt0944947'), true);
  assert.equal(isImdbId('tmdb:123'), false);
});

test('image route runtime derives stable TTL values', () => {
  const ttl = getDeterministicTtlMs(1000 * 60 * 60, 'seed');
  assert.ok(ttl >= 60_000);
  assert.equal(getDeterministicTtlMs(1000, ''), 1000);
  assert.equal(getCacheTtlMsFromCacheControl('max-age=90', 10_000), 90_000);
  assert.equal(getCacheTtlMsFromCacheControl('s-maxage=45', 10_000), 45_000);
  assert.equal(getCacheTtlMsFromCacheControl('', 10_000), 10_000);
});

test('image route runtime parses Retry After values safely', () => {
  assert.equal(parseRetryAfterMs('60', 5_000), 60_000);
  assert.equal(parseRetryAfterMs('', 5_000), 5_000);
});

test('image route runtime dedupes concurrent work', async () => {
  const inFlight = new Map();
  let runs = 0;
  const factory = async () => {
    runs += 1;
    return 'ok';
  };

  const [left, right] = await Promise.all([
    withDedupe(inFlight, 'alpha', factory),
    withDedupe(inFlight, 'alpha', factory),
  ]);

  assert.equal(left, 'ok');
  assert.equal(right, 'ok');
  assert.equal(runs, 1);
  assert.equal(inFlight.size, 0);
});

test('image route runtime limits concurrency and builds headers', async () => {
  const limit = createConcurrencyLimit(1);
  const order = [];

  await Promise.all([
    limit(async () => {
      order.push('first-start');
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push('first-end');
    }),
    limit(async () => {
      order.push('second');
    }),
  ]);

  assert.deepEqual(order, ['first-start', 'first-end', 'second']);

  const serverTiming = buildServerTimingHeader(
    { auth: 1, tmdb: 2, mdb: 3, fanart: 4, stream: 5, render: 6 },
    21,
  );
  assert.match(serverTiming, /auth;dur=1\.0/);
  assert.match(serverTiming, /total;dur=21\.0/);

  const response = createImageHttpResponse(
    {
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=60',
    },
    serverTiming,
    'hit',
    { 'X-Test': 'ok' },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(response.headers.get('X-XRDB-Cache'), 'hit');
  assert.equal(response.headers.get('X-Test'), 'ok');
});
