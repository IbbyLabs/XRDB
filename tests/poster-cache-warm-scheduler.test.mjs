import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resetPosterCacheWarmSchedulerForTests,
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