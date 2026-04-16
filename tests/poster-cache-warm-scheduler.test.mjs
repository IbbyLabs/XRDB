import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resetPosterCacheWarmSchedulerForTests,
  resolvePosterWarmTargets,
  schedulePosterCacheWarm,
} from '../lib/posterCacheWarmScheduler.ts';

const CONFIG = {
  enabled: true,
  intervalMs: 1000,
  checkIntervalMs: 100,
  concurrency: 2,
  logEnabled: false,
  source: 'tt0133093',
  sourceFilePath: null,
  tmdbEnabled: false,
  tmdbLimit: 100,
  mdblistEnabled: false,
  mdblistLimit: 200,
  imdbEnabled: false,
  imdbLimit: 500,
  recentEnabled: false,
  recentLimit: 500,
};

test('poster warm scheduler avoids overlap and respects the warm interval', async () => {
  resetPosterCacheWarmSchedulerForTests();

  let now = 1000;
  let resolveRun;
  let runs = 0;
  const inFlight = new Promise((resolve) => {
    resolveRun = resolve;
  });

  schedulePosterCacheWarm({
    now: () => now,
    resolveConfig: () => CONFIG,
    runWarm: async () => {
      runs += 1;
      await inFlight;
      return { warmed: 1, skipped: 0, failed: 0 };
    },
  });
  assert.equal(runs, 1);

  now = 1100;
  schedulePosterCacheWarm({
    now: () => now,
    resolveConfig: () => CONFIG,
    runWarm: async () => {
      runs += 1;
      return { warmed: 1, skipped: 0, failed: 0 };
    },
  });
  assert.equal(runs, 1);

  resolveRun();
  await inFlight;
  await new Promise((resolve) => setImmediate(resolve));

  now = 1500;
  schedulePosterCacheWarm({
    now: () => now,
    resolveConfig: () => CONFIG,
    runWarm: async () => {
      runs += 1;
      return { warmed: 1, skipped: 0, failed: 0 };
    },
  });
  assert.equal(runs, 1);

  now = 2101;
  schedulePosterCacheWarm({
    now: () => now,
    resolveConfig: () => CONFIG,
    runWarm: async () => {
      runs += 1;
      return { warmed: 1, skipped: 0, failed: 0 };
    },
  });
  assert.equal(runs, 2);
});

test('poster warm target resolution merges and deduplicates static and dynamic sources', async () => {
  const result = await resolvePosterWarmTargets({
    config: {
      ...CONFIG,
      source: 'tt0133093,tmdb:movie:603',
      tmdbEnabled: true,
      mdblistEnabled: true,
    },
    fetchTmdbIds: async () => ['tmdb:movie:603', 'tmdb:tv:1396'],
    fetchMdblistIds: async () => ['tt0133093', 'tt0111161'],
    fetchImdbIds: async () => [],
    fetchRecentEntries: () => [],
  });

  assert.deepEqual(result.targets, ['tt0133093', 'tmdb:movie:603', 'tmdb:tv:1396', 'tt0111161']);
  assert.deepEqual(result.recentEntries, []);
  assert.equal(result.staticCount, 2);
  assert.equal(result.tmdbCount, 2);
  assert.equal(result.mdblistCount, 2);
  assert.equal(result.imdbCount, 0);
  assert.equal(result.recentCount, 0);
});
