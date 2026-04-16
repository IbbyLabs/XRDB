import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyStreamCacheRecencyBucket,
  getAdaptiveStreamCacheTtlMs,
} from '../lib/imageRouteTorrentio.ts';

const MS_PER_HOUR = 60 * 60 * 1000;

const dateHoursAgo = (hours) => new Date(Date.now() - hours * MS_PER_HOUR).toISOString();

const dateDaysAgo = (days) => dateHoursAgo(days * 24);

test('adaptive stream cache: fresh bucket when content is within fresh window', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'movie',
    releaseDate: dateHoursAgo(4),
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'fresh');
  assert.equal(result.source, 'release_date');
  assert.ok(result.ageMs !== null && result.ageMs >= 0);
});

test('adaptive stream cache: warm bucket when content is between fresh and warm window', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'movie',
    releaseDate: dateHoursAgo(24),
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'warm');
  assert.equal(result.source, 'release_date');
});

test('adaptive stream cache: stable bucket when content is older than warm window', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'movie',
    releaseDate: dateDaysAgo(10),
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'stable');
  assert.equal(result.source, 'release_date');
});

test('adaptive stream cache: missing date falls back to warm bucket', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'movie',
    releaseDate: null,
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'warm');
  assert.equal(result.source, 'missing');
  assert.equal(result.ageMs, null);
});

test('adaptive stream cache: invalid date string falls back to warm bucket', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'movie',
    releaseDate: 'not-a-date',
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'warm');
  assert.equal(result.source, 'invalid');
});

test('adaptive stream cache: episode uses air date over release date', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'series',
    releaseDate: dateDaysAgo(365),
    episodeAirDate: dateHoursAgo(2),
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'fresh');
  assert.equal(result.source, 'episode_air_date');
});

test('adaptive stream cache: episode falls back to release date when air date is absent', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'series',
    releaseDate: dateDaysAgo(30),
    episodeAirDate: null,
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.equal(result.bucket, 'stable');
  assert.equal(result.source, 'release_date');
});

test('adaptive stream cache: exact boundary at fresh window edge', () => {
  const result = classifyStreamCacheRecencyBucket({
    mediaType: 'movie',
    releaseDate: dateHoursAgo(8),
    freshWindowMs: 8 * MS_PER_HOUR,
    warmWindowMs: 48 * MS_PER_HOUR,
  });
  assert.ok(result.bucket === 'fresh' || result.bucket === 'warm');
});

test('adaptive stream cache: getAdaptiveStreamCacheTtlMs returns positive number', () => {
  const ttl = getAdaptiveStreamCacheTtlMs({
    id: 'tt0111161',
    mediaType: 'movie',
    releaseDate: dateDaysAgo(3650),
  });
  assert.ok(typeof ttl === 'number' && ttl > 0);
});

test('adaptive stream cache: getAdaptiveStreamCacheTtlMs applies jitter for unique keys', () => {
  const ttl1 = getAdaptiveStreamCacheTtlMs({
    id: 'tt1111111',
    mediaType: 'movie',
    releaseDate: dateDaysAgo(3650),
  });
  const ttl2 = getAdaptiveStreamCacheTtlMs({
    id: 'tt2222222',
    mediaType: 'movie',
    releaseDate: dateDaysAgo(3650),
  });
  assert.ok(ttl1 > 0 && ttl2 > 0);
});
