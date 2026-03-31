import { DEFAULT_METADATA_TRANSLATION_MODE } from './metadataTranslation.ts';
import {
  buildXrdbImageUrl,
  normalizeXrdbId,
  type ProxyConfig,
} from './proxyConfigBridge.ts';
import {
  applyTranslatedTextFields,
  extractTmdbTextCandidates,
  hasMeaningfulText,
  isAnimeXrdbId,
  normalizeStremioType,
  resolveAnimeTextFallback,
  resolveTmdbTranslationFieldAvailability,
  resolveTmdbTranslationTarget,
} from './proxyMetaTranslation.ts';
import { findImdbEpisodeBySeriesSeasonEpisode } from './imdbDatasetLookup.ts';
import {
  applyEpisodeIdModeToXrdbId,
  XRDBID_PREFIX,
  normalizeEpisodeIdMode,
} from './episodeIdentity.ts';
import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';

const ANILIST_GRAPHQL_URL = process.env.XRDB_ANILIST_GRAPHQL_URL?.trim() || 'https://graphql.anilist.co';
const ANILIST_MEDIA_QUERY = `
  query XrdbAnimeTextFallback($id: Int) {
    Media(id: $id, type: ANIME) {
      title {
        romaji
        english
        native
        userPreferred
      }
      description(asHtml: false)
    }
  }
`;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type ProxyTmdbTarget = {
  id: number;
  type: 'movie' | 'tv';
  details: Record<string, unknown>;
  season?: number | null;
  episode?: number | null;
};

const TMDB_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TMDB_FAILED_TTL_MS = 2 * 60 * 1000;
const ANIME_MAPPING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ANIME_MAPPING_FAILED_TTL_MS = 2 * 60 * 1000;

const tmdbFetchCache = new Map<string, CacheEntry<Promise<any>>>();
const animeMappingFetchCache = new Map<string, CacheEntry<Promise<any>>>();
const kitsuFetchCache = new Map<string, CacheEntry<Promise<any>>>();
const anilistFetchCache = new Map<string, CacheEntry<Promise<any>>>();
const textFetchCache = new Map<string, CacheEntry<Promise<any>>>();

const prunePromiseCache = (cache: Map<string, CacheEntry<Promise<any>>>) => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
};

const createCachedValueFetcher = <T,>(
  cache: Map<string, CacheEntry<Promise<any>>>,
  successTtlMs: number,
  failedTtlMs: number,
  resolver: (key: string) => Promise<T>,
) => async (key: string): Promise<T | null> => {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (cache.size > 2000) {
    prunePromiseCache(cache);
  }

  const entry: CacheEntry<Promise<any>> = {
    value: Promise.resolve(null),
    expiresAt: now + successTtlMs,
  };
  cache.set(key, entry);

  const promise = (async () => {
    let result: T | null = null;
    try {
      result = await resolver(key);
    } catch {}

    entry.expiresAt = Date.now() + (result ? successTtlMs : failedTtlMs);
    return result;
  })();

  entry.value = promise;
  return promise;
};

const createCachedJsonFetcher = (
  cache: Map<string, CacheEntry<Promise<any>>>,
  successTtlMs: number,
  failedTtlMs: number,
) =>
  createCachedValueFetcher(cache, successTtlMs, failedTtlMs, async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      return null;
    }
    return response.json();
  });

const fetchTmdbJson = createCachedJsonFetcher(tmdbFetchCache, TMDB_CACHE_TTL_MS, TMDB_FAILED_TTL_MS);
const fetchAnimeMappingJson = createCachedJsonFetcher(
  animeMappingFetchCache,
  ANIME_MAPPING_CACHE_TTL_MS,
  ANIME_MAPPING_FAILED_TTL_MS,
);
const fetchKitsuJson = createCachedJsonFetcher(
  kitsuFetchCache,
  ANIME_MAPPING_CACHE_TTL_MS,
  ANIME_MAPPING_FAILED_TTL_MS,
);
const fetchAniListMediaJson = createCachedValueFetcher(
  anilistFetchCache,
  ANIME_MAPPING_CACHE_TTL_MS,
  ANIME_MAPPING_FAILED_TTL_MS,
  async (id: string) => {
    const mediaId = Number.parseInt(id, 10);
    if (!Number.isFinite(mediaId) || mediaId <= 0) {
      return null;
    }

    const response = await fetch(ANILIST_GRAPHQL_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        query: ANILIST_MEDIA_QUERY,
        variables: { id: mediaId },
      }),
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (payload?.errors) {
      return null;
    }
    return payload;
  },
);
const fetchText = createCachedValueFetcher(
  textFetchCache,
  ANIME_MAPPING_CACHE_TTL_MS,
  ANIME_MAPPING_FAILED_TTL_MS,
  async (url: string) => {
    const response = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) {
      return null;
    }
    try {
      return await response.text();
    } catch {
      return null;
    }
  },
);

export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
) => {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) {
        return;
      }
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
};

const fetchTmdbDetails = async (
  tmdbId: number,
  type: 'movie' | 'tv',
  tmdbKey: string,
  lang: string | null,
) => {
  const detailsUrl = new URL(`${TMDB_API_BASE_URL}/${type}/${tmdbId}`);
  detailsUrl.searchParams.set('api_key', tmdbKey);
  if (lang) {
    detailsUrl.searchParams.set('language', lang);
  }
  const details = await fetchTmdbJson(detailsUrl.toString());
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  return details as Record<string, unknown>;
};

const extractTvdbEpisodeIdFromAiredOrderHtml = (
  html: string,
  seriesPageUrl: string,
  season: string,
  episode: string,
) => {
  const seasonNumber = Number.parseInt(season, 10);
  const episodeNumber = Number.parseInt(episode, 10);
  if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) {
    return null;
  }

  const escapedSeriesSlug = seriesPageUrl
    .replace(/^https?:\/\/thetvdb\.com/i, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const episodeCode = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
  const matcher = new RegExp(
    `${episodeCode}[\\s\\S]{0,1200}?href="${escapedSeriesSlug}/episodes/(\\d+)"`,
    'i',
  );
  return html.match(matcher)?.[1] || null;
};

const resolveTvdbProxyTarget = async (
  xrdbId: string,
  tmdbKey: string,
  lang: string | null,
): Promise<ProxyTmdbTarget | null> => {
  const parts = xrdbId.split(':');
  const seriesId = parts[1];
  const season = parts[2];
  const episode = parts[3];
  if (!seriesId) {
    return null;
  }

  if (season && episode) {
    const seriesUrl = `https://thetvdb.com/dereferrer/series/${encodeURIComponent(seriesId)}`;
    const seriesResponse = await fetch(seriesUrl, { cache: 'no-store', redirect: 'follow' }).catch(() => null);
    const seriesPageUrl = seriesResponse?.ok ? seriesResponse.url : null;
    if (seriesPageUrl) {
      const airedOrderUrl = `${seriesPageUrl.replace(/\/+$/, '')}/allseasons/official`;
      const html = await fetchText(airedOrderUrl);
      const tvdbEpisodeId =
        typeof html === 'string'
          ? extractTvdbEpisodeIdFromAiredOrderHtml(html, seriesPageUrl, season, episode)
          : null;

      if (tvdbEpisodeId) {
        const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${encodeURIComponent(tvdbEpisodeId)}`);
        findUrl.searchParams.set('api_key', tmdbKey);
        findUrl.searchParams.set('external_source', 'tvdb_id');
        if (lang) {
          findUrl.searchParams.set('language', lang);
        }

        const data = await fetchTmdbJson(findUrl.toString());
        const episodeResult = Array.isArray(data?.tv_episode_results) ? data.tv_episode_results[0] : null;
        const showId = Number(episodeResult?.show_id);
        if (Number.isFinite(showId)) {
          const details = await fetchTmdbDetails(showId, 'tv', tmdbKey, lang);
          if (!details) {
            return null;
          }
          return {
            id: showId,
            type: 'tv',
            details,
            season: Number.isFinite(Number(episodeResult?.season_number))
              ? Number(episodeResult.season_number)
              : null,
            episode: Number.isFinite(Number(episodeResult?.episode_number))
              ? Number(episodeResult.episode_number)
              : null,
          };
        }
      }
    }
  }

  const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${encodeURIComponent(seriesId)}`);
  findUrl.searchParams.set('api_key', tmdbKey);
  findUrl.searchParams.set('external_source', 'tvdb_id');
  if (lang) {
    findUrl.searchParams.set('language', lang);
  }
  const data = await fetchTmdbJson(findUrl.toString());
  const tvResult = Array.isArray(data?.tv_results) ? data.tv_results[0] : null;
  const id = Number(tvResult?.id);
  if (!Number.isFinite(id)) {
    return null;
  }
  const details = await fetchTmdbDetails(id, 'tv', tmdbKey, lang);
  if (!details) {
    return null;
  }
  return { id, type: 'tv', details };
};

const resolveProxyEpisodeByAirYear = async (
  tmdbShowId: number,
  requestedSeason: number,
  requestedEpisode: number,
  tmdbKey: string,
) => {
  const showUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbShowId}`);
  showUrl.searchParams.set('api_key', tmdbKey);
  const showData = await fetchTmdbJson(showUrl.toString());
  const numberOfSeasons = Number(showData?.number_of_seasons);
  if (!Number.isFinite(numberOfSeasons) || numberOfSeasons < 1) {
    return null;
  }

  const yearBuckets = new Map<number, Array<{ season: number; episode: number }>>();
  for (let seasonNumber = 1; seasonNumber <= numberOfSeasons; seasonNumber += 1) {
    const seasonUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbShowId}/season/${seasonNumber}`);
    seasonUrl.searchParams.set('api_key', tmdbKey);
    const seasonData = await fetchTmdbJson(seasonUrl.toString());
    const episodes = Array.isArray(seasonData?.episodes) ? seasonData.episodes : [];
    for (const episodeData of episodes) {
      const airDate = typeof episodeData?.air_date === 'string' ? episodeData.air_date : '';
      const airYear = Number.parseInt(airDate.slice(0, 4), 10);
      const tmdbEpisode = Number(episodeData?.episode_number);
      if (!Number.isFinite(airYear) || !Number.isFinite(tmdbEpisode)) {
        continue;
      }
      const bucket = yearBuckets.get(airYear) || [];
      bucket.push({ season: seasonNumber, episode: tmdbEpisode });
      yearBuckets.set(airYear, bucket);
    }
  }

  const orderedYears = [...yearBuckets.keys()].sort((left, right) => left - right);
  const bucketYear = orderedYears[requestedSeason - 1];
  if (!Number.isFinite(bucketYear)) {
    return null;
  }
  const bucketEpisodes = yearBuckets.get(bucketYear) || [];
  return bucketEpisodes[requestedEpisode - 1] || null;
};

const resolveXrdbIdProxyTarget = async (
  xrdbId: string,
  tmdbKey: string,
  lang: string | null,
): Promise<ProxyTmdbTarget | null> => {
  const parts = xrdbId.split(':');
  const imdbId = parts[1];
  const season = Number.parseInt(String(parts[2] || ''), 10);
  const episode = Number.parseInt(String(parts[3] || ''), 10);
  if (!imdbId) {
    return null;
  }

  const mappedEpisode =
    Number.isFinite(season) && Number.isFinite(episode)
      ? findImdbEpisodeBySeriesSeasonEpisode(imdbId, season, episode)
      : null;
  const lookupImdbId = mappedEpisode?.imdbId || imdbId;

  const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${encodeURIComponent(lookupImdbId)}`);
  findUrl.searchParams.set('api_key', tmdbKey);
  findUrl.searchParams.set('external_source', 'imdb_id');
  if (lang) {
    findUrl.searchParams.set('language', lang);
  }

  const data = await fetchTmdbJson(findUrl.toString());
  const episodeResult = Array.isArray(data?.tv_episode_results) ? data.tv_episode_results[0] : null;
  if (episodeResult?.show_id) {
    const showId = Number(episodeResult.show_id);
    if (!Number.isFinite(showId)) {
      return null;
    }
    const details = await fetchTmdbDetails(showId, 'tv', tmdbKey, lang);
    if (!details) {
      return null;
    }
    return {
      id: showId,
      type: 'tv',
      details,
      season: Number.isFinite(Number(episodeResult?.season_number))
        ? Number(episodeResult.season_number)
        : null,
      episode: Number.isFinite(Number(episodeResult?.episode_number))
        ? Number(episodeResult.episode_number)
        : null,
    };
  }

  const tvResult = Array.isArray(data?.tv_results) ? data.tv_results[0] : null;
  const showId = Number(tvResult?.id);
  if (!Number.isFinite(showId)) {
    return null;
  }
  const details = await fetchTmdbDetails(showId, 'tv', tmdbKey, lang);
  if (!details) {
    return null;
  }
  const airYearFallback =
    Number.isFinite(season) && Number.isFinite(episode)
      ? await resolveProxyEpisodeByAirYear(showId, season, episode, tmdbKey)
      : null;
  return {
    id: showId,
    type: 'tv',
    details,
    season: airYearFallback?.season ?? (Number.isFinite(season) ? season : null),
    episode: airYearFallback?.episode ?? (Number.isFinite(episode) ? episode : null),
  };
};

const isCinemetaManifestUrl = (value: string) => {
  try {
    return /(^|[-.])cinemeta\.strem\.io$/i.test(new URL(value).hostname);
  } catch {
    return false;
  }
};

const isAiometadataManifestUrl = (value: string) => value.toLowerCase().includes('aiometadata');

export const normalizeProxyXrdbId = (
  rawId: string | null,
  rawType: string | null,
  config: ProxyConfig,
) => {
  const normalized = normalizeXrdbId(rawId, rawType);
  if (!normalized) {
    return null;
  }

  const normalizedType = normalizeStremioType(rawType);
  if (!isAiometadataManifestUrl(config.url) && !isCinemetaManifestUrl(config.url)) {
    return normalized;
  }

  return applyEpisodeIdModeToXrdbId(
    normalized,
    normalizeEpisodeIdMode(config.episodeIdMode),
    normalizedType,
  );
};

const resolveProxyTmdbTarget = async ({
  xrdbId,
  metaType,
  tmdbKey,
  lang,
}: {
  xrdbId: string;
  metaType: unknown;
  tmdbKey: string;
  lang: string | null;
}): Promise<ProxyTmdbTarget | null> => {
  if (xrdbId.startsWith('tvdb:')) {
    return resolveTvdbProxyTarget(xrdbId, tmdbKey, lang);
  }

  if (xrdbId.startsWith(`${XRDBID_PREFIX}:`)) {
    return resolveXrdbIdProxyTarget(xrdbId, tmdbKey, lang);
  }

  const target = await resolveTmdbTranslationTarget({
    xrdbId,
    metaType,
    tmdbKey,
    lang,
    fetchTmdbJson,
    fetchAnimeMappingJson,
  });

  if (!target) {
    return null;
  }
  return target;
};

const resolveProxyEpisodeTmdbTarget = async ({
  baseXrdbId,
  metaType,
  tmdbKey,
  lang,
  seasonValue,
  episodeValue,
}: {
  baseXrdbId: string;
  metaType: unknown;
  tmdbKey: string;
  lang: string | null;
  seasonValue: number;
  episodeValue: number;
}) => {
  if (!Number.isFinite(seasonValue) || !Number.isFinite(episodeValue)) {
    return null;
  }

  if (baseXrdbId.startsWith('tvdb:') || baseXrdbId.startsWith(`${XRDBID_PREFIX}:`)) {
    return resolveProxyTmdbTarget({
      xrdbId: `${baseXrdbId}:${seasonValue}:${episodeValue}`,
      metaType,
      tmdbKey,
      lang,
    });
  }

  const baseTarget = await resolveProxyTmdbTarget({
    xrdbId: baseXrdbId,
    metaType,
    tmdbKey,
    lang,
  });
  if (!baseTarget || baseTarget.type !== 'tv') {
    return null;
  }

  return {
    ...baseTarget,
    season: seasonValue,
    episode: episodeValue,
  };
};

export const isTypeEnabled = (
  config: ProxyConfig,
  type: 'poster' | 'backdrop' | 'thumbnail' | 'logo',
) => {
  if (type === 'poster') return config.posterEnabled !== false;
  if (type === 'backdrop') return config.backdropEnabled !== false;
  if (type === 'thumbnail') return config.thumbnailEnabled !== false;
  return config.logoEnabled !== false;
};

const rewriteMetaVideoThumbnails = (
  meta: Record<string, unknown>,
  requestUrl: URL,
  config: ProxyConfig,
) => {
  if (!isTypeEnabled(config, 'thumbnail')) return meta;
  if (!Array.isArray(meta.videos) || meta.videos.length === 0) return meta;

  const rawId = typeof meta.id === 'string' ? meta.id : null;
  const rawType = typeof meta.type === 'string' ? meta.type : null;
  const xrdbId = normalizeProxyXrdbId(rawId, rawType, config);
  if (!xrdbId) return meta;

  const nextVideos = meta.videos.map((video) => {
    if (!video || typeof video !== 'object') return video;
    const typedVideo = video as Record<string, unknown>;
    const seasonValue =
      typeof typedVideo.season === 'number'
        ? typedVideo.season
        : Number.parseInt(String(typedVideo.season || ''), 10);
    const episodeValue =
      typeof typedVideo.episode === 'number'
        ? typedVideo.episode
        : Number.parseInt(String(typedVideo.episode || ''), 10);
    if (!Number.isFinite(seasonValue) || !Number.isFinite(episodeValue)) {
      return video;
    }

    const sourceThumbnailUrl =
      typeof typedVideo.thumbnail === 'string' ? typedVideo.thumbnail.trim() : '';

    return {
      ...typedVideo,
      thumbnail: buildXrdbImageUrl({
        reqUrl: requestUrl,
        imageType: 'thumbnail',
        xrdbId,
        seasonNumber: seasonValue,
        episodeNumber: episodeValue,
        tmdbKey: config.tmdbKey,
        mdblistKey: config.mdblistKey,
        simklClientId: config.simklClientId,
        fallbackUrl: sourceThumbnailUrl || null,
        config,
      }),
    };
  });

  return {
    ...meta,
    videos: nextVideos,
  };
};

export const rewriteMetaImages = (
  meta: Record<string, unknown>,
  requestUrl: URL,
  config: ProxyConfig,
) => {
  if (!meta || typeof meta !== 'object') return meta;

  const rawId = typeof meta.id === 'string' ? meta.id : null;
  const rawType = typeof meta.type === 'string' ? meta.type : null;
  const xrdbId = normalizeProxyXrdbId(rawId, rawType, config);
  if (!xrdbId) return meta;

  const nextMeta: Record<string, unknown> = { ...meta };
  const sourcePosterUrl = typeof meta.poster === 'string' ? meta.poster.trim() : '';
  const sourceBackdropUrl = typeof meta.background === 'string' ? meta.background.trim() : '';
  const sourceLogoUrl = typeof meta.logo === 'string' ? meta.logo.trim() : '';

  if (isTypeEnabled(config, 'poster')) {
    nextMeta.poster = buildXrdbImageUrl({
      reqUrl: requestUrl,
      imageType: 'poster',
      xrdbId,
      tmdbKey: config.tmdbKey,
      mdblistKey: config.mdblistKey,
      simklClientId: config.simklClientId,
      fallbackUrl: sourcePosterUrl || null,
      config,
    });
  }

  if (isTypeEnabled(config, 'backdrop')) {
    nextMeta.background = buildXrdbImageUrl({
      reqUrl: requestUrl,
      imageType: 'backdrop',
      xrdbId,
      tmdbKey: config.tmdbKey,
      mdblistKey: config.mdblistKey,
      simklClientId: config.simklClientId,
      fallbackUrl: sourceBackdropUrl || null,
      config,
    });
  }

  if (isTypeEnabled(config, 'logo')) {
    nextMeta.logo = buildXrdbImageUrl({
      reqUrl: requestUrl,
      imageType: 'logo',
      xrdbId,
      tmdbKey: config.tmdbKey,
      mdblistKey: config.mdblistKey,
      simklClientId: config.simklClientId,
      fallbackUrl: sourceLogoUrl || null,
      config,
    });
  }

  return rewriteMetaVideoThumbnails(nextMeta, requestUrl, config);
};

export const translateMetaPayload = async (
  meta: Record<string, unknown>,
  requestUrl: URL,
  config: ProxyConfig,
) => {
  if (!config.translateMeta) return meta;

  const mode = config.translateMetaMode || DEFAULT_METADATA_TRANSLATION_MODE;
  const debugMetaTranslation = config.debugMetaTranslation === true;
  const lang = config.lang || requestUrl.searchParams.get('lang');
  if (!lang) return meta;

  const rawId = typeof meta.id === 'string' ? meta.id : null;
  const rawType = typeof meta.type === 'string' ? meta.type : null;
  const xrdbId = normalizeProxyXrdbId(rawId, rawType, config);
  if (!xrdbId) return meta;

  const tmdbTarget = await resolveProxyTmdbTarget({
    xrdbId,
    metaType: rawType,
    tmdbKey: config.tmdbKey,
    lang,
  });
  const tmdbId = tmdbTarget?.id ?? null;
  const tmdbType = tmdbTarget?.type ?? null;
  const details = tmdbTarget?.details ?? null;
  const { title: translatedTitle, overview: translatedOverview } = extractTmdbTextCandidates(details);

  const needsTmdbLanguageCheck = mode === 'prefer-requested-language' || debugMetaTranslation;
  const tmdbRequestedLanguage =
    tmdbTarget && needsTmdbLanguageCheck
      ? await resolveTmdbTranslationFieldAvailability({
          tmdbId: tmdbTarget.id,
          type: tmdbTarget.type,
          tmdbKey: config.tmdbKey,
          lang,
          fetchTmdbJson,
        })
      : { title: null, overview: null };

  const shouldFetchAnimeFallback =
    isAnimeXrdbId(xrdbId) &&
    (debugMetaTranslation ||
      !tmdbTarget ||
      (mode === 'prefer-requested-language' &&
        (tmdbRequestedLanguage.title === false || tmdbRequestedLanguage.overview === false)) ||
      !hasMeaningfulText(translatedTitle) ||
      !hasMeaningfulText(translatedOverview));

  const animeFallback = shouldFetchAnimeFallback
    ? await resolveAnimeTextFallback({
        xrdbId,
        lang,
        fetchAnimeMappingJson,
        fetchKitsuJson,
        fetchAniListMediaJson,
      })
    : null;

  const nextMeta: Record<string, unknown> = { ...meta };
  const topLevelDebug = applyTranslatedTextFields(nextMeta, {
    mode,
    tmdbTitle: translatedTitle,
    tmdbOverview: translatedOverview,
    tmdbTitleExactRequestedLanguage: tmdbRequestedLanguage.title,
    tmdbOverviewExactRequestedLanguage: tmdbRequestedLanguage.overview,
    animeTitle: animeFallback?.title.value ?? null,
    animeOverview: animeFallback?.overview.value ?? null,
    animeTitleSource: animeFallback?.title.source ?? null,
    animeOverviewSource: animeFallback?.overview.source ?? null,
    animeTitleExactRequestedLanguage: animeFallback?.title.exactRequestedLanguage ?? null,
    animeOverviewExactRequestedLanguage: animeFallback?.overview.exactRequestedLanguage ?? null,
  });

  if (debugMetaTranslation) {
    nextMeta._xrdbMetaTranslation = {
      requestedLanguage: lang,
      mode,
      xrdbId,
      resolutionPath: xrdbId.startsWith('tmdb:')
        ? 'tmdb'
        : xrdbId.startsWith('tvdb:')
          ? 'tvdb'
          : xrdbId.startsWith(`${XRDBID_PREFIX}:`)
            ? 'xrdbid'
            : /^tt\d+$/i.test(xrdbId)
              ? 'imdb'
              : isAnimeXrdbId(xrdbId)
                ? 'anime'
                : 'unknown',
      tmdbTarget:
        tmdbId && tmdbType
          ? {
              id: tmdbId,
              type: tmdbType,
              requestedLanguage: tmdbRequestedLanguage,
            }
          : null,
      animeFallback:
        animeFallback
          ? {
              titleSource: animeFallback.title.source,
              titleExactRequestedLanguage: animeFallback.title.exactRequestedLanguage,
              overviewSource: animeFallback.overview.source,
              overviewExactRequestedLanguage: animeFallback.overview.exactRequestedLanguage,
            }
          : null,
      fields: topLevelDebug,
    };
  }

  if (tmdbType === 'tv' && tmdbId && Array.isArray(nextMeta.videos) && nextMeta.videos.length > 0) {
    const videos = nextMeta.videos as Array<Record<string, unknown>>;
    const seasonValues = new Set<number>();
    for (const video of videos) {
      const seasonValue =
        typeof video.season === 'number'
          ? video.season
          : Number.parseInt(String(video.season || ''), 10);
      if (Number.isFinite(seasonValue)) {
        seasonValues.add(seasonValue);
      }
    }

    const seasonDataMap = new Map<number, any>();
    await mapWithConcurrency(Array.from(seasonValues), 6, async (seasonValue) => {
      const seasonUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbId}/season/${seasonValue}`);
      seasonUrl.searchParams.set('api_key', config.tmdbKey);
      seasonUrl.searchParams.set('language', lang);
      const seasonData = await fetchTmdbJson(seasonUrl.toString());
      if (seasonData && typeof seasonData === 'object') {
        seasonDataMap.set(seasonValue, seasonData);
      }
    });

    const translatedVideos = await mapWithConcurrency(videos, 6, async (video) => {
      const seasonValue =
        typeof video.season === 'number'
          ? video.season
          : Number.parseInt(String(video.season || ''), 10);
      const episodeValue =
        typeof video.episode === 'number'
          ? video.episode
          : Number.parseInt(String(video.episode || ''), 10);

      if (!Number.isFinite(seasonValue) || !Number.isFinite(episodeValue)) {
        return video;
      }

      const resolvedEpisodeTarget = await resolveProxyEpisodeTmdbTarget({
        baseXrdbId: xrdbId,
        metaType: rawType,
        tmdbKey: config.tmdbKey,
        lang,
        seasonValue,
        episodeValue,
      });
      if (!resolvedEpisodeTarget || resolvedEpisodeTarget.type !== 'tv') {
        return video;
      }

      const resolvedSeason =
        typeof resolvedEpisodeTarget.season === 'number' && resolvedEpisodeTarget.season > 0
          ? resolvedEpisodeTarget.season
          : seasonValue;
      const resolvedEpisode =
        typeof resolvedEpisodeTarget.episode === 'number' && resolvedEpisodeTarget.episode > 0
          ? resolvedEpisodeTarget.episode
          : episodeValue;

      if (resolvedSeason !== seasonValue && !seasonDataMap.has(resolvedSeason)) {
        const seasonUrl = new URL(`${TMDB_API_BASE_URL}/tv/${tmdbId}/season/${resolvedSeason}`);
        seasonUrl.searchParams.set('api_key', config.tmdbKey);
        seasonUrl.searchParams.set('language', lang);
        const seasonData = await fetchTmdbJson(seasonUrl.toString());
        if (seasonData && typeof seasonData === 'object') {
          seasonDataMap.set(resolvedSeason, seasonData);
        }
      }

      const seasonData = seasonDataMap.get(resolvedSeason);
      const episodesArray = Array.isArray(seasonData?.episodes) ? seasonData.episodes : [];
      const episodeData = episodesArray.find((ep: any) => Number(ep.episode_number) === resolvedEpisode);
      if (!episodeData) {
        return video;
      }

      const episodeTitle = typeof episodeData.name === 'string' ? episodeData.name : null;
      const episodeOverview = typeof episodeData.overview === 'string' ? episodeData.overview : null;
      if (!episodeTitle && !episodeOverview) {
        return video;
      }

      const episodeRequestedLanguage = needsTmdbLanguageCheck
        ? await resolveTmdbTranslationFieldAvailability({
            tmdbId: resolvedEpisodeTarget.id,
            type: resolvedEpisodeTarget.type,
            tmdbKey: config.tmdbKey,
            lang,
            fetchTmdbJson,
            seasonNumber: resolvedSeason,
            episodeNumber: resolvedEpisode,
          })
        : { title: null, overview: null };

      const nextVideo = { ...video };
      const episodeDebug = applyTranslatedTextFields(nextVideo, {
        mode,
        tmdbTitle: episodeTitle,
        tmdbOverview: episodeOverview,
        tmdbTitleExactRequestedLanguage: episodeRequestedLanguage.title,
        tmdbOverviewExactRequestedLanguage: episodeRequestedLanguage.overview,
      });

      if (debugMetaTranslation) {
        nextVideo._xrdbMetaTranslation = {
          scope: 'episode',
          requestedLanguage: lang,
          mode,
          tmdbTarget: {
            id: resolvedEpisodeTarget.id,
            type: resolvedEpisodeTarget.type,
            season: resolvedSeason,
            episode: resolvedEpisode,
            requestedLanguage: episodeRequestedLanguage,
          },
          fields: episodeDebug,
        };
      }

      return nextVideo;
    });

    nextMeta.videos = translatedVideos;
  }

  return nextMeta;
};
