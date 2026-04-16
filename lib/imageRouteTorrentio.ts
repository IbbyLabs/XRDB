import { fetch as undiciFetch, type Dispatcher } from 'undici';

import { deleteMetadata, getMetadata, setMetadata } from './metadataStore.ts';
import { buildTorrentioStreamUrl } from './torrentioUrl.ts';
import {
  CACHE_HARDENING_AUTO_TUNE,
  CACHE_HARDENING_CIRCUIT_BREAKER,
  CACHE_HARDENING_NEGATIVE_CACHE,
  CACHE_HARDENING_PROVIDER_BUDGETS,
  CACHE_HARDENING_SWR,
  TORRENTIO_ADAPTIVE_CACHE_ENABLED,
  TORRENTIO_BASE_URL,
  TORRENTIO_BUDGET_REQUESTS_PER_WINDOW,
  TORRENTIO_BUDGET_WINDOW_MS,
  TORRENTIO_CACHE_TTL_MS,
  TORRENTIO_CIRCUIT_COOLDOWN_MS,
  TORRENTIO_CIRCUIT_FAILURE_THRESHOLD,
  TORRENTIO_CIRCUIT_WINDOW_MS,
  TORRENTIO_CONCURRENCY,
  TORRENTIO_DISPATCHER,
  TORRENTIO_FALLBACK_BASE_URL,
  TORRENTIO_FRESH_TTL_MS,
  TORRENTIO_FRESH_WINDOW_MS,
  TORRENTIO_NEGATIVE_CACHE_TTL_MS,
  TORRENTIO_RATE_LIMIT_COOLDOWN_MS,
  TORRENTIO_STABLE_TTL_MS,
  TORRENTIO_SWR_WINDOW_MS,
  TORRENTIO_TIMEOUT_MS,
  TORRENTIO_WARM_TTL_MS,
  TORRENTIO_WARM_WINDOW_MS,
  type BadgeKey,
} from './imageRouteConfig.ts';
import {
  createConcurrencyLimit,
  getDeterministicTtlMs,
  measurePhase,
  parseRetryAfterMs,
  withDedupe,
  type PhaseDurations,
} from './imageRouteRuntime.ts';
import {
  buildMediaFeatureBadgesFromFlags,
  collectMediaFeatureFlags,
  type MediaFeatureFlags,
  type RemuxDisplayMode,
} from './mediaFeatures.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';
import { logger } from './serverLogger.ts';

type TorrentioBadgeCache = {
  flags: MediaFeatureFlags;
};

export type TorrentioRatingBadge = {
  key: BadgeKey;
  label: string;
  value: string;
  iconUrl: string;
  accentColor: string;
};

export type TorrentioBadgeResult = {
  badges: TorrentioRatingBadge[];
  cacheTtlMs: number;
  cacheHit?: boolean;
  selectedBaseUrl?: string | null;
};

const torrentioInFlight = new Map<string, Promise<TorrentioBadgeResult>>();
let torrentioRateLimitedUntil = 0;
const torrentioConcurrencyLimit = createConcurrencyLimit(TORRENTIO_CONCURRENCY);

export type RecencyBucket = 'fresh' | 'warm' | 'stable';

type RecencyClassification = {
  bucket: RecencyBucket;
  source: string;
  ageMs: number | null;
};

export const classifyStreamCacheRecencyBucket = ({
  mediaType,
  releaseDate,
  episodeAirDate,
  freshWindowMs,
  warmWindowMs,
}: {
  mediaType: 'movie' | 'series';
  releaseDate?: string | null;
  episodeAirDate?: string | null;
  freshWindowMs: number;
  warmWindowMs: number;
}): RecencyClassification => {
  const useEpisodeDate = mediaType === 'series' && Boolean(episodeAirDate);
  const dateStr = useEpisodeDate ? episodeAirDate : releaseDate;
  const source = useEpisodeDate ? 'episode_air_date' : (releaseDate ? 'release_date' : 'missing');

  if (!dateStr) {
    return { bucket: 'warm', source: 'missing', ageMs: null };
  }

  const normalized = String(dateStr).trim();
  const timestamp = normalized.includes('T') ? Date.parse(normalized) : Date.parse(`${normalized}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) {
    return { bucket: 'warm', source: 'invalid', ageMs: null };
  }

  const ageMs = Date.now() - timestamp;
  if (ageMs <= freshWindowMs) {
    return { bucket: 'fresh', source, ageMs };
  }
  if (ageMs <= warmWindowMs) {
    return { bucket: 'warm', source, ageMs };
  }
  return { bucket: 'stable', source, ageMs };
};

export const getAdaptiveStreamCacheTtlMs = ({
  id,
  mediaType,
  releaseDate,
  episodeAirDate,
}: {
  id: string;
  mediaType: 'movie' | 'series';
  releaseDate?: string | null;
  episodeAirDate?: string | null;
}): number => {
  if (!TORRENTIO_ADAPTIVE_CACHE_ENABLED) {
    return getDeterministicTtlMs(TORRENTIO_CACHE_TTL_MS, id);
  }

  const classification = classifyStreamCacheRecencyBucket({
    mediaType,
    releaseDate,
    episodeAirDate,
    freshWindowMs: TORRENTIO_FRESH_WINDOW_MS,
    warmWindowMs: TORRENTIO_WARM_WINDOW_MS,
  });

  const bucketTtlMap: Record<RecencyBucket, number> = {
    fresh: TORRENTIO_FRESH_TTL_MS,
    warm: TORRENTIO_WARM_TTL_MS,
    stable: TORRENTIO_STABLE_TTL_MS,
  };

  const ttlMs = getDeterministicTtlMs(bucketTtlMap[classification.bucket], id);
  logger.request(
    `[XRDB] adaptive stream cache id=${id} bucket=${classification.bucket} source=${classification.source} ttl=${ttlMs}ms`,
  );
  return ttlMs;
};

type CircuitState = {
  failures: number[];
  openUntil: number;
};

const torrentioCircuit = new Map<string, CircuitState>();

const isCircuitOpen = (baseUrl: string, now: number): boolean => {
  if (!CACHE_HARDENING_CIRCUIT_BREAKER) return false;
  const state = torrentioCircuit.get(baseUrl);
  if (!state) return false;
  if (state.openUntil > now) return true;
  const windowStart = now - TORRENTIO_CIRCUIT_WINDOW_MS;
  state.failures = state.failures.filter((t) => t > windowStart);
  return false;
};

const recordCircuitFailure = (baseUrl: string, now: number): void => {
  if (!CACHE_HARDENING_CIRCUIT_BREAKER) return;
  let state = torrentioCircuit.get(baseUrl);
  if (!state) {
    state = { failures: [], openUntil: 0 };
    torrentioCircuit.set(baseUrl, state);
  }
  const windowStart = now - TORRENTIO_CIRCUIT_WINDOW_MS;
  state.failures = state.failures.filter((t) => t > windowStart);
  state.failures.push(now);
  if (state.failures.length >= TORRENTIO_CIRCUIT_FAILURE_THRESHOLD) {
    state.openUntil = now + TORRENTIO_CIRCUIT_COOLDOWN_MS;
    logger.warn(`[XRDB] circuit breaker opened for ${baseUrl} until ${new Date(state.openUntil).toISOString()}`);
  }
};

const recordCircuitSuccess = (baseUrl: string): void => {
  if (!CACHE_HARDENING_CIRCUIT_BREAKER) return;
  const state = torrentioCircuit.get(baseUrl);
  if (state) {
    state.failures = [];
    state.openUntil = 0;
  }
};

type BudgetState = {
  windowStart: number;
  count: number;
};

const torrentioBudget = new Map<string, BudgetState>();

const isBudgetExhausted = (baseUrl: string, now: number): boolean => {
  if (!CACHE_HARDENING_PROVIDER_BUDGETS) return false;
  let state = torrentioBudget.get(baseUrl);
  if (!state) {
    state = { windowStart: now, count: 0 };
    torrentioBudget.set(baseUrl, state);
  }
  if (now - state.windowStart > TORRENTIO_BUDGET_WINDOW_MS) {
    state.windowStart = now;
    state.count = 0;
  }
  return state.count >= TORRENTIO_BUDGET_REQUESTS_PER_WINDOW;
};

const consumeBudget = (baseUrl: string, now: number): void => {
  if (!CACHE_HARDENING_PROVIDER_BUDGETS) return;
  const state = torrentioBudget.get(baseUrl);
  if (state) state.count += 1;
};

export const resetTorrentioHardeningStateForTests = (): void => {
  torrentioCircuit.clear();
  torrentioBudget.clear();
};

type AutoTuneStatKey = 'hits' | 'misses' | 'errors' | 'negativeCaches' | 'swrServes' | 'circuitSkips' | 'budgetSkips';

type AutoTuneStats = {
  hits: number;
  misses: number;
  errors: number;
  negativeCaches: number;
  swrServes: number;
  circuitSkips: number;
  budgetSkips: number;
  windowStart: number;
};

const autoTuneStats: AutoTuneStats = {
  hits: 0,
  misses: 0,
  errors: 0,
  negativeCaches: 0,
  swrServes: 0,
  circuitSkips: 0,
  budgetSkips: 0,
  windowStart: Date.now(),
};

const AUTO_TUNE_LOG_INTERVAL_MS = 10 * 60 * 1000;

export const recordAutoTuneStat = (event: AutoTuneStatKey): void => {
  if (!CACHE_HARDENING_AUTO_TUNE) return;
  autoTuneStats[event] += 1;
  const now = Date.now();
  if (now - autoTuneStats.windowStart >= AUTO_TUNE_LOG_INTERVAL_MS) {
    const total = autoTuneStats.hits + autoTuneStats.misses;
    const hitRate = total > 0 ? ((autoTuneStats.hits / total) * 100).toFixed(1) : 'n/a';
    const negativeRate = autoTuneStats.misses > 0 ? ((autoTuneStats.negativeCaches / autoTuneStats.misses) * 100).toFixed(1) : 'n/a';
    logger.info(
      `[XRDB] auto-tune observe hits=${autoTuneStats.hits} misses=${autoTuneStats.misses} errors=${autoTuneStats.errors} hit_rate=${hitRate}% negatives=${autoTuneStats.negativeCaches} negative_rate=${negativeRate}% swr=${autoTuneStats.swrServes} circuit_skips=${autoTuneStats.circuitSkips} budget_skips=${autoTuneStats.budgetSkips}`,
    );
    autoTuneStats.hits = 0;
    autoTuneStats.misses = 0;
    autoTuneStats.errors = 0;
    autoTuneStats.negativeCaches = 0;
    autoTuneStats.swrServes = 0;
    autoTuneStats.circuitSkips = 0;
    autoTuneStats.budgetSkips = 0;
    autoTuneStats.windowStart = now;
  }
};

export const getAutoTuneStatsForTests = (): AutoTuneStats => ({ ...autoTuneStats });

export const extractTorrentioFilenames = (payload: any) => {
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const filenames: string[] = [];
  for (const stream of streams) {
    const filename =
      (typeof stream?.filename === 'string' && stream.filename) ||
      (typeof stream?.behaviorHints?.filename === 'string' && stream.behaviorHints.filename) ||
      (typeof stream?.title === 'string' && stream.title) ||
      (typeof stream?.name === 'string' && stream.name) ||
      '';
    if (filename) filenames.push(filename);
  }
  return filenames;
};

const buildFeatureBadgesFromFlags = (flags: MediaFeatureFlags, remuxDisplayMode: RemuxDisplayMode = 'composite'): TorrentioRatingBadge[] =>
  buildMediaFeatureBadgesFromFlags(flags, remuxDisplayMode).map((badge) => ({
    key: badge.key,
    label: badge.label,
    value: '',
    iconUrl: '',
    accentColor: badge.accentColor,
  }));

const resolveTorrentioCacheState = ({
  type,
  id,
  cacheTtlMs,
}: {
  type: 'movie' | 'series';
  id: string;
  cacheTtlMs?: number;
  dispatcher?: Dispatcher;
}) => {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return null;
  }

  const cacheKey = `torrentio:${type}:${trimmedId}`;
  const ttlMs =
    typeof cacheTtlMs === 'number' && Number.isFinite(cacheTtlMs) && cacheTtlMs > 0
      ? cacheTtlMs
      : getDeterministicTtlMs(TORRENTIO_CACHE_TTL_MS, cacheKey);

  return { trimmedId, cacheKey, ttlMs };
};

export const getCachedTorrentioBadges = ({
  type,
  id,
  cacheTtlMs,
  remuxDisplayMode = 'composite',
}: {
  type: 'movie' | 'series';
  id: string;
  cacheTtlMs?: number;
  remuxDisplayMode?: RemuxDisplayMode;
}): TorrentioBadgeResult | null => {
  const cacheState = resolveTorrentioCacheState({ type, id, cacheTtlMs });
  if (!cacheState) {
    return { badges: [], cacheTtlMs: TORRENTIO_CACHE_TTL_MS, cacheHit: true, selectedBaseUrl: null };
  }

  const { cacheKey, ttlMs } = cacheState;
  const now = Date.now();
  if (torrentioRateLimitedUntil > now) {
    const cooldownTtlMs = Math.max(30 * 1000, torrentioRateLimitedUntil - now);
    return { badges: [], cacheTtlMs: cooldownTtlMs, cacheHit: true, selectedBaseUrl: null };
  }

  const cached = getMetadata<TorrentioBadgeCache>(cacheKey);
  if (!cached) {
    return null;
  }

  return {
    badges: buildFeatureBadgesFromFlags(cached.flags, remuxDisplayMode),
    cacheTtlMs: ttlMs,
    cacheHit: true,
    selectedBaseUrl: null,
  };
};

export const fetchTorrentioBadges = async ({
  type,
  id,
  phases,
  cacheTtlMs,
  remuxDisplayMode = 'composite',
  fetchImpl = undiciFetch,
  baseUrl = TORRENTIO_BASE_URL,
  fallbackBaseUrl = TORRENTIO_FALLBACK_BASE_URL,
  timeoutMs = TORRENTIO_TIMEOUT_MS,
  dispatcher = TORRENTIO_DISPATCHER,
}: {
  type: 'movie' | 'series';
  id: string;
  phases: PhaseDurations;
  cacheTtlMs?: number;
  remuxDisplayMode?: RemuxDisplayMode;
  fetchImpl?: typeof undiciFetch;
  baseUrl?: string | null;
  fallbackBaseUrl?: string | null;
  timeoutMs?: number;
  dispatcher?: Dispatcher;
}): Promise<TorrentioBadgeResult> => {
  const cacheState = resolveTorrentioCacheState({ type, id, cacheTtlMs });
  if (!cacheState || !baseUrl) {
    return { badges: [], cacheTtlMs: TORRENTIO_CACHE_TTL_MS, selectedBaseUrl: null };
  }
  const { trimmedId, cacheKey, ttlMs } = cacheState;
  const now = Date.now();
  if (torrentioRateLimitedUntil > now) {
    const cooldownTtlMs = Math.max(30 * 1000, torrentioRateLimitedUntil - now);
    setMetadata(cacheKey, { flags: collectMediaFeatureFlags([]) }, Math.min(ttlMs, cooldownTtlMs));
    return { badges: [], cacheTtlMs: cooldownTtlMs, selectedBaseUrl: null };
  }
  const cached = getCachedTorrentioBadges({ type, id: trimmedId, cacheTtlMs: ttlMs, remuxDisplayMode });
  if (cached) {
    recordAutoTuneStat('hits');
    logger.request(`[XRDB] Torrentio cache hit for ${type}:${trimmedId}`);
    return cached;
  }
  recordAutoTuneStat('misses');

  return withDedupe(torrentioInFlight, cacheKey, async () => {
    const warm = getCachedTorrentioBadges({ type, id: trimmedId, cacheTtlMs: ttlMs, remuxDisplayMode });
    if (warm) {
      logger.request(`[XRDB] Torrentio cache hit after dedupe wait for ${type}:${trimmedId}`);
      return warm;
    }

    if (CACHE_HARDENING_SWR) {
      const swrKey = `${cacheKey}:swr`;
      const stale = getMetadata<TorrentioBadgeCache>(swrKey);
      if (stale) {
        logger.request(`[XRDB] Torrentio SWR stale serve for ${type}:${trimmedId}`);
        deleteMetadata(swrKey);
        recordAutoTuneStat('swrServes');
        const staleResult: TorrentioBadgeResult = {
          badges: buildFeatureBadgesFromFlags(stale.flags, remuxDisplayMode),
          cacheTtlMs: ttlMs,
          cacheHit: true,
          selectedBaseUrl: null,
        };
        void fetchTorrentioBadges({
          type,
          id: trimmedId,
          phases,
          cacheTtlMs: ttlMs,
          remuxDisplayMode,
          fetchImpl,
          baseUrl,
          fallbackBaseUrl,
          timeoutMs,
          dispatcher,
        }).then(() => {
          logger.request(`[XRDB] Torrentio SWR background refresh completed for ${type}:${trimmedId}`);
        }).catch((err: unknown) => {
          logger.warn(`[XRDB] Torrentio SWR background refresh failed for ${type}:${trimmedId}:`, err instanceof Error ? err.message : err);
        });
        return staleResult;
      }
    }

    const attempts = [baseUrl, fallbackBaseUrl].filter(
      (candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index,
    );

    let response: Response | null = null;
    let selectedBaseUrl: string | null = null;
    let lastError: unknown = null;
    const fetchNow = Date.now();

    for (const candidateBaseUrl of attempts) {
      if (isCircuitOpen(candidateBaseUrl, fetchNow)) {
        recordAutoTuneStat('circuitSkips');
        logger.warn(`[XRDB] Torrentio circuit open for ${candidateBaseUrl}, skipping`);
        continue;
      }
      if (isBudgetExhausted(candidateBaseUrl, fetchNow)) {
        recordAutoTuneStat('budgetSkips');
        logger.warn(`[XRDB] Torrentio budget exhausted for ${candidateBaseUrl}, skipping`);
        continue;
      }
      consumeBudget(candidateBaseUrl, fetchNow);

      const torrentioUrl = buildTorrentioStreamUrl(candidateBaseUrl, type, trimmedId);
      try {
        response = await measurePhase(phases, 'stream', () =>
          torrentioConcurrencyLimit(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const requestOptions: Parameters<typeof undiciFetch>[1] = {
                signal: controller.signal,
                headers: {
                  'User-Agent': BROWSER_LIKE_USER_AGENT,
                },
              };
              if (dispatcher) {
                requestOptions.dispatcher = dispatcher;
              }
              return await fetchImpl(torrentioUrl, requestOptions) as unknown as Response;
            } finally {
              clearTimeout(timeoutId);
            }
          })
        );
      } catch (err) {
        lastError = err;
        recordCircuitFailure(candidateBaseUrl, fetchNow);
        logger.warn(
          `[XRDB] Torrentio fetch failed for ${torrentioUrl}:`,
          err instanceof Error ? err.message : err,
        );
        continue;
      }

      selectedBaseUrl = candidateBaseUrl;
      const retryableStatus = response.status === 403 || response.status === 408 || response.status === 429 || response.status >= 500;
      if (!response.ok && retryableStatus && candidateBaseUrl !== attempts[attempts.length - 1]) {
        logger.warn(`[XRDB] Torrentio returned ${response.status} for ${torrentioUrl}, trying fallback host`);
        recordCircuitFailure(candidateBaseUrl, fetchNow);
        response = null;
        continue;
      }
      if (response.ok) {
        recordCircuitSuccess(candidateBaseUrl);
      }
      break;
    }

    if (!response) {
      recordAutoTuneStat('errors');
      const failureTtl = Math.min(ttlMs, 2 * 60 * 1000);
      setMetadata(cacheKey, { flags: collectMediaFeatureFlags([]) }, failureTtl);
      if (lastError) {
        logger.warn(
          '[XRDB] Torrentio fetch exhausted all hosts:',
          lastError instanceof Error ? lastError.message : lastError,
        );
      }
      return { badges: [], cacheTtlMs: failureTtl, selectedBaseUrl };
    }

    if (!response.ok) {
      logger.warn(`[XRDB] Torrentio returned ${response.status} for ${selectedBaseUrl}`);
    }

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const filenames = extractTorrentioFilenames(payload);
    const flags = collectMediaFeatureFlags(filenames);
    const isNegativeResult = response.ok && filenames.length === 0;
    if (isNegativeResult) {
      logger.warn(`[XRDB] Torrentio returned 0 streams for ${selectedBaseUrl}`);
      recordAutoTuneStat('negativeCaches');
    }
    const isRateLimited = response.status === 429 || response.status === 403;
    const negativeCacheTtl = CACHE_HARDENING_NEGATIVE_CACHE ? TORRENTIO_NEGATIVE_CACHE_TTL_MS : ttlMs;
    const targetTtl = response.ok
      ? (isNegativeResult ? negativeCacheTtl : ttlMs)
      : Math.min(ttlMs, 2 * 60 * 1000);
    if (isRateLimited) {
      const cooldownMs = parseRetryAfterMs(
        response.headers.get('retry-after'),
        TORRENTIO_RATE_LIMIT_COOLDOWN_MS,
      );
      torrentioRateLimitedUntil = Date.now() + cooldownMs;
      setMetadata(cacheKey, { flags }, Math.min(targetTtl, cooldownMs));
      return {
        badges: buildFeatureBadgesFromFlags(flags, remuxDisplayMode),
        cacheTtlMs: cooldownMs,
        selectedBaseUrl,
      };
    }

    setMetadata(cacheKey, { flags }, targetTtl);
    if (CACHE_HARDENING_SWR && response.ok && !isNegativeResult) {
      setMetadata(`${cacheKey}:swr`, { flags }, targetTtl + TORRENTIO_SWR_WINDOW_MS);
    }
    const badges = buildFeatureBadgesFromFlags(flags, remuxDisplayMode);
    logger.request(
      `[XRDB] Torrentio fetched ${badges.length} badges for ${type}:${trimmedId} via ${selectedBaseUrl ?? 'unresolved-host'}`,
    );
    return {
      badges,
      cacheTtlMs: targetTtl,
      selectedBaseUrl,
    };
  });
};
