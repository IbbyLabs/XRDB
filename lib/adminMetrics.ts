import { createHash, randomUUID } from 'crypto';
import { getDb, ensureDbInitialized } from './sqliteStore.ts';
import { isAdminEnabled } from './adminAuth.ts';
import { parseMs } from './imdbDatasetLookupSchedulerConfig.ts';

export type RouteType = 'image' | 'thumbnail' | 'proxy';

type RequestLogRow = {
  id: string;
  route_type: string;
  status_code: number;
  duration_ms: number;
  media_id: string | null;
  config_id: string | null;
  request_key_hash: string | null;
  created_at: number;
};

type CacheEventRow = {
  event_type: string;
  key_prefix: string | null;
  created_at: number;
};

export type RequestLogEntry = {
  id: string;
  routeType: string;
  statusCode: number;
  durationMs: number;
  mediaId: string | null;
  configId: string | null;
  requestKeyHash: string | null;
  createdAt: number;
};

export type MetricsSnapshot = {
  totalRequests: number;
  requestsLastHour: number;
  requestsLast24Hours: number;
  countsByType: Record<string, number>;
  countsByStatus: Record<string, number>;
  cacheHits: number;
  cacheMisses: number;
  cacheSets: number;
  cacheDeletes: number;
  cacheEventsLast24Hours: number;
  cacheEventsByType: Record<string, number>;
  trackedIdentityRequestsLast24Hours: number;
  anonymousRequestsLast24Hours: number;
  activeUsersLastHour: number;
  activeUsersLast24Hours: number;
  activeConfigUsersLast24Hours: number;
  activeKeyUsersLast24Hours: number;
  totalActiveConfigProfiles: number;
  totalInactiveConfigProfiles: number;
  totalConfigProfilesPendingPurge: number;
  prewarmRuns: number;
  prewarmTotalWarmed: number;
  prewarmTotalFailed: number;
  prewarmLastRunAt: number | null;
  prewarmLastSummary: {
    warmed: number;
    skipped: number;
    failed: number;
    staticCount: number;
    tmdbCount: number;
    mdblistCount: number;
    imdbCount: number;
    recentCount: number;
    snapshotCount: number;
    targetCount: number;
  } | null;
  cacheHitRate: number;
  finalImageCacheHits: number;
  finalImageCacheMisses: number;
  finalImageCacheSets: number;
  finalImageCacheDeletes: number;
  finalImageCacheEventsLast24Hours: number;
  finalImageCacheHitRate: number;
  finalImageCacheCohorts: {
    cohortHash: string;
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    eventsLast24Hours: number;
    hitRate: number;
  }[];
  uptimeSince: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  latencyP99Ms: number | null;
  topKeysByVolume: { keyHash: string; requests: number }[];
  errorRate4xxLast24h: number;
  errorRate5xxLast24h: number;
};

type RequestIdentityInput = {
  configId?: string | null;
  providedKey?: string | null;
};

type PrewarmRunInput = {
  startedAt: number;
  completedAt: number;
  warmed: number;
  skipped: number;
  failed: number;
  staticCount: number;
  tmdbCount: number;
  mdblistCount: number;
  imdbCount: number;
  recentCount: number;
  snapshotCount: number;
  targetCount: number;
};

const hashRequestKey = (value: string): string =>
  createHash('sha256').update(value).digest('hex').slice(0, 16);

const ADMIN_METRICS_RETENTION_DEFAULT_MS = 7 * 24 * 60 * 60 * 1000;
const ADMIN_METRICS_RETENTION_MIN_MS = 24 * 60 * 60 * 1000;
const ADMIN_METRICS_RETENTION_MAX_MS = 365 * 24 * 60 * 60 * 1000;
const ADMIN_METRICS_PRUNE_DEBOUNCE_MS = 60 * 1000;
// Bounded so the first prune on a long-lived install drains gradually instead of
// blocking the event loop on one multi-million-row DELETE.
const ADMIN_METRICS_PRUNE_BATCH_ROWS = 50_000;
const COUNTERS_SEED_FLAG = 'seed:admin_counters';
const FIRST_SEEN_COUNTER = 'requests:first_seen_at';
const COHORT_PREFIX = 'image:final:cohort:';

let lastMetricsPruneAt = 0;
let countersSeededThisProcess = false;

type SqliteDb = ReturnType<typeof getDb>;

const resolveMetricsRetentionMs = () =>
  parseMs(
    process.env.XRDB_ADMIN_METRICS_RETENTION_MS,
    ADMIN_METRICS_RETENTION_DEFAULT_MS,
    ADMIN_METRICS_RETENTION_MIN_MS,
    ADMIN_METRICS_RETENTION_MAX_MS,
  );

const bumpCounter = (db: SqliteDb, name: string, by = 1) => {
  db.prepare(
    'INSERT INTO admin_counters (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = value + excluded.value',
  ).run(name, by);
};

const setCounterIfAbsent = (db: SqliteDb, name: string, value: number) => {
  db.prepare('INSERT OR IGNORE INTO admin_counters (name, value) VALUES (?, ?)').run(name, value);
};

const readCounter = (db: SqliteDb, name: string): number => {
  const row = db.prepare('SELECT value FROM admin_counters WHERE name = ?').get(name) as
    | { value?: number }
    | undefined;
  return Number(row?.value ?? 0);
};

const isFinalImagePrefix = (keyPrefix?: string | null): boolean =>
  keyPrefix === 'image:final' || Boolean(keyPrefix && keyPrefix.startsWith(COHORT_PREFIX));

const counterNamesForCacheEvent = (eventType: string, keyPrefix?: string | null): string[] => {
  const names = [`cache:${eventType}`];
  if (isFinalImagePrefix(keyPrefix)) {
    names.push(`final:${eventType}`);
    if (keyPrefix && keyPrefix.startsWith(COHORT_PREFIX)) {
      names.push(`cohort:${keyPrefix.slice(COHORT_PREFIX.length)}:${eventType}`);
    }
  }
  return names;
};

// Rows older than the retention window are pruned, so lifetime totals live in
// admin_counters. Installs upgrading from unpruned tables seed the counters from the
// existing rows once, before the first prune can remove them.
const ensureAdminCountersSeeded = (db: SqliteDb) => {
  if (countersSeededThisProcess) return;
  if (readCounter(db, COUNTERS_SEED_FLAG) > 0) {
    countersSeededThisProcess = true;
    return;
  }

  const totalRequests = (
    db.prepare('SELECT COUNT(*) as n FROM admin_request_log').get() as { n: number }
  ).n;
  if (totalRequests > 0) bumpCounter(db, 'requests:total', totalRequests);

  const firstRow = db
    .prepare('SELECT created_at FROM admin_request_log ORDER BY created_at ASC LIMIT 1')
    .get() as { created_at: number } | undefined;
  if (firstRow) setCounterIfAbsent(db, FIRST_SEEN_COUNTER, firstRow.created_at);

  const byEventType = db
    .prepare('SELECT event_type, COUNT(*) as n FROM admin_cache_events GROUP BY event_type')
    .all() as { event_type: string; n: number }[];
  for (const row of byEventType) bumpCounter(db, `cache:${row.event_type}`, row.n);

  const finalByEventType = db
    .prepare(
      `SELECT event_type, COUNT(*) as n FROM admin_cache_events
       WHERE (key_prefix = 'image:final' OR key_prefix LIKE 'image:final:cohort:%')
       GROUP BY event_type`,
    )
    .all() as { event_type: string; n: number }[];
  for (const row of finalByEventType) bumpCounter(db, `final:${row.event_type}`, row.n);

  const cohortRows = db
    .prepare(
      `SELECT key_prefix, event_type, COUNT(*) as n FROM admin_cache_events
       WHERE key_prefix LIKE 'image:final:cohort:%'
       GROUP BY key_prefix, event_type`,
    )
    .all() as { key_prefix: string; event_type: string; n: number }[];
  for (const row of cohortRows) {
    bumpCounter(db, `cohort:${row.key_prefix.slice(COHORT_PREFIX.length)}:${row.event_type}`, row.n);
  }

  bumpCounter(db, COUNTERS_SEED_FLAG, 1);
  countersSeededThisProcess = true;
};

const pruneAdminMetrics = (db: SqliteDb, now: number) => {
  if (now - lastMetricsPruneAt < ADMIN_METRICS_PRUNE_DEBOUNCE_MS) return;
  lastMetricsPruneAt = now;
  const cutoff = now - resolveMetricsRetentionMs();
  db.prepare(
    'DELETE FROM admin_request_log WHERE rowid IN (SELECT rowid FROM admin_request_log WHERE created_at < ? LIMIT ?)',
  ).run(cutoff, ADMIN_METRICS_PRUNE_BATCH_ROWS);
  db.prepare(
    'DELETE FROM admin_cache_events WHERE rowid IN (SELECT rowid FROM admin_cache_events WHERE created_at < ? LIMIT ?)',
  ).run(cutoff, ADMIN_METRICS_PRUNE_BATCH_ROWS);
};

export const recordRequest = (
  routeType: RouteType,
  statusCode: number,
  durationMs: number,
  mediaId?: string | null,
  identity?: RequestIdentityInput,
): void => {
  if (!isAdminEnabled()) return;
  try {
    ensureDbInitialized();
    const db = getDb();
    ensureAdminCountersSeeded(db);
    const now = Date.now();
    const configId = identity?.configId?.trim() || null;
    const providedKey = identity?.providedKey?.trim() || '';
    const requestKeyHash = providedKey ? hashRequestKey(providedKey) : null;
    db.prepare(
      `INSERT INTO admin_request_log (id, route_type, status_code, duration_ms, media_id, config_id, request_key_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), routeType, statusCode, durationMs, mediaId ?? null, configId, requestKeyHash, now);
    bumpCounter(db, 'requests:total');
    setCounterIfAbsent(db, FIRST_SEEN_COUNTER, now);
    pruneAdminMetrics(db, now);
  } catch {
  }
};

export const recordCacheEvent = (eventType: 'hit' | 'miss' | 'set' | 'delete', keyPrefix?: string): void => {
  if (!isAdminEnabled()) return;
  try {
    ensureDbInitialized();
    const db = getDb();
    ensureAdminCountersSeeded(db);
    const now = Date.now();
    db.prepare(
      `INSERT INTO admin_cache_events (event_type, key_prefix, created_at) VALUES (?, ?, ?)`,
    ).run(eventType, keyPrefix ?? null, now);
    for (const name of counterNamesForCacheEvent(eventType, keyPrefix)) {
      bumpCounter(db, name, 1);
    }
    pruneAdminMetrics(db, now);
  } catch {
  }
};

export const recordPrewarmRun = (input: PrewarmRunInput): void => {
  if (!isAdminEnabled()) return;
  try {
    ensureDbInitialized();
    getDb()
      .prepare(
        `INSERT INTO admin_prewarm_runs (
          id,
          started_at,
          completed_at,
          warmed,
          skipped,
          failed,
          static_count,
          tmdb_count,
          mdblist_count,
          imdb_count,
          recent_count,
          snapshot_count,
          target_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.startedAt,
        input.completedAt,
        input.warmed,
        input.skipped,
        input.failed,
        input.staticCount,
        input.tmdbCount,
        input.mdblistCount,
        input.imdbCount,
        input.recentCount,
        input.snapshotCount,
        input.targetCount,
      );
  } catch {
  }
};

export const getMetricsSnapshot = (): MetricsSnapshot => {
  ensureDbInitialized();
  const db = getDb();
  ensureAdminCountersSeeded(db);
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const total = readCounter(db, 'requests:total');

  const requestsLastHour = (
    db.prepare('SELECT COUNT(*) as n FROM admin_request_log WHERE created_at >= ?').get(oneHourAgo) as { n: number }
  ).n;

  const requestsLast24Hours = (
    db.prepare('SELECT COUNT(*) as n FROM admin_request_log WHERE created_at >= ?').get(oneDayAgo) as { n: number }
  ).n;

  const byType = db
    .prepare('SELECT route_type, COUNT(*) as n FROM admin_request_log GROUP BY route_type')
    .all() as { route_type: string; n: number }[];

  const byStatus = db
    .prepare('SELECT status_code, COUNT(*) as n FROM admin_request_log GROUP BY status_code')
    .all() as { status_code: number; n: number }[];

  const cacheHits = readCounter(db, 'cache:hit');
  const cacheMisses = readCounter(db, 'cache:miss');
  const cacheSets = readCounter(db, 'cache:set');
  const cacheDeletes = readCounter(db, 'cache:delete');

  const cacheEventsByTypeRows = db
    .prepare("SELECT substr(name, 7) as event_type, value as n FROM admin_counters WHERE name LIKE 'cache:%'")
    .all() as { event_type: string; n: number }[];

  const cacheEventsLast24Hours = (
    db
      .prepare('SELECT COUNT(*) as n FROM admin_cache_events WHERE created_at >= ?')
      .get(oneDayAgo) as { n: number }
  ).n;

  const finalImageCachePrefixClause = "(key_prefix = 'image:final' OR key_prefix LIKE 'image:final:cohort:%')";

  const finalImageCacheHits = readCounter(db, 'final:hit');
  const finalImageCacheMisses = readCounter(db, 'final:miss');
  const finalImageCacheSets = readCounter(db, 'final:set');
  const finalImageCacheDeletes = readCounter(db, 'final:delete');

  const finalImageCacheEventsLast24Hours = (
    db
      .prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE created_at >= ? AND ${finalImageCachePrefixClause}`)
      .get(oneDayAgo) as { n: number }
  ).n;

  const cohortCounterRows = db
    .prepare("SELECT name, value FROM admin_counters WHERE name LIKE 'cohort:%'")
    .all() as { name: string; value: number }[];

  const cohortEvents24hRows = db
    .prepare(
      `SELECT key_prefix, COUNT(*) as n
       FROM admin_cache_events
       WHERE created_at >= ? AND key_prefix LIKE 'image:final:cohort:%'
       GROUP BY key_prefix`,
    )
    .all(oneDayAgo) as { key_prefix: string; n: number }[];

  const cohortEvents24h = new Map<string, number>();
  for (const row of cohortEvents24hRows) {
    cohortEvents24h.set(row.key_prefix.slice(COHORT_PREFIX.length), row.n);
  }

  const finalImageCohortMap = new Map<string, {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    eventsLast24Hours: number;
  }>();

  for (const row of cohortCounterRows) {
    const splitAt = row.name.lastIndexOf(':');
    const cohortHash = row.name.slice('cohort:'.length, splitAt);
    const eventType = row.name.slice(splitAt + 1);
    const existing = finalImageCohortMap.get(cohortHash) ?? {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      eventsLast24Hours: cohortEvents24h.get(cohortHash) ?? 0,
    };

    if (eventType === 'hit') existing.hits += row.value;
    if (eventType === 'miss') existing.misses += row.value;
    if (eventType === 'set') existing.sets += row.value;
    if (eventType === 'delete') existing.deletes += row.value;
    finalImageCohortMap.set(cohortHash, existing);
  }

  const finalImageCacheCohorts = [...finalImageCohortMap.entries()]
    .map(([cohortHash, counts]) => {
      const total = counts.hits + counts.misses;
      return {
        cohortHash,
        ...counts,
        hitRate: total > 0 ? counts.hits / total : 0,
      };
    })
    .sort((left, right) => {
      const leftTotal = left.hits + left.misses + left.sets + left.deletes;
      const rightTotal = right.hits + right.misses + right.sets + right.deletes;
      return rightTotal - leftTotal || left.cohortHash.localeCompare(right.cohortHash);
    })
    .slice(0, 5);

  const activeUsersLastHour = (
    db.prepare(
      `SELECT COUNT(DISTINCT CASE
        WHEN request_key_hash IS NOT NULL THEN 'k:' || request_key_hash
        WHEN config_id IS NOT NULL THEN 'c:' || config_id
        ELSE NULL
      END) as n
      FROM admin_request_log
      WHERE created_at >= ?`,
    ).get(oneHourAgo) as { n: number }
  ).n;

  const activeUsersLast24Hours = (
    db.prepare(
      `SELECT COUNT(DISTINCT CASE
        WHEN request_key_hash IS NOT NULL THEN 'k:' || request_key_hash
        WHEN config_id IS NOT NULL THEN 'c:' || config_id
        ELSE NULL
      END) as n
      FROM admin_request_log
      WHERE created_at >= ?`,
    ).get(oneDayAgo) as { n: number }
  ).n;

  const activeConfigUsersLast24Hours = (
    db.prepare(
      `SELECT COUNT(DISTINCT config_id) as n
       FROM admin_request_log
       WHERE created_at >= ? AND config_id IS NOT NULL`,
    ).get(oneDayAgo) as { n: number }
  ).n;

  const activeKeyUsersLast24Hours = (
    db.prepare(
      `SELECT COUNT(DISTINCT request_key_hash) as n
       FROM admin_request_log
       WHERE created_at >= ? AND request_key_hash IS NOT NULL`,
    ).get(oneDayAgo) as { n: number }
  ).n;

  const trackedIdentityRequestsLast24Hours = (
    db.prepare(
      `SELECT COUNT(*) as n
       FROM admin_request_log
       WHERE created_at >= ? AND (request_key_hash IS NOT NULL OR config_id IS NOT NULL)`,
    ).get(oneDayAgo) as { n: number }
  ).n;

  const anonymousRequestsLast24Hours = requestsLast24Hours - trackedIdentityRequestsLast24Hours;

  const totalActiveConfigProfiles = (
    db.prepare('SELECT COUNT(*) as n FROM config_profiles WHERE is_inactive = 0').get() as { n: number }
  ).n;

  const totalInactiveConfigProfiles = (
    db.prepare('SELECT COUNT(*) as n FROM config_profiles WHERE is_inactive = 1').get() as { n: number }
  ).n;

  const purgeDaysRaw = String(process.env.XRDB_INACTIVE_CONFIG_PURGE_DAYS ?? '').trim();
  const purgeDays = parseInt(purgeDaysRaw, 10);
  let totalConfigProfilesPendingPurge = 0;
  if (Number.isFinite(purgeDays) && purgeDays > 0) {
    const purgeThreshold = Date.now() - purgeDays * 24 * 60 * 60 * 1000;
    const result = db.prepare(
      'SELECT COUNT(*) as n FROM config_profiles WHERE is_inactive = 1 AND inactive_marked_at IS NOT NULL AND inactive_marked_at < ?',
    ).get(purgeThreshold) as { n: number };
    totalConfigProfilesPendingPurge = result.n;
  }

  const prewarmAggregate = db.prepare(
    'SELECT COUNT(*) as runs, COALESCE(SUM(warmed), 0) as warmed, COALESCE(SUM(failed), 0) as failed FROM admin_prewarm_runs',
  ).get() as { runs: number; warmed: number; failed: number };

  const prewarmLast = db.prepare(
    `SELECT completed_at, warmed, skipped, failed, static_count, tmdb_count, mdblist_count,
            imdb_count, recent_count, snapshot_count, target_count
     FROM admin_prewarm_runs
     ORDER BY completed_at DESC
     LIMIT 1`,
  ).get() as {
    completed_at: number;
    warmed: number;
    skipped: number;
    failed: number;
    static_count: number;
    tmdb_count: number;
    mdblist_count: number;
    imdb_count: number;
    recent_count: number;
    snapshot_count: number;
    target_count: number;
  } | undefined;

  const firstSeenAt = readCounter(db, FIRST_SEEN_COUNTER);

  // Most recent 10k samples walk the created_at index; sorting in process avoids a
  // full sort of the 24h window inside SQLite on every metrics poll.
  const latencySamples = (
    db
      .prepare(
        `SELECT duration_ms FROM admin_request_log WHERE created_at >= ? ORDER BY created_at DESC LIMIT 10000`,
      )
      .all(oneDayAgo) as { duration_ms: number }[]
  )
    .map((row) => row.duration_ms)
    .sort((a, b) => a - b);

  const computePercentile = (sorted: number[], pct: number): number | null => {
    if (sorted.length < 20) return null;
    return sorted[Math.floor(sorted.length * pct)];
  };

  const latencyP50Ms = computePercentile(latencySamples, 0.5);
  const latencyP95Ms = computePercentile(latencySamples, 0.95);
  const latencyP99Ms = computePercentile(latencySamples, 0.99);

  const topKeyRows = db
    .prepare(
      `SELECT request_key_hash, COUNT(*) as n
       FROM admin_request_log
       WHERE created_at >= ? AND request_key_hash IS NOT NULL
       GROUP BY request_key_hash
       ORDER BY n DESC
       LIMIT 10`,
    )
    .all(oneDayAgo) as { request_key_hash: string; n: number }[];

  const topKeysByVolume = topKeyRows.map((r) => ({ keyHash: r.request_key_hash, requests: r.n }));

  const errors4xx = (
    db.prepare(
      `SELECT COUNT(*) as n FROM admin_request_log WHERE created_at >= ? AND status_code >= 400 AND status_code < 500`,
    ).get(oneDayAgo) as { n: number }
  ).n;

  const errors5xx = (
    db.prepare(
      `SELECT COUNT(*) as n FROM admin_request_log WHERE created_at >= ? AND status_code >= 500`,
    ).get(oneDayAgo) as { n: number }
  ).n;

  const countsByType: Record<string, number> = {};
  for (const row of byType) {
    countsByType[row.route_type] = row.n;
  }

  const countsByStatus: Record<string, number> = {};
  for (const row of byStatus) {
    countsByStatus[String(row.status_code)] = row.n;
  }

  const cacheEventsByType: Record<string, number> = {};
  for (const row of cacheEventsByTypeRows) {
    cacheEventsByType[row.event_type] = row.n;
  }

  const cacheTotal = cacheHits + cacheMisses;
  const finalImageCacheTotal = finalImageCacheHits + finalImageCacheMisses;

  return {
    totalRequests: total,
    requestsLastHour,
    requestsLast24Hours,
    countsByType,
    countsByStatus,
    cacheHits,
    cacheMisses,
    cacheSets,
    cacheDeletes,
    cacheEventsLast24Hours,
    cacheEventsByType,
    trackedIdentityRequestsLast24Hours,
    anonymousRequestsLast24Hours,
    activeUsersLastHour,
    activeUsersLast24Hours,
    activeConfigUsersLast24Hours,
    activeKeyUsersLast24Hours,
    totalActiveConfigProfiles,
    totalInactiveConfigProfiles,
    totalConfigProfilesPendingPurge,
    prewarmRuns: prewarmAggregate.runs,
    prewarmTotalWarmed: prewarmAggregate.warmed,
    prewarmTotalFailed: prewarmAggregate.failed,
    prewarmLastRunAt: prewarmLast?.completed_at ?? null,
    prewarmLastSummary: prewarmLast
      ? {
          warmed: prewarmLast.warmed,
          skipped: prewarmLast.skipped,
          failed: prewarmLast.failed,
          staticCount: prewarmLast.static_count,
          tmdbCount: prewarmLast.tmdb_count,
          mdblistCount: prewarmLast.mdblist_count,
          imdbCount: prewarmLast.imdb_count,
          recentCount: prewarmLast.recent_count,
          snapshotCount: prewarmLast.snapshot_count,
          targetCount: prewarmLast.target_count,
        }
      : null,
    cacheHitRate: cacheTotal > 0 ? cacheHits / cacheTotal : 0,
    finalImageCacheHits,
    finalImageCacheMisses,
    finalImageCacheSets,
    finalImageCacheDeletes,
    finalImageCacheEventsLast24Hours,
    finalImageCacheHitRate: finalImageCacheTotal > 0 ? finalImageCacheHits / finalImageCacheTotal : 0,
    finalImageCacheCohorts,
    uptimeSince: firstSeenAt > 0 ? firstSeenAt : null,
    latencyP50Ms,
    latencyP95Ms,
    latencyP99Ms,
    topKeysByVolume,
    errorRate4xxLast24h: requestsLast24Hours > 0 ? errors4xx / requestsLast24Hours : 0,
    errorRate5xxLast24h: requestsLast24Hours > 0 ? errors5xx / requestsLast24Hours : 0,
  };
};

export const getRecentRequests = (limit = 100): RequestLogEntry[] => {
  ensureDbInitialized();
  const rows = getDb()
    .prepare(
      `SELECT id, route_type, status_code, duration_ms, media_id, config_id, request_key_hash, created_at
       FROM admin_request_log ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as RequestLogRow[];

  return rows.map((r) => ({
    id: r.id,
    routeType: r.route_type,
    statusCode: r.status_code,
    durationMs: r.duration_ms,
    mediaId: r.media_id,
    configId: r.config_id,
    requestKeyHash: r.request_key_hash,
    createdAt: r.created_at,
  }));
};

export const clearRequestLog = (): void => {
  ensureDbInitialized();
  const db = getDb();
  db.prepare('DELETE FROM admin_request_log').run();
  db.prepare('DELETE FROM admin_counters WHERE name IN (?, ?)').run('requests:total', FIRST_SEEN_COUNTER);
};

export const clearCacheEvents = (): void => {
  ensureDbInitialized();
  const db = getDb();
  db.prepare('DELETE FROM admin_cache_events').run();
  db.prepare(
    "DELETE FROM admin_counters WHERE name LIKE 'cache:%' OR name LIKE 'final:%' OR name LIKE 'cohort:%'",
  ).run();
};

export const getCacheEventStats = (): { hits: number; misses: number; hitRate: number } => {
  ensureDbInitialized();
  const db = getDb();
  ensureAdminCountersSeeded(db);
  const hits = readCounter(db, 'cache:hit');
  const misses = readCounter(db, 'cache:miss');
  const total = hits + misses;
  return { hits, misses, hitRate: total > 0 ? hits / total : 0 };
};
