import { createHash, randomUUID } from 'crypto';
import { getDb, ensureDbInitialized } from './sqliteStore.ts';
import { isAdminEnabled } from './adminAuth.ts';

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
  totalConfigProfiles: number;
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
    const configId = identity?.configId?.trim() || null;
    const providedKey = identity?.providedKey?.trim() || '';
    const requestKeyHash = providedKey ? hashRequestKey(providedKey) : null;
    getDb()
      .prepare(
        `INSERT INTO admin_request_log (id, route_type, status_code, duration_ms, media_id, config_id, request_key_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), routeType, statusCode, durationMs, mediaId ?? null, configId, requestKeyHash, Date.now());
  } catch {
  }
};

export const recordCacheEvent = (eventType: 'hit' | 'miss' | 'set' | 'delete', keyPrefix?: string): void => {
  if (!isAdminEnabled()) return;
  try {
    ensureDbInitialized();
    getDb()
      .prepare(
        `INSERT INTO admin_cache_events (event_type, key_prefix, created_at) VALUES (?, ?, ?)`,
      )
      .run(eventType, keyPrefix ?? null, Date.now());
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
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  const total = (
    db.prepare('SELECT COUNT(*) as n FROM admin_request_log').get() as { n: number }
  ).n;

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

  const cacheHits = (
    db
      .prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE event_type = 'hit'`)
      .get() as { n: number }
  ).n;

  const cacheMisses = (
    db
      .prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE event_type = 'miss'`)
      .get() as { n: number }
  ).n;

  const cacheSets = (
    db
      .prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE event_type = 'set'`)
      .get() as { n: number }
  ).n;

  const cacheDeletes = (
    db
      .prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE event_type = 'delete'`)
      .get() as { n: number }
  ).n;

  const cacheEventsByTypeRows = db
    .prepare('SELECT event_type, COUNT(*) as n FROM admin_cache_events GROUP BY event_type')
    .all() as { event_type: string; n: number }[];

  const cacheEventsLast24Hours = (
    db
      .prepare('SELECT COUNT(*) as n FROM admin_cache_events WHERE created_at >= ?')
      .get(oneDayAgo) as { n: number }
  ).n;

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

  const totalConfigProfiles = (
    db.prepare('SELECT COUNT(*) as n FROM config_profiles').get() as { n: number }
  ).n;

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

  const firstRow = db
    .prepare('SELECT created_at FROM admin_request_log ORDER BY created_at ASC LIMIT 1')
    .get() as { created_at: number } | undefined;

  const latencyRows = db
    .prepare(
      `SELECT duration_ms FROM admin_request_log WHERE created_at >= ? ORDER BY duration_ms LIMIT 10000`,
    )
    .all(oneDayAgo) as { duration_ms: number }[];

  const computePercentile = (sorted: { duration_ms: number }[], pct: number): number | null => {
    if (sorted.length < 20) return null;
    return sorted[Math.floor(sorted.length * pct)].duration_ms;
  };

  const latencyP50Ms = computePercentile(latencyRows, 0.5);
  const latencyP95Ms = computePercentile(latencyRows, 0.95);
  const latencyP99Ms = computePercentile(latencyRows, 0.99);

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
    totalConfigProfiles,
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
    uptimeSince: firstRow?.created_at ?? null,
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
  getDb().prepare('DELETE FROM admin_request_log').run();
};

export const clearCacheEvents = (): void => {
  ensureDbInitialized();
  getDb().prepare('DELETE FROM admin_cache_events').run();
};

export const getCacheEventStats = (): { hits: number; misses: number; hitRate: number } => {
  ensureDbInitialized();
  const db = getDb();
  const hits = (
    db.prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE event_type = 'hit'`).get() as { n: number }
  ).n;
  const misses = (
    db.prepare(`SELECT COUNT(*) as n FROM admin_cache_events WHERE event_type = 'miss'`).get() as { n: number }
  ).n;
  const total = hits + misses;
  return { hits, misses, hitRate: total > 0 ? hits / total : 0 };
};
