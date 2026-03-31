import {
  MDBLIST_API_KEYS,
  MDBLIST_CACHE_TTL_MS,
  MDBLIST_OLD_MOVIE_AGE_DAYS,
  MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
  MDBLIST_RATE_LIMIT_COOLDOWN_MS,
} from './imageRouteConfig.ts';
import {
  getDeterministicTtlMs,
  type CachedJsonResponse,
} from './imageRouteRuntime.ts';

const mdbListRateLimitedUntil = new Map<string, number>();
let mdbListApiKeyCursor = 0;

export const getMdbListApiKeysInPriorityOrder = () => {
  if (!MDBLIST_API_KEYS.length) return [];

  const now = Date.now();
  const availableKeys = MDBLIST_API_KEYS.filter((apiKey) => {
    const limitedUntil = mdbListRateLimitedUntil.get(apiKey) || 0;
    return limitedUntil <= now;
  });
  const candidates = availableKeys.length ? availableKeys : MDBLIST_API_KEYS;
  const startIndex = mdbListApiKeyCursor % candidates.length;
  mdbListApiKeyCursor = (mdbListApiKeyCursor + 1) % candidates.length;

  return [...candidates.slice(startIndex), ...candidates.slice(0, startIndex)];
};

export const markMdbListApiKeyRateLimited = (apiKey: string) => {
  mdbListRateLimitedUntil.set(apiKey, Date.now() + MDBLIST_RATE_LIMIT_COOLDOWN_MS);
};

export const getMdbListResponseMessage = (payload: any) =>
  [
    payload?.error,
    payload?.message,
    payload?.detail,
    payload?.description,
    payload?.status_message,
    payload?.response,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();

export const isMdbListRateLimitedResponse = (response: CachedJsonResponse) => {
  if (response.status === 429) return true;

  const message = getMdbListResponseMessage(response.data);
  if (!message) return false;

  return ['rate limit', 'too many requests', 'quota', 'limit reached', 'limit exceeded', 'throttle'].some(
    (token) => message.includes(token)
  );
};

export const shouldRetryMdbListWithAnotherKey = (response: CachedJsonResponse) => {
  if (isMdbListRateLimitedResponse(response)) return true;
  return response.status === 401 || response.status === 403 || response.status >= 500;
};

export const getRatingCacheTtlMs = ({
  id,
  mediaType,
  releaseDate,
  defaultTtlMs,
  oldTtlMs,
}: {
  id: string;
  mediaType: 'movie' | 'tv';
  releaseDate?: string | null;
  defaultTtlMs: number;
  oldTtlMs: number;
}) => {
  let ttlMs = defaultTtlMs;

  if (mediaType === 'movie') {
    const normalizedReleaseDate = String(releaseDate || '').trim();
    if (normalizedReleaseDate) {
      const releaseTimestamp = Date.parse(`${normalizedReleaseDate}T00:00:00Z`);
      if (Number.isFinite(releaseTimestamp)) {
        const movieAgeMs = Date.now() - releaseTimestamp;
        if (movieAgeMs >= MDBLIST_OLD_MOVIE_AGE_DAYS * 24 * 60 * 60 * 1000) {
          ttlMs = Math.max(defaultTtlMs, oldTtlMs);
        }
      }
    }
  }

  return getDeterministicTtlMs(ttlMs, id);
};

export const getMdbListCacheTtlMs = ({
  imdbId,
  mediaType,
  releaseDate,
}: {
  imdbId: string;
  mediaType: 'movie' | 'tv';
  releaseDate?: string | null;
}) => {
  return getRatingCacheTtlMs({
    id: imdbId,
    mediaType,
    releaseDate,
    defaultTtlMs: MDBLIST_CACHE_TTL_MS,
    oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
  });
};
