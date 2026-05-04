import { getDb, ensureDbInitialized } from './sqliteStore.ts';
import { METADATA_CACHE_MAX_ENTRIES } from './imageRouteConfig.ts';
import { recordCacheEvent } from './adminMetrics.ts';

type MetadataRow = {
  value: string;
  expires_at: number;
};

const EXPIRED_PRUNE_SAMPLE_RATE = 0.05;
const OLDEST_PRUNE_SAMPLE_RATE = 0.02;

const readMetadataRow = (key: string) => {
  const db = getDb();
  return db
    .prepare('SELECT value, expires_at FROM metadata_cache WHERE key = ?')
    .get(key) as MetadataRow | undefined;
};

const parseMetadataValue = <T>(value: string): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
};

export const getMetadata = <T = any>(key: string): T | null => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();
  const row = readMetadataRow(key);

  if (!row) {
    recordCacheEvent('miss', key.split(':')[0]);
    return null;
  }

  if (Number(row.expires_at) <= now) {
    db.prepare('DELETE FROM metadata_cache WHERE key = ?').run(key);
    recordCacheEvent('miss', key.split(':')[0]);
    return null;
  }

  db.prepare('UPDATE metadata_cache SET last_accessed_at = ? WHERE key = ?').run(now, key);
  recordCacheEvent('hit', key.split(':')[0]);
  return parseMetadataValue<T>(row.value);
};

export const setMetadata = (key: string, value: any, ttlMs: number) => {
  ensureDbInitialized();
  const db = getDb();
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const storedValue = typeof value === 'string' ? value : JSON.stringify(value);

  db.prepare(
    'INSERT OR REPLACE INTO metadata_cache (key, value, expires_at, last_accessed_at) VALUES (?, ?, ?, ?)',
  ).run(key, storedValue, expiresAt, now);
  recordCacheEvent('set', key.split(':')[0]);

  if (Math.random() < EXPIRED_PRUNE_SAMPLE_RATE) {
    pruneExpiredMetadata();
  }
  if (Math.random() < OLDEST_PRUNE_SAMPLE_RATE) {
    pruneOldestMetadata(METADATA_CACHE_MAX_ENTRIES);
  }
};

export const deleteMetadata = (key: string) => {
  ensureDbInitialized();
  getDb().prepare('DELETE FROM metadata_cache WHERE key = ?').run(key);
  recordCacheEvent('delete', key.split(':')[0]);
};

const pruneExpiredMetadata = () => {
  ensureDbInitialized();
  getDb().prepare('DELETE FROM metadata_cache WHERE expires_at <= ?').run(Date.now());
};

export const pruneOldestMetadata = (maxEntries: number) => {
  ensureDbInitialized();
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM metadata_cache').get() as { count?: number } | undefined;
  const currentCount = Number(row?.count ?? 0);

  if (currentCount <= maxEntries) return;

  db.prepare(
    'DELETE FROM metadata_cache WHERE key IN (SELECT key FROM metadata_cache ORDER BY last_accessed_at ASC LIMIT ?)',
  ).run(currentCount - maxEntries);
};
