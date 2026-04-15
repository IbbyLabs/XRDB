import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearRecentPosterRingForTests,
  getRecentPosterEntries,
  recordRecentPosterRequest,
} from '../lib/posterCacheWarmRecentRing.ts';

test('ring records entries and retrieves them in insertion order', () => {
  clearRecentPosterRingForTests();

  recordRecentPosterRequest('tt0111161.jpg', new URLSearchParams('layout=stack'));
  recordRecentPosterRequest('tmdb:movie:603.jpg', new URLSearchParams('layout=badge'));

  const entries = getRecentPosterEntries(10);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'tt0111161');
  assert.equal(entries[0].searchParams.get('layout'), 'stack');
  assert.equal(entries[1].id, 'tmdb:movie:603');
  assert.equal(entries[1].searchParams.get('layout'), 'badge');
});

test('ring strips file extension from ids', () => {
  clearRecentPosterRingForTests();

  recordRecentPosterRequest('tt0068646.png', new URLSearchParams());
  recordRecentPosterRequest('tmdb:tv:1396.webp', new URLSearchParams());
  recordRecentPosterRequest('tt0050083.avif', new URLSearchParams());

  const entries = getRecentPosterEntries(10);
  assert.deepEqual(entries.map((e) => e.id), ['tt0068646', 'tmdb:tv:1396', 'tt0050083']);
});

test('ring strips auth params from stored entries', () => {
  clearRecentPosterRingForTests();

  const params = new URLSearchParams('layout=stack&xrdbKey=secret123&xrdb_key=oldsecret');
  recordRecentPosterRequest('tt0111161.jpg', params);

  const entries = getRecentPosterEntries(10);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].searchParams.get('layout'), 'stack');
  assert.equal(entries[0].searchParams.get('xrdbKey'), null);
  assert.equal(entries[0].searchParams.get('xrdb_key'), null);
});

test('ring deduplicates identical id + params combos', () => {
  clearRecentPosterRingForTests();

  recordRecentPosterRequest('tt0111161.jpg', new URLSearchParams('layout=stack'));
  recordRecentPosterRequest('tt0111161.jpg', new URLSearchParams('layout=stack'));
  recordRecentPosterRequest('tt0111161.jpg', new URLSearchParams('layout=badge'));

  const entries = getRecentPosterEntries(10);
  assert.equal(entries.length, 2);
});

test('ring evicts oldest entry when maxSize is exceeded', () => {
  clearRecentPosterRingForTests();

  recordRecentPosterRequest('tt0000001.jpg', new URLSearchParams(), 2);
  recordRecentPosterRequest('tt0000002.jpg', new URLSearchParams(), 2);
  recordRecentPosterRequest('tt0000003.jpg', new URLSearchParams(), 2);

  const entries = getRecentPosterEntries(10);
  assert.deepEqual(entries.map((e) => e.id), ['tt0000002', 'tt0000003']);
});

test('ring returns at most limit entries from tail', () => {
  clearRecentPosterRingForTests();

  for (let i = 1; i <= 5; i++) {
    recordRecentPosterRequest(`tt000000${i}.jpg`, new URLSearchParams());
  }

  const entries = getRecentPosterEntries(3);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].id, 'tt0000003');
  assert.equal(entries[2].id, 'tt0000005');
});
