import {
  ANILIST_GRAPHQL_URL,
  ANILIST_MEDIA_RATING_QUERY,
  JIKAN_API_BASE_URL,
  KITSU_CACHE_TTL_MS,
  MYANIMELIST_API_BASE_URL,
  MYANIMELIST_CLIENT_ID,
} from './imageRouteConfig.ts';
import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import { normalizeRatingValue } from './imageRouteMedia.ts';
import { normalizeMalId } from './animeMappingPayload.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';
import { KITSU_API_BASE_URL } from './serviceBaseUrls.ts';

type AnimeRatingsJsonFetch = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

export const fetchKitsuAnimeAttributes = async (
  kitsuId: string,
  phases: PhaseDurations,
  fetchJsonCached: AnimeRatingsJsonFetch,
) => {
  const normalizedKitsuId = String(kitsuId || '').trim();
  if (!normalizedKitsuId) return null;

  try {
    const response = await fetchJsonCached(
      `kitsu:anime:${normalizedKitsuId}:details`,
      `${KITSU_API_BASE_URL}/anime/${encodeURIComponent(normalizedKitsuId)}`,
      KITSU_CACHE_TTL_MS,
      phases,
      'mdb',
      {
        headers: {
          Accept: 'application/vnd.api+json',
          'User-Agent': BROWSER_LIKE_USER_AGENT,
        },
      }
    );
    if (!response.ok) return null;

    return response.data?.data?.attributes || null;
  } catch {
    return null;
  }
};

export const fetchKitsuRating = async (
  kitsuId: string,
  phases: PhaseDurations,
  fetchJsonCached: AnimeRatingsJsonFetch,
) => {
  const attributes = await fetchKitsuAnimeAttributes(kitsuId, phases, fetchJsonCached);
  return normalizeRatingValue(attributes?.averageRating);
};

export const fetchAniListRating = async (
  aniListId: string,
  phases: PhaseDurations,
  fetchJsonCached: AnimeRatingsJsonFetch,
) => {
  const normalizedAniListId = String(aniListId || '').trim();
  const parsedAniListId = Number.parseInt(normalizedAniListId, 10);
  if (!Number.isFinite(parsedAniListId) || parsedAniListId <= 0) return null;

  try {
    const response = await fetchJsonCached(
      `anilist:anime:${parsedAniListId}:rating`,
      ANILIST_GRAPHQL_URL,
      KITSU_CACHE_TTL_MS,
      phases,
      'mdb',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'User-Agent': BROWSER_LIKE_USER_AGENT,
        },
        body: JSON.stringify({
          query: ANILIST_MEDIA_RATING_QUERY,
          variables: { id: parsedAniListId },
        }),
      }
    );
    if (!response.ok || response.data?.errors) return null;

    return normalizeRatingValue(
      response.data?.data?.Media?.averageScore ?? response.data?.data?.Media?.meanScore
    );
  } catch {
    return null;
  }
};

export const fetchMyAnimeListRating = async (
  malId: string,
  phases: PhaseDurations,
  fetchJsonCached: AnimeRatingsJsonFetch,
) => {
  const normalizedMalId = normalizeMalId(malId);
  if (!normalizedMalId) return null;

  if (MYANIMELIST_CLIENT_ID) {
    try {
      const response = await fetchJsonCached(
        `mal:anime:${normalizedMalId}:rating:${sha1Hex(MYANIMELIST_CLIENT_ID)}`,
        `${MYANIMELIST_API_BASE_URL}/anime/${encodeURIComponent(normalizedMalId)}?fields=mean`,
        KITSU_CACHE_TTL_MS,
        phases,
        'mdb',
        {
          headers: {
            accept: 'application/json',
            'X-MAL-CLIENT-ID': MYANIMELIST_CLIENT_ID,
            'User-Agent': BROWSER_LIKE_USER_AGENT,
          },
        }
      );
      if (response.ok) {
        const rating = normalizeRatingValue(response.data?.mean);
        if (rating) {
          return rating;
        }
      }
    } catch {
    }
  }

  try {
    const response = await fetchJsonCached(
      `jikan:anime:${normalizedMalId}:score`,
      `${JIKAN_API_BASE_URL}/anime/${encodeURIComponent(normalizedMalId)}`,
      KITSU_CACHE_TTL_MS,
      phases,
      'mdb',
      {
        headers: {
          accept: 'application/json',
          'User-Agent': BROWSER_LIKE_USER_AGENT,
        },
      }
    );
    if (!response.ok) return null;

    return normalizeRatingValue(response.data?.data?.score);
  } catch {
    return null;
  }
};
