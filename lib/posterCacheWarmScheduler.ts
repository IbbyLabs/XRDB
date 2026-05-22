import { fetchJsonCached, fetchTextCached } from './imageRouteCachedFetch.ts';
import { getMetadata, setMetadata } from './metadataStore.ts';
import {
  CACHE_HARDENING_PREWARM_POPULARITY,
  CACHE_HARDENING_SNAPSHOT_RESTORE,
} from './imageRouteConfig.ts';
import { resolveImageRouteRequestState, type ImageRouteRequestInput } from './imageRouteRequestState.ts';
import { executeImageRouteRender } from './imageRouteExecution.ts';
import { createConcurrencyLimit, type PhaseDurations, type RenderedImagePayload } from './imageRouteRuntime.ts';
import { fetchImdbTopRatedIds, fetchMdblistTrendingIds, fetchTmdbPopularIds } from './posterCacheWarmDynamicSources.ts';
import { getRecentPosterEntries } from './posterCacheWarmRecentRing.ts';
import { buildPosterWarmSearchParams } from './posterCacheWarmSearchParams.ts';
import { logger } from './serverLogger.ts';
import { readPosterWarmSource, resolvePosterCacheWarmConfig } from './posterCacheWarmConfig.ts';
import { recordPrewarmRun } from './adminMetrics.ts';
import { XRDB_REQUEST_KEY_QUERY_PARAM } from './xrdbRequestKey.ts';

const PREWARM_SNAPSHOT_KEY = 'prewarm:hot_snapshot';
const PREWARM_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type PrewarmSnapshot = {
  targets: string[];
  savedAt: number;
};

export const loadPrewarmSnapshot = (): string[] => {
  if (!CACHE_HARDENING_SNAPSHOT_RESTORE) return [];
  const snap = getMetadata<PrewarmSnapshot>(PREWARM_SNAPSHOT_KEY);
  return snap?.targets ?? [];
};

export const savePrewarmSnapshot = (targets: string[]): void => {
  if (!CACHE_HARDENING_SNAPSHOT_RESTORE || targets.length === 0) return;
  setMetadata(PREWARM_SNAPSHOT_KEY, { targets: targets.slice(0, 1000), savedAt: Date.now() }, PREWARM_SNAPSHOT_TTL_MS);
};

export const rankTargetsByPopularity = (
  targets: string[],
  recentEntries: Array<{ id: string; searchParams: URLSearchParams }>,
): string[] => {
  if (!CACHE_HARDENING_PREWARM_POPULARITY || recentEntries.length === 0) return targets;
  const freq = new Map<string, number>();
  for (const { id } of recentEntries) {
    freq.set(id, (freq.get(id) ?? 0) + 1);
  }
  return [...targets].sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0));
};

type PosterWarmSummary = {
  warmed: number;
  skipped: number;
  failed: number;
};

type PosterWarmTargetSet = {
  targets: string[];
  recentEntries: Array<{ id: string; searchParams: URLSearchParams }>;
  staticCount: number;
  tmdbCount: number;
  mdblistCount: number;
  imdbCount: number;
  recentCount: number;
  snapshotCount: number;
};

type PosterWarmSchedulerState = typeof globalThis & {
  __xrdbPosterWarmInFlight?: Promise<PosterWarmSummary> | null;
  __xrdbPosterWarmLastCheckAt?: number;
  __xrdbPosterWarmLastRunAt?: number;
  __xrdbPosterWarmRenderInFlight?: Map<string, Promise<RenderedImagePayload>>;
};

const getSchedulerState = () => globalThis as PosterWarmSchedulerState;

const createPosterWarmRequest = (
  targetId: string,
  extraSearchParams?: URLSearchParams,
  cacheUuid?: string,
): ImageRouteRequestInput => {
  const url = new URL(`https://xrdb.internal/poster/${encodeURIComponent(targetId)}.jpg`);
  const warmSearchParams = buildPosterWarmSearchParams(extraSearchParams);
  for (const [key, value] of warmSearchParams) {
    url.searchParams.set(key, value);
  }
  if (cacheUuid) {
    url.searchParams.set(XRDB_REQUEST_KEY_QUERY_PARAM, cacheUuid);
  }
  return {
    nextUrl: {
      searchParams: url.searchParams,
    },
    headers: new Headers({
      accept: 'image/jpeg',
    }),
  };
};

const warmPosterTarget = async (
  targetId: string,
  extraSearchParams?: URLSearchParams,
  cacheUuid?: string,
) => {
  const request = createPosterWarmRequest(targetId, extraSearchParams, cacheUuid);
  const phases: PhaseDurations = {
    auth: 0,
    tmdb: 0,
    mdb: 0,
    fanart: 0,
    stream: 0,
    render: 0,
  };
  const state = getSchedulerState();
  const finalImageInFlight = state.__xrdbPosterWarmRenderInFlight || new Map<string, Promise<RenderedImagePayload>>();
  state.__xrdbPosterWarmRenderInFlight = finalImageInFlight;

  const requestState = await resolveImageRouteRequestState({
    request,
    imageType: 'poster',
    id: `${targetId}.jpg`,
  });

  await executeImageRouteRender({
    requestState,
    phases,
    fetchJsonCached,
    fetchTextCached,
    finalImageInFlight,
  });
};

export const resolvePosterWarmTargets = async ({
  config,
  fetchTmdbIds = fetchTmdbPopularIds,
  fetchMdblistIds = fetchMdblistTrendingIds,
  fetchImdbIds = fetchImdbTopRatedIds,
  fetchRecentEntries = getRecentPosterEntries,
}: {
  config: ReturnType<typeof resolvePosterCacheWarmConfig>;
  fetchTmdbIds?: typeof fetchTmdbPopularIds;
  fetchMdblistIds?: typeof fetchMdblistTrendingIds;
  fetchImdbIds?: typeof fetchImdbTopRatedIds;
  fetchRecentEntries?: typeof getRecentPosterEntries;
}): Promise<PosterWarmTargetSet> => {
  const staticTargets = readPosterWarmSource(config);
  const [tmdbTargets, mdblistTargets, imdbTargets] = await Promise.all([
    fetchTmdbIds({ config }),
    fetchMdblistIds({ config }),
    fetchImdbIds({ config }),
  ]);
  const recentEntries = config.recentEnabled ? fetchRecentEntries(config.recentLimit) : [];
  const snapshotTargets = loadPrewarmSnapshot();
  const mergedSet = new Set([...snapshotTargets, ...staticTargets, ...tmdbTargets, ...mdblistTargets, ...imdbTargets]);
  const targets = rankTargetsByPopularity([...mergedSet], recentEntries);

  if (config.logEnabled) {
    logger.info(
      `[XRDB] poster warm targets static=${staticTargets.length} tmdb=${tmdbTargets.length} mdblist=${mdblistTargets.length} imdb=${imdbTargets.length} recent=${recentEntries.length} snapshot=${snapshotTargets.length} merged=${targets.length}`,
    );
  }

  return {
    targets,
    recentEntries,
    staticCount: staticTargets.length,
    tmdbCount: tmdbTargets.length,
    mdblistCount: mdblistTargets.length,
    imdbCount: imdbTargets.length,
    recentCount: recentEntries.length,
    snapshotCount: snapshotTargets.length,
  };
};

export const runPosterCacheWarm = async () => {
  const startedAt = Date.now();
  const config = resolvePosterCacheWarmConfig();
  const { targets, recentEntries, staticCount, tmdbCount, mdblistCount, imdbCount, recentCount, snapshotCount } =
    await resolvePosterWarmTargets({ config });
  const totalTargets = targets.length + recentEntries.length;
  if (!config.enabled || totalTargets === 0) {
    return { warmed: 0, skipped: 0, failed: 0 } satisfies PosterWarmSummary;
  }
  if (targets.length > 0) {
    savePrewarmSnapshot(targets);
  }

  const limit = createConcurrencyLimit(config.concurrency);
  const summary: PosterWarmSummary = {
    warmed: 0,
    skipped: 0,
    failed: 0,
  };

  const cacheUuids = config.cacheUuids.length > 0 ? config.cacheUuids : [null];

  await Promise.all(
    targets.flatMap((targetId) =>
      cacheUuids.map((cacheUuid) =>
        limit(async () => {
          try {
            await warmPosterTarget(targetId, undefined, cacheUuid || undefined);
            summary.warmed += 1;
          } catch (error) {
            summary.failed += 1;
            logger.warn(
              `[XRDB] poster warm failed for ${targetId}${cacheUuid ? ` (uuid)` : ''}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }),
      ),
    ),
  );

  await Promise.all(
    recentEntries.flatMap(({ id, searchParams }) =>
      cacheUuids.map((cacheUuid) =>
        limit(async () => {
          try {
            await warmPosterTarget(id, searchParams, cacheUuid || undefined);
            summary.warmed += 1;
          } catch (error) {
            summary.failed += 1;
            logger.warn(
              `[XRDB] poster warm failed for recent entry ${id}${cacheUuid ? ` (uuid)` : ''}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }),
      ),
    ),
  );

  if (config.logEnabled || summary.failed > 0) {
    logger.info(
      `[XRDB] poster warm summary warmed=${summary.warmed} skipped=${summary.skipped} failed=${summary.failed}`,
    );
  }

  recordPrewarmRun({
    startedAt,
    completedAt: Date.now(),
    warmed: summary.warmed,
    skipped: summary.skipped,
    failed: summary.failed,
    staticCount,
    tmdbCount,
    mdblistCount,
    imdbCount,
    recentCount,
    snapshotCount,
    targetCount: totalTargets,
  });

  return summary;
};

type PosterCacheWarmScheduleOptions = {
  now?: () => number;
  resolveConfig?: typeof resolvePosterCacheWarmConfig;
  runWarm?: typeof runPosterCacheWarm;
};

export const resetPosterCacheWarmSchedulerForTests = () => {
  const state = getSchedulerState();
  state.__xrdbPosterWarmInFlight = null;
  state.__xrdbPosterWarmLastCheckAt = 0;
  state.__xrdbPosterWarmLastRunAt = 0;
  state.__xrdbPosterWarmRenderInFlight = new Map();
};

export const schedulePosterCacheWarm = (options: PosterCacheWarmScheduleOptions = {}) => {
  const config = (options.resolveConfig || resolvePosterCacheWarmConfig)();
  if (!config.enabled) {
    return;
  }

  const state = getSchedulerState();
  const now = (options.now || Date.now)();
  if (state.__xrdbPosterWarmInFlight) {
    return;
  }
  if (now - (state.__xrdbPosterWarmLastCheckAt || 0) < config.checkIntervalMs) {
    return;
  }

  state.__xrdbPosterWarmLastCheckAt = now;
  if (state.__xrdbPosterWarmLastRunAt && now - state.__xrdbPosterWarmLastRunAt < config.intervalMs) {
    return;
  }

  state.__xrdbPosterWarmLastRunAt = now;
  const runWarm = options.runWarm || runPosterCacheWarm;
  state.__xrdbPosterWarmInFlight = runWarm()
    .catch((error) => {
      logger.warn('[XRDB] poster warm run failed:', error instanceof Error ? error.message : error);
      return { warmed: 0, skipped: 0, failed: 1 };
    })
    .finally(() => {
      state.__xrdbPosterWarmInFlight = null;
    });
};