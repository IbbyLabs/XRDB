import test from 'node:test';
import assert from 'node:assert/strict';

import { clearCacheEvents, getMetricsSnapshot, recordCacheEvent } from '../lib/adminMetrics.ts';

test('admin metrics aggregate final image cache cohorts by masked uuid prefix', () => {
  const previousAdminKey = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = 'test-admin-key';

  try {
    clearCacheEvents();

    recordCacheEvent('hit', 'image:final:cohort:aaaa');
    recordCacheEvent('hit', 'image:final:cohort:aaaa');
    recordCacheEvent('miss', 'image:final:cohort:aaaa');
    recordCacheEvent('hit', 'image:final:cohort:bbbb');
    recordCacheEvent('set', 'image:final:cohort:bbbb');

    const snapshot = getMetricsSnapshot();

    assert.equal(snapshot.finalImageCacheHits, 3);
    assert.equal(snapshot.finalImageCacheMisses, 1);
    assert.equal(snapshot.finalImageCacheSets, 1);
    assert.equal(snapshot.finalImageCacheEventsLast24Hours, 5);
    assert.equal(snapshot.finalImageCacheCohorts.length, 2);
    assert.equal(snapshot.finalImageCacheCohorts[0].cohortHash, 'aaaa');
    assert.equal(snapshot.finalImageCacheCohorts[0].hits, 2);
    assert.equal(snapshot.finalImageCacheCohorts[0].misses, 1);
    assert.equal(snapshot.finalImageCacheCohorts[0].hitRate, 2 / 3);
    assert.equal(snapshot.finalImageCacheCohorts[1].cohortHash, 'bbbb');
    assert.equal(snapshot.finalImageCacheCohorts[1].hits, 1);
    assert.equal(snapshot.finalImageCacheCohorts[1].sets, 1);
  } finally {
    clearCacheEvents();
    if (previousAdminKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = previousAdminKey;
  }
});