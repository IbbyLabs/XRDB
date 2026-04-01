import {
  SIMKL_ID_CACHE_TTL_MS,
  SIMKL_ID_EMPTY_CACHE_TTL_MS,
  TRAKT_API_BASE_URL,
  TRAKT_CLIENT_ID,
} from './imageRouteConfig.ts';
import type {
  CachedJsonNetworkObserver,
  CachedJsonResponse,
  CachedTextResponse,
  JsonFetchImpl,
  PhaseDurations,
} from './imageRouteRuntime.ts';
import { measurePhase, sha1Hex, withDedupe } from './imageRouteRuntime.ts';
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
type AllocineRatingValues = {
  allocine: string | null;
  allocinepress: string | null;
};

const externalTextMetadataInFlight = new Map<string, Promise<CachedTextResponse>>();
const ALLOCINE_BASE_URL = 'https://www.allocine.fr';
const ALLOCINE_REQUEST_HEADERS = {
  'user-agent': BROWSER_LIKE_USER_AGENT,
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_match, codePoint) => {
      const parsed = Number(codePoint);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) => {
      const parsed = Number.parseInt(codePoint, 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : '';
    });

const normalizeAllocineTitle = (value: string) =>
  decodeHtmlEntities(String(value || ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');

export const decodeAllocinePathFromClassName = (className: string) => {
  const classTokens = String(className || '')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of classTokens) {
    if (!token.startsWith('ACr')) continue;
    const payload = token.replace(/ACr/g, '');
    if (!payload) continue;
    try {
      const decoded = Buffer.from(payload, 'base64').toString('utf8').trim();
      if (decoded.startsWith('/')) {
        return decoded;
      }
    } catch {
    }
  }

  return null;
};

export const extractAllocineSearchCandidates = (
  html: string,
  mediaType: 'movie' | 'tv',
) => {
  const expectedPrefix = mediaType === 'movie' ? '/film/' : '/series/';
  const pathMarker =
    mediaType === 'movie' ? 'fichefilm_gen_cfilm=' : 'ficheserie_gen_cserie=';
  const result: Array<{ path: string; title: string; year: number | null }> = [];
  const seen = new Set<string>();
  const pattern = /<span class="([^"]*\bmeta-title-link\b[^"]*)">([\s\S]*?)<\/span>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(html))) {
    const path = decodeAllocinePathFromClassName(match[1]);
    if (!path || !path.startsWith(expectedPrefix) || !path.includes(pathMarker) || seen.has(path)) {
      continue;
    }
    const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!title) continue;
    const context = html.slice(match.index, match.index + 800);
    const yearMatch = context.match(/class="date">[^<]*(\d{4})/i);
    const year = yearMatch ? Number(yearMatch[1]) : null;
    result.push({ path, title, year: Number.isFinite(year) ? year : null });
    seen.add(path);
  }

  return result;
};

export const extractAllocineRatings = (html: string): AllocineRatingValues => {
  const result: AllocineRatingValues = {
    allocine: null,
    allocinepress: null,
  };
  const pattern =
    /<span class="[^"]*\brating-title\b[^"]*">\s*(Presse|Spectateurs)\s*<\/span>[\s\S]{0,500}?<span class="stareval-note(?: [^"]*)?">([^<]+)<\/span>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = pattern.exec(html))) {
    const label = match[1].trim().toLowerCase();
    const value = normalizeRatingValue(decodeHtmlEntities(match[2]));
    if (!value) continue;
    if (label === 'presse' && !result.allocinepress) {
      result.allocinepress = value;
      continue;
    }
    if (label === 'spectateurs' && !result.allocine) {
      result.allocine = value;
    }
  }

  return result;
};

const fetchExternalTextCached = async ({
  key,
  url,
  ttlMs,
  phases,
  phase,
  getMetadata,
  setMetadata,
  fetchImpl,
  init,
}: {
  key: string;
  url: string;
  ttlMs: number;
  phases: PhaseDurations;
  phase: keyof PhaseDurations;
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
  fetchImpl: JsonFetchImpl;
  init?: RequestInit;
}): Promise<CachedTextResponse> => {
  const cached = getMetadata<CachedTextResponse>(key);
  if (cached) return cached;

  return withDedupe(externalTextMetadataInFlight, key, async () => {
    const fromCache = getMetadata<CachedTextResponse>(key);
    if (fromCache) return fromCache;

    const response = await measurePhase(phases, phase, () =>
      fetchImpl(url, {
        cache: 'no-store',
        redirect: 'follow',
        ...init,
      }),
    );

    let data: string | null = null;
    try {
      data = await response.text();
    } catch {
      data = null;
    }

    const payload: CachedTextResponse = {
      ok: response.ok,
      status: response.status,
      data,
    };
    const failureTtlMs = Math.min(ttlMs, 2 * 60 * 1000);
    setMetadata(key, payload, response.ok ? ttlMs : failureTtlMs);
    return payload;
  });
};

const dedupeAllocineTitleVariants = (values: Array<string | null | undefined>) => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    const normalizedKey = normalizeAllocineTitle(normalized);
    if (!normalizedKey || seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    result.push(normalized);
  }

  return result;
};

const selectAllocineSearchCandidate = ({
  candidates,
  titles,
  year,
}: {
  candidates: Array<{ path: string; title: string; year: number | null }>;
  titles: string[];
  year: number | null;
}) => {
  const normalizedTitles = titles.map((title) => normalizeAllocineTitle(title)).filter(Boolean);
  const ranked = candidates
    .map((candidate) => {
      const normalizedCandidateTitle = normalizeAllocineTitle(candidate.title);
      let score = 0;
      if (normalizedTitles.includes(normalizedCandidateTitle)) {
        score += 120;
      } else if (
        normalizedTitles.some(
          (title) =>
            normalizedCandidateTitle.startsWith(title) ||
            title.startsWith(normalizedCandidateTitle),
        )
      ) {
        score += 75;
      } else if (
        normalizedTitles.some(
          (title) =>
            normalizedCandidateTitle.includes(title) || title.includes(normalizedCandidateTitle),
        )
      ) {
        score += 35;
      }

      if (year !== null && candidate.year !== null) {
        if (candidate.year === year) {
          score += 30;
        } else {
          score -= Math.min(25, Math.abs(candidate.year - year) * 3);
        }
      }

      return {
        candidate,
        score,
      };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.score > 0 ? ranked[0].candidate : null;
};

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

export const fetchAllocineRatings = async ({
  mediaType,
  title,
  originalTitle,
  releaseDate,
  cacheTtlMs,
  phases,
  getMetadata,
  setMetadata,
  fetchImpl,
}: {
  mediaType: 'movie' | 'tv';
  title?: string | null;
  originalTitle?: string | null;
  releaseDate?: string | null;
  cacheTtlMs: number;
  phases: PhaseDurations;
  getMetadata: MetadataReader;
  setMetadata: MetadataWriter;
  fetchImpl: JsonFetchImpl;
}) => {
  const titleVariants = dedupeAllocineTitleVariants([title, originalTitle]).slice(0, 3);
  if (titleVariants.length === 0) {
    return null;
  }

  const releaseYearMatch = String(releaseDate || '').match(/\b(\d{4})\b/);
  const releaseYear = releaseYearMatch ? Number(releaseYearMatch[1]) : null;
  const searchPath = mediaType === 'movie' ? 'movie' : 'series';
  let selectedPath: string | null = null;

  for (const titleVariant of titleVariants) {
    const searchKey = `allocine:search:v1:${searchPath}:${sha1Hex(titleVariant)}`;
    const searchUrl = `${ALLOCINE_BASE_URL}/rechercher/${searchPath}/?q=${encodeURIComponent(titleVariant)}`;
    let response: CachedTextResponse;

    try {
      response = await fetchExternalTextCached({
        key: searchKey,
        url: searchUrl,
        ttlMs: cacheTtlMs,
        phases,
        phase: 'mdb',
        getMetadata,
        setMetadata,
        fetchImpl,
        init: {
          headers: ALLOCINE_REQUEST_HEADERS,
        },
      });
    } catch {
      continue;
    }

    if (!response.ok || !response.data) continue;
    const candidates = extractAllocineSearchCandidates(response.data, mediaType);
    const selectedCandidate = selectAllocineSearchCandidate({
      candidates,
      titles: titleVariants,
      year: releaseYear,
    });
    if (selectedCandidate?.path) {
      selectedPath = selectedCandidate.path;
      break;
    }
  }

  if (!selectedPath) {
    return null;
  }

  const detailUrl = new URL(selectedPath, ALLOCINE_BASE_URL).toString();
  let detailResponse: CachedTextResponse;
  try {
    detailResponse = await fetchExternalTextCached({
      key: `allocine:page:v1:${sha1Hex(selectedPath)}`,
      url: detailUrl,
      ttlMs: cacheTtlMs,
      phases,
      phase: 'mdb',
      getMetadata,
      setMetadata,
      fetchImpl,
      init: {
        headers: ALLOCINE_REQUEST_HEADERS,
      },
    });
  } catch {
    return null;
  }

  if (!detailResponse.ok || !detailResponse.data) {
    return null;
  }

  const ratings = extractAllocineRatings(detailResponse.data);
  return ratings.allocine || ratings.allocinepress ? ratings : null;
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
