import {
  SIMKL_ID_CACHE_TTL_MS,
  SIMKL_ID_EMPTY_CACHE_TTL_MS,
  TRAKT_API_BASE_URL,
  TRAKT_CLIENT_ID,
} from './imageRouteConfig.ts';
import type {
  CachedJsonNetworkObserver,
  CachedJsonResponse,
  JsonFetchImpl,
  PhaseDurations,
} from './imageRouteRuntime.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import { isNegativeRatingValue, normalizeRatingValue } from './imageRouteMedia.ts';

export const BROWSER_LIKE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
export const SIMKL_APP_NAME =
  String(process.env.XRDB_SIMKL_APP_NAME || process.env.XRDB_BUILD_NAME || process.env.npm_package_name || 'xrdb')
    .trim() || 'xrdb';
export const SIMKL_APP_VERSION =
  String(process.env.XRDB_SIMKL_APP_VERSION || process.env.XRDB_BUILD_VERSION || process.env.npm_package_version || '1.0')
    .trim() || '1.0';
export const SIMKL_USER_AGENT = `${SIMKL_APP_NAME}/${SIMKL_APP_VERSION}`.replace(/\s+/g, '-');

type ExternalRatingsFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
  observer?: CachedJsonNetworkObserver,
  fetchImpl?: JsonFetchImpl,
) => Promise<CachedJsonResponse>;

type MetadataReader = <T>(key: string) => T | null | undefined;
type MetadataWriter = (key: string, value: any, ttlMs: number) => void;

export const buildSimklRequiredQuery = (clientId: string) => {
  const query = new URLSearchParams();
  query.set('client_id', clientId);
  query.set('app-name', SIMKL_APP_NAME);
  query.set('app-version', SIMKL_APP_VERSION);
  return query;
};

export const resolveSimklSummaryType = ({
  mediaType,
  anilistId,
  malId,
  kitsuId,
}: {
  mediaType: 'movie' | 'tv';
  anilistId?: string | null;
  malId?: string | null;
  kitsuId?: string | null;
}): 'movies' | 'tv' | 'anime' => {
  const hasAnimeHint = [anilistId, malId, kitsuId].some((value) => String(value || '').trim().length > 0);
  if (hasAnimeHint) return 'anime';
  return mediaType === 'movie' ? 'movies' : 'tv';
};

const parseRedirectLocationSimklId = (locationValue?: string | null) => {
  const normalizedLocation = String(locationValue || '').trim();
  if (!normalizedLocation) return null;
  const resolvedUrl = normalizedLocation.startsWith('//')
    ? `https:${normalizedLocation}`
    : normalizedLocation.startsWith('/')
      ? `https://simkl.com${normalizedLocation}`
      : normalizedLocation;
  try {
    const path = new URL(resolvedUrl).pathname;
    const match = path.match(/\/(?:movie|movies|tv|show|shows|anime)\/(\d+)(?:\/|$)/i);
    return match?.[1] || null;
  } catch {
    const match = normalizedLocation.match(/\/(?:movie|movies|tv|show|shows|anime)\/(\d+)(?:\/|$)/i);
    return match?.[1] || null;
  }
};

export const fetchTraktRating = async ({
  imdbId,
  mediaType,
  phases,
  fetchJsonCached,
  undiciFetchImpl,
  traktClientId = TRAKT_CLIENT_ID,
}: {
  imdbId: string;
  mediaType: 'movie' | 'tv';
  phases: PhaseDurations;
  fetchJsonCached: ExternalRatingsFetchJson;
  undiciFetchImpl: JsonFetchImpl;
  traktClientId?: string;
}) => {
  const normalizedImdbId = String(imdbId || '').trim();
  const normalizedTraktClientId = String(traktClientId || '').trim();
  if (!normalizedImdbId || !normalizedTraktClientId) return null;

  const traktMediaType = mediaType === 'tv' ? 'shows' : 'movies';

  try {
    const response = await fetchJsonCached(
      `trakt:${traktMediaType}:${normalizedImdbId}:ratings:${sha1Hex(normalizedTraktClientId)}`,
      `${TRAKT_API_BASE_URL}/${traktMediaType}/${encodeURIComponent(normalizedImdbId)}/ratings`,
      24 * 60 * 60 * 1000,
      phases,
      'mdb',
      {
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'trakt-api-version': '2',
          'trakt-api-key': normalizedTraktClientId,
          'user-agent': BROWSER_LIKE_USER_AGENT,
          'accept-language': 'en-US,en;q=0.9',
        },
      },
      undefined,
      undiciFetchImpl
    );
    if (!response.ok) return null;

    return normalizeRatingValue(response.data?.trakt?.rating ?? response.data?.rating);
  } catch {
    return null;
  }
};

export const fetchSimklId = async ({
  clientId,
  imdbId,
  tmdbId,
  mediaType,
  anilistId,
  malId,
  kitsuId,
  cacheTtlMs,
  phases,
  fetchJsonCached,
  getMetadata,
  setMetadata,
}: {
  clientId: string;
  imdbId?: string | null;
  tmdbId?: string | null;
  mediaType: 'movie' | 'tv';
  anilistId?: string | null;
  malId?: string | null;
  kitsuId?: string | null;
  cacheTtlMs: number;
  phases: PhaseDurations;
  fetchJsonCached: ExternalRatingsFetchJson;
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
}): Promise<string | null> => {
  const normalizedClientId = String(clientId || '').trim();
  const normalizedImdbId = String(imdbId || '').trim();
  const normalizedTmdbId = String(tmdbId || '').trim();
  const normalizedAnilistId = String(anilistId || '').trim();
  const normalizedMalId = String(malId || '').trim();
  const normalizedKitsuId = String(kitsuId || '').trim();

  if (!normalizedClientId) return null;

  const query = buildSimklRequiredQuery(normalizedClientId);
  query.set('to', 'Simkl');
  if (normalizedImdbId) {
    query.set('imdb', normalizedImdbId);
  } else if (normalizedTmdbId) {
    query.set('tmdb', normalizedTmdbId);
    query.set('type', mediaType);
  } else if (normalizedAnilistId) {
    query.set('anilist', normalizedAnilistId);
  } else if (normalizedMalId) {
    query.set('mal', normalizedMalId);
  } else if (normalizedKitsuId) {
    query.set('kitsu', normalizedKitsuId);
  } else {
    return null;
  }

  const cacheIdSource =
    normalizedImdbId ||
    (normalizedTmdbId ? `tmdb:${mediaType}:${normalizedTmdbId}` : '') ||
    (normalizedAnilistId ? `anilist:${normalizedAnilistId}` : '') ||
    (normalizedMalId ? `mal:${normalizedMalId}` : '') ||
    (normalizedKitsuId ? `kitsu:${normalizedKitsuId}` : '');
  const clientHash = sha1Hex(normalizedClientId);
  const idCacheKey = `simkl:id:v2:${cacheIdSource}:client:${clientHash}`;
  const emptyIdCacheKey = `${idCacheKey}:empty`;

  const cachedEmpty = getMetadata<{ empty: true }>(emptyIdCacheKey);
  if (cachedEmpty?.empty) return null;

  try {
    const response = await fetchJsonCached(
      idCacheKey,
      `https://api.simkl.com/redirect?${query.toString()}`,
      cacheTtlMs,
      phases,
      'mdb',
      {
        headers: {
          'simkl-api-key': normalizedClientId,
          'Accept': 'application/json',
          'User-Agent': SIMKL_USER_AGENT,
        },
        redirect: 'manual',
      }
    );

    const simklIdFromPayload =
      response.data?.id ||
      response.data?.simkl_id ||
      response.data?.ids?.simkl ||
      parseRedirectLocationSimklId(response.location);
    if (simklIdFromPayload) {
      const normalizedSimklId = String(simklIdFromPayload).trim();
      if (normalizedSimklId) {
        setMetadata(
          idCacheKey,
          {
            ok: true,
            status: 200,
            data: { id: normalizedSimklId },
            location: response.location ?? null,
          },
          cacheTtlMs,
        );
        return normalizedSimklId;
      }
    }

    if (!response.ok) {
      if (response.status === 404) {
        setMetadata(emptyIdCacheKey, { empty: true }, SIMKL_ID_EMPTY_CACHE_TTL_MS);
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
};

export const fetchSimklRating = async ({
  clientId,
  imdbId,
  tmdbId,
  mediaType,
  anilistId,
  malId,
  kitsuId,
  cacheTtlMs,
  phases,
  fetchJsonCached,
  getMetadata,
  setMetadata,
}: {
  clientId: string;
  imdbId?: string | null;
  tmdbId?: string | null;
  mediaType: 'movie' | 'tv';
  anilistId?: string | null;
  malId?: string | null;
  kitsuId?: string | null;
  cacheTtlMs: number;
  phases: PhaseDurations;
  fetchJsonCached: ExternalRatingsFetchJson;
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
}) => {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) return null;

  const simklId = await fetchSimklId({
    clientId: normalizedClientId,
    imdbId,
    tmdbId,
    mediaType,
    anilistId,
    malId,
    kitsuId,
    cacheTtlMs: SIMKL_ID_CACHE_TTL_MS,
    phases,
    fetchJsonCached,
    getMetadata,
    setMetadata,
  });

  if (!simklId) return null;

  const simklSummaryType = resolveSimklSummaryType({
    mediaType,
    anilistId,
    malId,
    kitsuId,
  });
  const query = buildSimklRequiredQuery(normalizedClientId);
  query.set('extended', 'full');

  try {
    const response = await fetchJsonCached(
      `simkl:summary:${simklSummaryType}:${simklId}:client:${sha1Hex(normalizedClientId)}`,
      `https://api.simkl.com/${simklSummaryType}/${encodeURIComponent(simklId)}?${query.toString()}`,
      cacheTtlMs,
      phases,
      'mdb',
      {
        headers: {
          'simkl-api-key': normalizedClientId,
          'Accept': 'application/json',
          'User-Agent': SIMKL_USER_AGENT,
        },
      }
    );

    if (!response.ok) return null;

    const rating = normalizeRatingValue(
      response.data?.rating ??
        response.data?.simkl?.rating ??
        response.data?.ratings?.simkl?.rating ??
        response.data?.ratings?.overall?.rating,
    );
    return rating && !isNegativeRatingValue(rating) ? rating : null;
  } catch {
    return null;
  }
};
