import { normalizeAnimeMappingSeason } from './animeMapping.ts';
import {
  extractAniListIdFromAnimemapping,
  extractKitsuIdFromAnimemapping,
  extractMalIdFromAnimemapping,
  extractTmdbIdFromAnimemapping,
} from './animeMappingPayload.ts';
import type { AnimeMappingProvider } from './imageRouteConfig.ts';
import { KITSU_CACHE_TTL_MS } from './imageRouteConfig.ts';
import type { CachedJsonResponse, PhaseDurations } from './imageRouteRuntime.ts';
import { ANIME_MAPPING_BASE_URL } from './serviceBaseUrls.ts';

type ReverseMappingFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

const buildAnimeReverseMappingRequest = (
  provider: AnimeMappingProvider,
  externalId: string,
  season?: string | null,
  episode?: string | null,
  cacheNamespace = 'anime',
) => {
  const normalizedExternalId = externalId.trim();
  if (!normalizedExternalId) return null;

  const normalizedSeason = normalizeAnimeMappingSeason(season);
  const normalizedEpisode = normalizeAnimeMappingSeason(episode);
  const searchParams = new URLSearchParams();
  if (normalizedSeason) {
    searchParams.set('s', normalizedSeason);
  }
  if (normalizedEpisode) {
    searchParams.set('ep', normalizedEpisode);
  }
  const query = searchParams.toString();
  return {
    cacheKey: `${cacheNamespace}:reverse:${provider}:${normalizedExternalId}:s:${normalizedSeason || '-'}${normalizedEpisode ? `:e:${normalizedEpisode}` : ''}`,
    url: `${ANIME_MAPPING_BASE_URL}/${provider}/${encodeURIComponent(normalizedExternalId)}${query ? `?${query}` : ''}`,
  };
};

export const fetchAnimeReverseMappingPayload = async ({
  provider,
  externalId,
  season,
  episode,
  phases,
  fetchJsonCached,
  cacheNamespace = 'anime',
}: {
  provider: AnimeMappingProvider;
  externalId: string;
  season?: string | null;
  episode?: string | null;
  phases: PhaseDurations;
  fetchJsonCached: ReverseMappingFetchJson;
  cacheNamespace?: string;
}) => {
  const request = buildAnimeReverseMappingRequest(
    provider,
    externalId,
    season,
    episode,
    cacheNamespace,
  );
  if (!request) return null;

  try {
    const response = await fetchJsonCached(
      request.cacheKey,
      request.url,
      KITSU_CACHE_TTL_MS,
      phases,
      'tmdb',
    );
    if (!response.ok) return null;
    const payload = response.data;
    if (payload?.ok === false) return null;
    return payload;
  } catch {
    return null;
  }
};

export const fetchKitsuIdFromReverseMapping = async (input: {
  provider: AnimeMappingProvider;
  externalId: string;
  season?: string | null;
  episode?: string | null;
  phases: PhaseDurations;
  fetchJsonCached: ReverseMappingFetchJson;
}) => {
  const payload = await fetchAnimeReverseMappingPayload(input);
  return payload ? extractKitsuIdFromAnimemapping(payload) : null;
};

export const fetchAniListIdFromReverseMapping = async (input: {
  provider: AnimeMappingProvider;
  externalId: string;
  season?: string | null;
  episode?: string | null;
  phases: PhaseDurations;
  fetchJsonCached: ReverseMappingFetchJson;
}) => {
  const payload = await fetchAnimeReverseMappingPayload(input);
  return payload ? extractAniListIdFromAnimemapping(payload) : null;
};

export const fetchMalIdFromReverseMapping = async (input: {
  provider: AnimeMappingProvider;
  externalId: string;
  season?: string | null;
  episode?: string | null;
  phases: PhaseDurations;
  fetchJsonCached: ReverseMappingFetchJson;
}) => {
  const payload = await fetchAnimeReverseMappingPayload(input);
  return payload ? extractMalIdFromAnimemapping(payload) : null;
};

export const fetchTmdbIdFromReverseMapping = async (input: {
  provider: AnimeMappingProvider;
  externalId: string;
  season?: string | null;
  episode?: string | null;
  phases: PhaseDurations;
  fetchJsonCached: ReverseMappingFetchJson;
}) => {
  const payload = await fetchAnimeReverseMappingPayload({
    ...input,
    cacheNamespace: 'tmdb',
  });
  return payload ? extractTmdbIdFromAnimemapping(payload) : null;
};
