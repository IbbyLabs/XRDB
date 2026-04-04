import { fetch as undiciFetch } from 'undici';

import { getMetadata, setMetadata } from './metadataStore.ts';
import { buildTorrentioStreamUrl } from './torrentioUrl.ts';
import {
  TORRENTIO_BASE_URL,
  TORRENTIO_CACHE_TTL_MS,
  TORRENTIO_CONCURRENCY,
  TORRENTIO_DISPATCHER,
  TORRENTIO_RATE_LIMIT_COOLDOWN_MS,
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

const buildTorrentioUrl = (type: 'movie' | 'series', id: string) =>
  buildTorrentioStreamUrl(TORRENTIO_BASE_URL, type, id);

export const fetchTorrentioBadges = async ({
  type,
  id,
  phases,
  cacheTtlMs,
  remuxDisplayMode = 'composite',
  fetchImpl = undiciFetch,
}: {
  type: 'movie' | 'series';
  id: string;
  phases: PhaseDurations;
  cacheTtlMs?: number;
  remuxDisplayMode?: RemuxDisplayMode;
  fetchImpl?: typeof undiciFetch;
}): Promise<TorrentioBadgeResult> => {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return { badges: [], cacheTtlMs: TORRENTIO_CACHE_TTL_MS };
  }
  const cacheKey = `torrentio:${type}:${trimmedId}`;
  const ttlMs =
    typeof cacheTtlMs === 'number' && Number.isFinite(cacheTtlMs) && cacheTtlMs > 0
      ? cacheTtlMs
      : getDeterministicTtlMs(TORRENTIO_CACHE_TTL_MS, cacheKey);
  const now = Date.now();
  if (torrentioRateLimitedUntil > now) {
    const cooldownTtlMs = Math.max(30 * 1000, torrentioRateLimitedUntil - now);
    setMetadata(cacheKey, { flags: collectMediaFeatureFlags([]) }, Math.min(ttlMs, cooldownTtlMs));
    return { badges: [], cacheTtlMs: cooldownTtlMs };
  }
  const cached = getMetadata<TorrentioBadgeCache>(cacheKey);
  if (cached) {
    return { badges: buildFeatureBadgesFromFlags(cached.flags, remuxDisplayMode), cacheTtlMs: ttlMs };
  }

  return withDedupe(torrentioInFlight, cacheKey, async () => {
    const warm = getMetadata<TorrentioBadgeCache>(cacheKey);
    if (warm) {
      return { badges: buildFeatureBadgesFromFlags(warm.flags, remuxDisplayMode), cacheTtlMs: ttlMs };
    }

    let response: Response | null = null;
    const torrentioUrl = buildTorrentioUrl(type, trimmedId);
    try {
      response = await measurePhase(phases, 'stream', () =>
        torrentioConcurrencyLimit(async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          try {
            return await fetchImpl(torrentioUrl, {
              signal: controller.signal,
              headers: {
                'User-Agent': BROWSER_LIKE_USER_AGENT,
              },
              ...(TORRENTIO_DISPATCHER ? { dispatcher: TORRENTIO_DISPATCHER } : {}),
            }) as unknown as Response;
          } finally {
            clearTimeout(timeoutId);
          }
        })
      );
    } catch (err) {
      const failureTtl = Math.min(ttlMs, 2 * 60 * 1000);
      setMetadata(cacheKey, { flags: collectMediaFeatureFlags([]) }, failureTtl);
      console.warn(
        `[XRDB] Torrentio fetch failed for ${torrentioUrl}:`,
        err instanceof Error ? err.message : err
      );
      return { badges: [], cacheTtlMs: failureTtl };
    }

    if (!response.ok) {
      console.warn(`[XRDB] Torrentio returned ${response.status} for ${torrentioUrl}`);
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
      console.warn(`[XRDB] Torrentio returned 0 streams for ${torrentioUrl}`);
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
      return { badges: buildFeatureBadgesFromFlags(flags, remuxDisplayMode), cacheTtlMs: cooldownMs };
    }

    setMetadata(cacheKey, { flags }, targetTtl);
    return { badges: buildFeatureBadgesFromFlags(flags, remuxDisplayMode), cacheTtlMs: targetTtl };
  });
};
