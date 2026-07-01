import test from 'node:test';
import assert from 'node:assert/strict';

import { getDb, ensureDbInitialized } from '../lib/sqliteStore.ts';
import {
  clearCacheEvents,
  clearRequestLog,
  getMetricsSnapshot,
  recordCacheEvent,
} from '../lib/adminMetrics.ts';

const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

test('admin metrics prune aged rows while lifetime totals survive in counters', () => {
  const previousAdminKey = process.env.ADMIN_KEY;
  process.env.ADMIN_KEY = 'test-admin-key';

  try {
    ensureDbInitialized();
    const db = getDb();
    clearCacheEvents();
    clearRequestLog();
    // Simulate a pre-upgrade install: aged rows exist, counters were never seeded.
    db.prepare("DELETE FROM admin_counters WHERE name = 'seed:admin_counters'").run();
    const aged = Date.now() - EIGHT_DAYS_MS;
    db.prepare(
      'INSERT INTO admin_cache_events (event_type, key_prefix, created_at) VALUES (?, ?, ?)',
    ).run('hit', 'tmdb', aged);
    db.prepare(
      'INSERT INTO admin_cache_events (event_type, key_prefix, created_at) VALUES (?, ?, ?)',
    ).run('miss', 'tmdb', aged);

    recordCacheEvent('hit', 'tmdb');

    const remaining = (
      db.prepare('SELECT COUNT(*) as n FROM admin_cache_events').get()
    ).n;
    assert.equal(remaining, 1, 'aged rows are pruned, the fresh row stays');

    const snapshot = getMetricsSnapshot();
    assert.equal(snapshot.cacheHits, 2, 'lifetime hits include pruned rows');
    assert.equal(snapshot.cacheMisses, 1, 'lifetime misses include pruned rows');
  } finally {
    clearCacheEvents();
    clearRequestLog();
    if (previousAdminKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = previousAdminKey;
  }
});
