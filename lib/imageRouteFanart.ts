import { FANART_API_KEY, FANART_CLIENT_KEY, TMDB_CACHE_TTL_MS } from './imageRouteConfig.ts';
import type {
  CachedJsonNetworkObserver,
  CachedJsonResponse,
  JsonFetchImpl,
  PhaseDurations,
} from './imageRouteRuntime.ts';
import { sha1Hex } from './imageRouteRuntime.ts';
import {
  fanartAssetsToUrls,
  normalizeFanartLanguage,
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
  serverFanartKey = FANART_API_KEY,
  serverFanartClientKey = FANART_CLIENT_KEY,
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
  serverFanartKey?: string | null;
  serverFanartClientKey?: string | null;
  requestedLang: string;
  fallbackLang: string;
  phases: PhaseDurations;
  fetchJsonCached: FanartFetchJson;
}) => {
  const lookupId =
    mediaType === 'movie' ? String(tmdbId || '').trim() : String(tvdbId || '').trim();
  if (!lookupId) return null;
  const serverApiKey = String(serverFanartKey || '').trim();
  const serverClientKey = String(serverFanartClientKey || '').trim();

  const loadPayload = async (apiKey: string, clientKey: string) => {
    const normalizedApiKey = String(apiKey || '').trim();
    if (!normalizedApiKey) {
      return null;
    }

    const normalizedClientKey = String(clientKey || '').trim();
    const endpoint =
      mediaType === 'movie'
        ? `https://webservice.fanart.tv/v3/movies/${lookupId}?api_key=${encodeURIComponent(normalizedApiKey)}`
        : `https://webservice.fanart.tv/v3/tv/${lookupId}?api_key=${encodeURIComponent(normalizedApiKey)}`;
    const url = normalizedClientKey
      ? `${endpoint}&client_key=${encodeURIComponent(normalizedClientKey)}`
      : endpoint;

    const response = await fetchJsonCached(
      `fanart:${mediaType}:${lookupId}:key:${sha1Hex(normalizedApiKey)}:client:${sha1Hex(normalizedClientKey)}`,
      url,
      TMDB_CACHE_TTL_MS,
      phases,
      'fanart'
    );
    if (!response.ok || !response.data || typeof response.data !== 'object') {
      return null;
    }

    return response.data as Record<string, FanartImageAsset[] | unknown>;
  };

  const normalizedApiKey = String(fanartKey || '').trim();
  let payload = await loadPayload(normalizedApiKey, String(fanartClientKey || '').trim());
  if (!payload && serverApiKey && normalizedApiKey && normalizedApiKey !== serverApiKey) {
    payload = await loadPayload(serverApiKey, serverClientKey);
  }
  if (!payload) {
    return null;
  }

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
  const preferredLogoLanguage = normalizeFanartLanguage(selectedLogos[0]?.lang);
  const scopedLogos =
    selectedLogos.length === 0
      ? []
      : selectedLogos.filter(
          (asset) => normalizeFanartLanguage(asset?.lang) === preferredLogoLanguage,
        );
  const posterUrls = fanartAssetsToUrls(selectedPosters);
  const backdropUrls = fanartAssetsToUrls(selectedBackdrops);
  const logoUrls = fanartAssetsToUrls(scopedLogos.length > 0 ? scopedLogos : selectedLogos);
  if (posterUrls.length === 0 && backdropUrls.length === 0 && logoUrls.length === 0) return null;

  return {
    posterAssets: selectedPosters,
    posterUrls,
    backdropAssets: selectedBackdrops,
    backdropUrls,
    logoUrls,
  };
};
