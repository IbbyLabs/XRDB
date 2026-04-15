import { fetchJsonCached, fetchTextCached } from './imageRouteCachedFetch.ts';
import { resolveImageRouteRequestState, type ImageRouteRequestInput } from './imageRouteRequestState.ts';
import { executeImageRouteRender } from './imageRouteExecution.ts';
import { createConcurrencyLimit, type PhaseDurations, type RenderedImagePayload } from './imageRouteRuntime.ts';
import { logger } from './serverLogger.ts';
import { readPosterWarmSource, resolvePosterCacheWarmConfig } from './posterCacheWarmConfig.ts';

type PosterWarmSummary = {
  warmed: number;
  skipped: number;
  failed: number;
};

type PosterWarmSchedulerState = typeof globalThis & {
  __xrdbPosterWarmInFlight?: Promise<PosterWarmSummary> | null;
  __xrdbPosterWarmLastCheckAt?: number;
  __xrdbPosterWarmLastRunAt?: number;
  __xrdbPosterWarmRenderInFlight?: Map<string, Promise<RenderedImagePayload>>;
};

const getSchedulerState = () => globalThis as PosterWarmSchedulerState;

const createPosterWarmRequest = (targetId: string): ImageRouteRequestInput => ({
  nextUrl: {
    searchParams: new URL(`https://xrdb.internal/poster/${encodeURIComponent(targetId)}.jpg`).searchParams,
  },
  headers: new Headers({
    accept: 'image/jpeg',
  }),
});

const warmPosterTarget = async (targetId: string) => {
  const request = createPosterWarmRequest(targetId);
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

export const runPosterCacheWarm = async () => {
  const config = resolvePosterCacheWarmConfig();
  const targets = readPosterWarmSource(config);
  if (!config.enabled || targets.length === 0) {
    return { warmed: 0, skipped: targets.length === 0 ? 0 : targets.length, failed: 0 } satisfies PosterWarmSummary;
  }

  const limit = createConcurrencyLimit(config.concurrency);
  const summary: PosterWarmSummary = {
    warmed: 0,
    skipped: 0,
    failed: 0,
  };

  await Promise.all(
    targets.map((targetId) =>
      limit(async () => {
        try {
          await warmPosterTarget(targetId);
          summary.warmed += 1;
        } catch (error) {
          summary.failed += 1;
          logger.warn(
            `[XRDB] poster warm failed for ${targetId}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }),
    ),
  );

  if (config.logEnabled || summary.failed > 0) {
    logger.info(
      `[XRDB] poster warm summary warmed=${summary.warmed} skipped=${summary.skipped} failed=${summary.failed}`,
    );
  }

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