import { KITSU_CACHE_TTL_MS, type AnimeMappingProvider } from '../imageRouteConfig.ts';
import {
  buildAnimeReverseMappingResolution,
  fetchAnimeReverseMappingResolution,
} from '../imageRouteAnimeReverse.ts';
import type { CachedJsonResponse, PhaseDurations } from '../imageRouteRuntime.ts';
import { ANIME_MAPPING_BASE_URL } from '../serviceBaseUrls.ts';

type AdapterFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

const normalizeProvider = (provider: string): AnimeMappingProvider | null => {
  const normalized = provider.trim().toLowerCase();
  if (normalized === 'myanimelist') return 'mal';
  if (normalized === 'mal' || normalized === 'anilist' || normalized === 'imdb' || normalized === 'tmdb' || normalized === 'tvdb' || normalized === 'anidb') {
    return normalized as AnimeMappingProvider;
  }
  return null;
};

type CanonicalProviderAdapterResult = {
  payload: any | null;
  mappedIds: {
    tmdb: string | null;
    kitsu: string | null;
    anilist: string | null;
    mal: string | null;
  };
  tmdbEpisodeTarget: { id: string; season: string; episode: string } | null;
};

export const fetchCanonicalProviderMapping = async ({
  provider,
  externalId,
  season,
  episode,
  phases,
  fetchJsonCached,
}: {
  provider: string;
  externalId: string;
  season?: string | null;
  episode?: string | null;
  phases: PhaseDurations;
  fetchJsonCached: AdapterFetchJson;
}): Promise<CanonicalProviderAdapterResult> => {
  const trimmedExternalId = externalId.trim();
  if (!trimmedExternalId) {
    return {
      payload: null,
      mappedIds: { tmdb: null, kitsu: null, anilist: null, mal: null },
      tmdbEpisodeTarget: null,
    };
  }

  let resolution = buildAnimeReverseMappingResolution(null);
  const normalizedProvider = normalizeProvider(provider);

  if (provider.trim().toLowerCase() === 'kitsu') {
    const params = new URLSearchParams();
    if (episode) params.set('ep', episode);
    if (season) params.set('s', season);
    const query = params.toString();
    const response = await fetchJsonCached(
      `anime:kitsu:${trimmedExternalId}:s:${season || '-'}:e:${episode || '-'}`,
      `${ANIME_MAPPING_BASE_URL}/kitsu/${encodeURIComponent(trimmedExternalId)}${query ? `?${query}` : ''}`,
      KITSU_CACHE_TTL_MS,
      phases,
      'tmdb',
    );
    resolution = buildAnimeReverseMappingResolution(response.ok ? response.data : null);
  } else if (normalizedProvider) {
    resolution = await fetchAnimeReverseMappingResolution({
      provider: normalizedProvider,
      externalId: trimmedExternalId,
      season,
      episode,
      phases,
      fetchJsonCached,
      cacheNamespace: 'canonical',
    });
  }

  return {
    payload: resolution.payload,
    mappedIds: resolution.mappedIds,
    tmdbEpisodeTarget: resolution.tmdbEpisodeTarget,
  };
};