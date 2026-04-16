import { TMDB_API_KEY, TMDB_READ_ACCESS_TOKEN } from './imageRouteConfig.ts';
import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';

type TmdbServerAuthOptions = {
  url: string;
  init?: RequestInit;
  serverApiKey?: string;
  serverReadAccessToken?: string;
  apiBaseUrl?: string;
};

type TmdbFetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const trimValue = (value: string | null | undefined) => String(value || '').trim();

const RETRYABLE_TMDB_STATUS_SET = new Set([401, 403, 429]);

const isTmdbApiUrl = (value: string, apiBaseUrl: string) => {
  try {
    const target = new URL(value);
    const base = new URL(apiBaseUrl);
    const basePath = base.pathname.replace(/\/+$/, '');
    return (
      target.origin === base.origin &&
      (target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))
    );
  } catch {
    return false;
  }
};

export const hasServerTmdbCredentials = ({
  serverApiKey = TMDB_API_KEY,
  serverReadAccessToken = TMDB_READ_ACCESS_TOKEN,
}: {
  serverApiKey?: string;
  serverReadAccessToken?: string;
} = {}) => Boolean(trimValue(serverApiKey) || trimValue(serverReadAccessToken));

export const prepareTmdbServerRequest = ({
  url,
  init,
  serverApiKey = TMDB_API_KEY,
  serverReadAccessToken = TMDB_READ_ACCESS_TOKEN,
  apiBaseUrl = TMDB_API_BASE_URL,
}: TmdbServerAuthOptions) => {
  if (!isTmdbApiUrl(url, apiBaseUrl)) {
    return { url, init };
  }

  const normalizedServerApiKey = trimValue(serverApiKey);
  const normalizedReadAccessToken = trimValue(serverReadAccessToken);
  if (!normalizedReadAccessToken) {
    return { url, init };
  }

  const target = new URL(url);
  const queryApiKey = trimValue(target.searchParams.get('api_key'));
  const canUseBearer =
    !queryApiKey ||
    (normalizedServerApiKey.length > 0 && queryApiKey === normalizedServerApiKey);

  if (!canUseBearer) {
    return { url, init };
  }

  target.searchParams.delete('api_key');

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${normalizedReadAccessToken}`);

  return {
    url: target.toString(),
    init: {
      ...init,
      headers,
    },
  };
};

const buildTmdbFallbackRequest = ({
  url,
  init,
  serverApiKey = TMDB_API_KEY,
  serverReadAccessToken = TMDB_READ_ACCESS_TOKEN,
  apiBaseUrl = TMDB_API_BASE_URL,
}: TmdbServerAuthOptions) => {
  if (!isTmdbApiUrl(url, apiBaseUrl) || !hasServerTmdbCredentials({ serverApiKey, serverReadAccessToken })) {
    return null;
  }

  const target = new URL(url);
  const queryApiKey = trimValue(target.searchParams.get('api_key'));
  const normalizedServerApiKey = trimValue(serverApiKey);
  const normalizedReadAccessToken = trimValue(serverReadAccessToken);
  if (!queryApiKey || (normalizedServerApiKey && queryApiKey === normalizedServerApiKey)) {
    return null;
  }

  if (normalizedReadAccessToken) {
    target.searchParams.delete('api_key');
    return prepareTmdbServerRequest({
      url: target.toString(),
      init,
      serverApiKey,
      serverReadAccessToken,
      apiBaseUrl,
    });
  }

  if (!normalizedServerApiKey) {
    return null;
  }

  target.searchParams.set('api_key', normalizedServerApiKey);
  return {
    url: target.toString(),
    init,
  };
};

export const fetchTmdbServer = async (
  url: string,
  init?: RequestInit,
  fetchImpl: TmdbFetchImpl = fetch,
  options: Omit<TmdbServerAuthOptions, 'url' | 'init'> = {},
) => {
  const prepared = prepareTmdbServerRequest({ url, init, ...options });
  const response = await fetchImpl(prepared.url, prepared.init);
  if (response.ok || !RETRYABLE_TMDB_STATUS_SET.has(response.status)) {
    return response;
  }

  const fallbackRequest = buildTmdbFallbackRequest({ url, init, ...options });
  if (!fallbackRequest) {
    return response;
  }

  return fetchImpl(fallbackRequest.url, fallbackRequest.init);
};