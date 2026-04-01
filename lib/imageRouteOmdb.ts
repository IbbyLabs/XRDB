import { OMDB_API_KEY, OMDB_CACHE_TTL_MS } from './imageRouteConfig.ts';
import { sha1Hex, type CachedJsonResponse, type PhaseDurations } from './imageRouteRuntime.ts';
import { OMDB_API_BASE_URL } from './serviceBaseUrls.ts';

type OmdbFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
) => Promise<CachedJsonResponse>;

const normalizeOmdbPosterUrl = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.toUpperCase() === 'N/A') return null;
  return /^https?:\/\//i.test(normalized) ? normalized : null;
};

export const resolveOmdbPosterUrl = async ({
  imdbId,
  phases,
  fetchJsonCached,
  apiKey = OMDB_API_KEY,
}: {
  imdbId: string;
  phases: PhaseDurations;
  fetchJsonCached: OmdbFetchJson;
  apiKey?: string | null;
}) => {
  const normalizedImdbId = String(imdbId || '').trim();
  const normalizedApiKey = String(apiKey || '').trim();
  if (!/^tt\d+$/i.test(normalizedImdbId) || !normalizedApiKey) {
    return null;
  }

  const url = new URL(OMDB_API_BASE_URL);
  url.searchParams.set('apikey', normalizedApiKey);
  url.searchParams.set('i', normalizedImdbId);

  const response = await fetchJsonCached(
    `omdb:${normalizedImdbId}:key:${sha1Hex(normalizedApiKey).slice(0, 12)}`,
    url.toString(),
    OMDB_CACHE_TTL_MS,
    phases,
    'mdb',
  );
  if (!response.ok || !response.data || typeof response.data !== 'object') {
    return null;
  }

  const payload = response.data as Record<string, unknown>;
  if (String(payload.Response || '').trim().toLowerCase() === 'false') {
    return null;
  }

  return normalizeOmdbPosterUrl(payload.Poster);
};
