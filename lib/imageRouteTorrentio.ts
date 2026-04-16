import { fetch as undiciFetch, type Dispatcher } from 'undici';

import { getMetadata, setMetadata } from './metadataStore.ts';
import { buildTorrentioStreamUrl } from './torrentioUrl.ts';
import {
  TORRENTIO_BASE_URL,
  TORRENTIO_CACHE_TTL_MS,
  TORRENTIO_CONCURRENCY,
  TORRENTIO_DISPATCHER,
  TORRENTIO_FALLBACK_BASE_URL,
  TORRENTIO_RATE_LIMIT_COOLDOWN_MS,
  TORRENTIO_TIMEOUT_MS,
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
    logger.request(`[XRDB] Torrentio cache hit for ${type}:${trimmedId}`);
    return cached;
  }

  return withDedupe(torrentioInFlight, cacheKey, async () => {
    const warm = getCachedTorrentioBadges({ type, id: trimmedId, cacheTtlMs: ttlMs, remuxDisplayMode });
    if (warm) {
      logger.request(`[XRDB] Torrentio cache hit after dedupe wait for ${type}:${trimmedId}`);
      return warm;
    }

    const attempts = [baseUrl, fallbackBaseUrl].filter(
      (candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index,
    );

    let response: Response | null = null;
    let selectedBaseUrl: string | null = null;
    let lastError: unknown = null;

    for (const candidateBaseUrl of attempts) {
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
        response = null;
        continue;
      }
      break;
    }

    if (!response) {
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
    if (filenames.length === 0) {
      logger.warn(`[XRDB] Torrentio returned 0 streams for ${selectedBaseUrl}`);
    }
    const isRateLimited = response.status === 429 || response.status === 403;
    const targetTtl = response.ok ? ttlMs : Math.min(ttlMs, 2 * 60 * 1000);
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
