import { TMDB_CACHE_TTL_MS } from './imageRouteConfig.ts';
import type {
  CachedJsonNetworkObserver,
  CachedJsonResponse,
  JsonFetchImpl,
  PhaseDurations,
} from './imageRouteRuntime.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import {
  fanartAssetsToUrls,
  selectFanartAssets,
  type FanartImageAsset,
} from './imageRouteSelection.ts';

type FanartFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
  observer?: CachedJsonNetworkObserver,
  fetchImpl?: JsonFetchImpl,
) => Promise<CachedJsonResponse>;

export const fetchFanartArtwork = async ({
  mediaType,
  tmdbId,
  tvdbId,
  fanartKey,
  fanartClientKey,
  requestedLang,
  fallbackLang,
  phases,
  fetchJsonCached,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: string;
  tvdbId?: string | null;
  fanartKey: string;
  fanartClientKey?: string | null;
  requestedLang: string;
  fallbackLang: string;
  phases: PhaseDurations;
  fetchJsonCached: FanartFetchJson;
}) => {
  const normalizedApiKey = String(fanartKey || '').trim();
  if (!normalizedApiKey) return null;

  const lookupId =
    mediaType === 'movie' ? String(tmdbId || '').trim() : String(tvdbId || '').trim();
  if (!lookupId) return null;

  const endpoint =
    mediaType === 'movie'
      ? `https://webservice.fanart.tv/v3/movies/${lookupId}?api_key=${encodeURIComponent(normalizedApiKey)}`
      : `https://webservice.fanart.tv/v3/tv/${lookupId}?api_key=${encodeURIComponent(normalizedApiKey)}`;
  const url = fanartClientKey
    ? `${endpoint}&client_key=${encodeURIComponent(String(fanartClientKey).trim())}`
    : endpoint;

  const response = await fetchJsonCached(
    `fanart:${mediaType}:${lookupId}:key:${sha1Hex(normalizedApiKey)}:client:${sha1Hex(String(fanartClientKey || ''))}`,
    url,
    TMDB_CACHE_TTL_MS,
    phases,
    'fanart'
  );
  if (!response.ok || !response.data || typeof response.data !== 'object') {
    return null;
  }

  const payload = response.data as Record<string, FanartImageAsset[] | unknown>;
  const posterCandidates = mediaType === 'movie'
    ? ((payload.movieposter as FanartImageAsset[] | undefined) || [])
    : ((payload.tvposter as FanartImageAsset[] | undefined) || []);
  const backdropCandidates = mediaType === 'movie'
    ? ((payload.moviebackground as FanartImageAsset[] | undefined) || [])
    : ((payload.showbackground as FanartImageAsset[] | undefined) || []);
  const logoCandidates = mediaType === 'movie'
    ? [
        ...(((payload.hdmovielogo as FanartImageAsset[] | undefined) || [])),
        ...(((payload.movielogo as FanartImageAsset[] | undefined) || [])),
      ]
    : [
        ...(((payload.hdtvlogo as FanartImageAsset[] | undefined) || [])),
        ...(((payload.clearlogo as FanartImageAsset[] | undefined) || [])),
        ...(((payload.tvlogo as FanartImageAsset[] | undefined) || [])),
      ];

  const selectedPosters = selectFanartAssets(posterCandidates, requestedLang, fallbackLang);
  const selectedBackdrops = selectFanartAssets(backdropCandidates, requestedLang, fallbackLang);
  const selectedLogos = selectFanartAssets(logoCandidates, requestedLang, fallbackLang);
  const posterUrls = fanartAssetsToUrls(selectedPosters);
  const backdropUrls = fanartAssetsToUrls(selectedBackdrops);
  const logoUrls = fanartAssetsToUrls(selectedLogos);
  if (posterUrls.length === 0 && backdropUrls.length === 0 && logoUrls.length === 0) return null;

  return {
    posterAssets: selectedPosters,
    posterUrls,
    backdropAssets: selectedBackdrops,
    backdropUrls,
    logoUrls,
  };
};
