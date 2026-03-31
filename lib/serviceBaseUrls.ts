export const DEFAULT_TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
export const DEFAULT_ANIME_MAPPING_BASE_URL = 'https://animemapping.stremio.dpdns.org';
export const DEFAULT_KITSU_API_BASE_URL = 'https://kitsu.io/api/edge';

const normalizeBaseUrl = (value: string | undefined, fallback: string) => {
  const normalized = (value || '').trim();
  return (normalized || fallback).replace(/\/+$/, '');
};

export const resolveServiceBaseUrls = (env: Record<string, string | undefined> = process.env) => ({
  tmdbApiBaseUrl: normalizeBaseUrl(env.XRDB_TMDB_API_BASE_URL, DEFAULT_TMDB_API_BASE_URL),
  animeMappingBaseUrl: normalizeBaseUrl(
    env.XRDB_ANIME_MAPPING_BASE_URL,
    DEFAULT_ANIME_MAPPING_BASE_URL,
  ),
  kitsuApiBaseUrl: normalizeBaseUrl(env.XRDB_KITSU_API_BASE_URL, DEFAULT_KITSU_API_BASE_URL),
});

const configuredServiceBaseUrls = resolveServiceBaseUrls();

export const TMDB_API_BASE_URL = configuredServiceBaseUrls.tmdbApiBaseUrl;
export const ANIME_MAPPING_BASE_URL = configuredServiceBaseUrls.animeMappingBaseUrl;
export const KITSU_API_BASE_URL = configuredServiceBaseUrls.kitsuApiBaseUrl;
