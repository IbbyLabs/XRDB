import {
  getImdbEpisodeFromDataset,
  findImdbEpisodeBySeriesSeasonEpisode,
} from './imdbDatasetLookup.ts';
import { resolveReverseMappedAnimeImageTarget } from './animeReverseMapping.ts';
import {
  KITSU_CACHE_TTL_MS,
  TMDB_CACHE_TTL_MS,
  type AnimeMappingProvider,
} from './imageRouteConfig.ts';
import { ANIME_MAPPING_BASE_URL, TMDB_API_BASE_URL } from './serviceBaseUrls.ts';
import { extractAnimeSubtypeFromAnimemapping } from './animeMappingPayload.ts';
import {
  fetchKitsuIdFromReverseMapping,
  fetchTmdbIdFromReverseMapping,
} from './imageRouteAnimeReverse.ts';
import { fetchKitsuFallbackAsset } from './imageRouteKitsuFallback.ts';
import {
  resolveTmdbEpisodeByAirYear,
  resolveTvdbEpisodeToTmdb,
} from './imageRouteEpisodeLookup.ts';
import {
  HttpError,
  isImdbId,
  type CachedJsonResponse,
  type CachedTextResponse,
  type PhaseDurations,
} from './imageRouteRuntime.ts';

type RouteFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type RouteFetchText = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedTextResponse>;

export type ResolvedImageRouteMediaTarget = {
  media: any;
  mediaType: 'movie' | 'tv' | null;
  useRawKitsuFallback: boolean;
  rawFallbackImageUrl: string | null;
  rawFallbackKitsuRating: string | null;
  rawFallbackTitle: string | null;
  rawFallbackLogoAspectRatio: number | null;
  mappedImdbId: string | null;
  mediaId: string;
  season: string | null;
  episode: string | null;
  allowAnimeOnlyRatings: boolean;
  hasConfirmedAnimeMapping: boolean;
};

export type ResolveImageRouteMediaTargetInput = {
  imageType: 'poster' | 'backdrop' | 'logo';
  isThumbnailRequest: boolean;
  tmdbKey: string;
  phases: PhaseDurations;
  fetchJsonCached: RouteFetchJson;
  fetchTextCached: RouteFetchText;
  mediaId: string;
  season: string | null;
  episode: string | null;
  isTmdb: boolean;
  isTvdb: boolean;
  isCanonId: boolean;
  isKitsu: boolean;
  inputAnimeMappingProvider: AnimeMappingProvider | null;
  inputAnimeMappingExternalId: string | null;
  explicitTmdbMediaType: 'movie' | 'tv' | null;
  tvdbSeriesId: string | null;
  hasNativeAnimeInput: boolean;
  allowAnimeOnlyRatings: boolean;
  hasConfirmedAnimeMapping: boolean;
};

export const resolveImageRouteMediaTarget = async (
  input: ResolveImageRouteMediaTargetInput,
): Promise<ResolvedImageRouteMediaTarget> => {
  let {
    mediaId,
    season,
    episode,
    allowAnimeOnlyRatings,
    hasConfirmedAnimeMapping,
  } = input;
  const {
    imageType,
    isThumbnailRequest,
    tmdbKey,
    phases,
    fetchJsonCached,
    fetchTextCached,
    isTmdb,
    isTvdb,
    isCanonId,
    isKitsu,
    inputAnimeMappingProvider,
    inputAnimeMappingExternalId,
    explicitTmdbMediaType,
    tvdbSeriesId,
    hasNativeAnimeInput,
  } = input;

let media = null;
let mediaType: 'movie' | 'tv' | null = null;
let useRawKitsuFallback = false;
let rawFallbackImageUrl: string | null = null;
let rawFallbackKitsuRating: string | null = null;
let rawFallbackTitle: string | null = null;
let rawFallbackLogoAspectRatio: number | null = null;
let mappedImdbId: string | null = null;

if (isTmdb) {
  if (explicitTmdbMediaType) {
    const tmdbResponse = await fetchJsonCached(
      `tmdb:${explicitTmdbMediaType}:${mediaId}`,
      `${TMDB_API_BASE_URL}/${explicitTmdbMediaType}/${mediaId}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb'
    );
    if (tmdbResponse.ok) {
      media = tmdbResponse.data;
      mediaType = explicitTmdbMediaType;
    }
  } else {
    const movieResponse = await fetchJsonCached(
      `tmdb:movie:${mediaId}`,
      `${TMDB_API_BASE_URL}/movie/${mediaId}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb'
    );
    if (movieResponse.ok) {
      media = movieResponse.data;
      mediaType = 'movie';
    } else {
      const tvResponse = await fetchJsonCached(
        `tmdb:tv:${mediaId}`,
        `${TMDB_API_BASE_URL}/tv/${mediaId}?api_key=${tmdbKey}`,
        TMDB_CACHE_TTL_MS,
        phases,
        'tmdb'
      );
      if (tvResponse.ok) {
        media = tvResponse.data;
        mediaType = 'tv';
      }
    }
  }
} else if (isTvdb) {
  if (!mediaId) {
    throw new HttpError('TVDB series ID is required', 400);
  }

  if (season && episode) {
    const mappedEpisode = await resolveTvdbEpisodeToTmdb(
      mediaId,
      season,
      episode,
      tmdbKey,
      phases,
      fetchJsonCached,
      fetchTextCached,
    );
    if (!mappedEpisode?.showId) {
      throw new HttpError('TVDB aired order episode not found on TMDB', 404);
    }
    mediaId = mappedEpisode.showId;
    season = mappedEpisode.season;
    episode = mappedEpisode.episode;
  }

  const tvFindResponse = await fetchJsonCached(
    `tmdb:find:tvdb-series:${tvdbSeriesId}`,
    `${TMDB_API_BASE_URL}/find/${tvdbSeriesId}?api_key=${tmdbKey}&external_source=tvdb_id`,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb',
  );
  const tvFindData = tvFindResponse.data || {};
  const tvResult = tvFindData.tv_results?.[0] || null;
  if (tvResult) {
    media = tvResult;
    mediaType = 'tv';
  }
} else if (isCanonId) {
  if (!mediaId) {
    throw new HttpError('IMDb ID is required', 400);
  }

  const canonicalSeriesId = mediaId;
  const imdbEpisode =
    season && episode
      ? findImdbEpisodeBySeriesSeasonEpisode(canonicalSeriesId, Number(season), Number(episode))
      : getImdbEpisodeFromDataset(canonicalSeriesId);
  const imdbLookupId = imdbEpisode?.imdbId || canonicalSeriesId;

  const findResponse = await fetchJsonCached(
    `tmdb:find:xrdbid:${imdbLookupId}`,
    `${TMDB_API_BASE_URL}/find/${imdbLookupId}?api_key=${tmdbKey}&external_source=imdb_id`,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb',
  );
  const findData = findResponse.data || {};
  const episodeResult = findData.tv_episode_results?.[0] || null;
  if (episodeResult?.show_id) {
    mediaId = String(episodeResult.show_id);
    season =
      Number.isFinite(Number(episodeResult.season_number))
        ? String(episodeResult.season_number)
        : season;
    episode =
      Number.isFinite(Number(episodeResult.episode_number))
        ? String(episodeResult.episode_number)
        : episode;
    mappedImdbId = imdbEpisode?.seriesImdbId || canonicalSeriesId;

    const showResponse = await fetchJsonCached(
      `tmdb:tv:${mediaId}`,
      `${TMDB_API_BASE_URL}/tv/${mediaId}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb',
    );
    if (showResponse.ok) {
      media = showResponse.data;
      mediaType = 'tv';
    }
  } else {
    const tvResult = findData.tv_results?.[0] || null;
    if (tvResult) {
      media = tvResult;
      mediaType = 'tv';
      if (season && episode) {
        const airYearMapping = await resolveTmdbEpisodeByAirYear(
          String(tvResult.id),
          season,
          episode,
          tmdbKey,
          phases,
          fetchJsonCached,
        );
        if (airYearMapping) {
          mediaId = airYearMapping.showId;
          season = airYearMapping.season;
          episode = airYearMapping.episode;
        }
      }
    }
  }
} else if (isKitsu) {
  let mappingUrl = `${ANIME_MAPPING_BASE_URL}/kitsu/${mediaId}`;
  if (episode) {
    mappingUrl += `?ep=${episode}`;
  }
  const mappingResponse = await fetchJsonCached(
    `kitsu:mapping:${mediaId}:${episode || '-'}`,
    mappingUrl,
    KITSU_CACHE_TTL_MS,
    phases,
    'tmdb'
  );
  const mappingData = mappingResponse.data || {};
  const mappingSubtype = extractAnimeSubtypeFromAnimemapping(mappingData);
  const mappingImdbCandidates = [
    mappingData.mappings?.ids?.imdb,
    mappingData.mappings?.ids?.imdb_id,
    mappingData.mappings?.imdb,
    mappingData.imdb_id,
    mappingData.imdb,
  ];
  for (const candidate of mappingImdbCandidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (isImdbId(normalized)) {
      mappedImdbId = normalized;
      break;
    }
  }

  let tmdbId = '';
  const tmdbEpisode = mappingData.mappings?.tmdb_episode || mappingData.tmdb_episode;
  if (episode && tmdbEpisode) {
    tmdbId = tmdbEpisode.id;
    season = tmdbEpisode.season;
    episode = tmdbEpisode.episode;
  } else if (mappingData.mappings?.ids?.tmdb) {
    tmdbId = mappingData.mappings.ids.tmdb;
  }

  if (mappingSubtype !== 'movie' && !season) {
    const seasonProbeResponse = await fetchJsonCached(
      `kitsu:mapping:${mediaId}:1`,
      `${ANIME_MAPPING_BASE_URL}/kitsu/${mediaId}?ep=1`,
      KITSU_CACHE_TTL_MS,
      phases,
      'tmdb'
    );
    const seasonProbeData = seasonProbeResponse.data;
    const seasonProbeEpisode = seasonProbeData?.mappings?.tmdb_episode || seasonProbeData?.tmdb_episode;
    if (seasonProbeEpisode?.season) {
      season = seasonProbeEpisode.season;
    }
  }

  if (!tmdbId) {
    const kitsuFallbackAsset = await fetchKitsuFallbackAsset(mediaId, imageType, phases, fetchJsonCached);
    rawFallbackImageUrl = kitsuFallbackAsset?.imageUrl || null;
    rawFallbackKitsuRating = kitsuFallbackAsset?.rating || null;
    rawFallbackTitle = kitsuFallbackAsset?.title || null;
    rawFallbackLogoAspectRatio = kitsuFallbackAsset?.logoAspectRatio ?? null;
    if (!rawFallbackImageUrl) {
      throw new HttpError('TMDB ID not found for Kitsu ID', 404);
    }
    useRawKitsuFallback = true;
    allowAnimeOnlyRatings = true;
    hasConfirmedAnimeMapping = true;
  } else {
    const mappedMediaTypeCandidates: Array<'movie' | 'tv'> =
      mappingSubtype === 'movie' ? ['movie', 'tv'] : ['tv', 'movie'];

    for (const mappedMediaType of mappedMediaTypeCandidates) {
      const mappedMediaResponse = await fetchJsonCached(
        `tmdb:${mappedMediaType}:${tmdbId}`,
        `${TMDB_API_BASE_URL}/${mappedMediaType}/${tmdbId}?api_key=${tmdbKey}`,
        TMDB_CACHE_TTL_MS,
        phases,
        'tmdb'
      );
      if (!mappedMediaResponse.ok) continue;
      media = mappedMediaResponse.data;
      mediaType = mappedMediaType;
      break;
    }

    if (!media || !mediaType) {
      const kitsuFallbackAsset = await fetchKitsuFallbackAsset(mediaId, imageType, phases, fetchJsonCached);
      rawFallbackImageUrl = kitsuFallbackAsset?.imageUrl || null;
      rawFallbackKitsuRating = kitsuFallbackAsset?.rating || null;
      rawFallbackTitle = kitsuFallbackAsset?.title || null;
      rawFallbackLogoAspectRatio = kitsuFallbackAsset?.logoAspectRatio ?? null;
      if (!rawFallbackImageUrl) {
        throw new HttpError('Movie/Show not found on TMDB', 404);
      }
      useRawKitsuFallback = true;
      allowAnimeOnlyRatings = true;
      hasConfirmedAnimeMapping = true;
    }
  }
} else if (
  inputAnimeMappingProvider &&
  inputAnimeMappingExternalId &&
  inputAnimeMappingProvider !== 'imdb' &&
  inputAnimeMappingProvider !== 'tmdb'
) {
  const reverseMappedAnimeTarget = await resolveReverseMappedAnimeImageTarget({
    imageType,
    fetchTmdbId: () =>
      fetchTmdbIdFromReverseMapping({
        provider: inputAnimeMappingProvider,
        externalId: inputAnimeMappingExternalId,
        season,
        phases,
        fetchJsonCached,
      }),
    fetchKitsuId: () =>
      fetchKitsuIdFromReverseMapping({
        provider: inputAnimeMappingProvider,
        externalId: inputAnimeMappingExternalId,
        season,
        phases,
        fetchJsonCached,
      }),
    fetchTmdbMedia: async (mappedTmdbId, mappedMediaType) => {
      const mappedMediaResponse = await fetchJsonCached(
        `tmdb:${mappedMediaType}:${mappedTmdbId}`,
        `${TMDB_API_BASE_URL}/${mappedMediaType}/${mappedTmdbId}?api_key=${tmdbKey}`,
        TMDB_CACHE_TTL_MS,
        phases,
        'tmdb'
      );
      return mappedMediaResponse.ok ? mappedMediaResponse.data : null;
    },
    fetchKitsuFallbackAsset: (kitsuId, fallbackImageType) =>
      fetchKitsuFallbackAsset(kitsuId, fallbackImageType, phases, fetchJsonCached),
  });

  if (reverseMappedAnimeTarget.kind === 'tmdb') {
    media = reverseMappedAnimeTarget.media;
    mediaType = reverseMappedAnimeTarget.mediaType;
    allowAnimeOnlyRatings = true;
    hasConfirmedAnimeMapping = true;
  } else if (reverseMappedAnimeTarget.kind === 'kitsu-fallback') {
    rawFallbackImageUrl = reverseMappedAnimeTarget.fallbackAsset.imageUrl || null;
    rawFallbackKitsuRating = reverseMappedAnimeTarget.fallbackAsset.rating || null;
    rawFallbackTitle = reverseMappedAnimeTarget.fallbackAsset.title || null;
    rawFallbackLogoAspectRatio = reverseMappedAnimeTarget.fallbackAsset.logoAspectRatio ?? null;
    useRawKitsuFallback = true;
    allowAnimeOnlyRatings = true;
    hasConfirmedAnimeMapping = true;
  } else if (!reverseMappedAnimeTarget.tmdbId) {
    throw new HttpError('TMDB ID not found for anime mapping ID', 404);
  }
} else {
  const findResponse = await fetchJsonCached(
    `tmdb:find:${mediaId}`,
    `${TMDB_API_BASE_URL}/find/${mediaId}?api_key=${tmdbKey}&external_source=imdb_id`,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb'
  );
  const findData = findResponse.data || {};
  const prefersTvResult =
    isThumbnailRequest ||
    (typeof season === 'string' && season.length > 0) ||
    (typeof episode === 'string' && episode.length > 0);
  media = prefersTvResult
    ? findData.tv_results?.[0] || findData.movie_results?.[0]
    : findData.movie_results?.[0] || findData.tv_results?.[0];
  mediaType = media
    ? findData.tv_results?.[0] && media === findData.tv_results[0]
      ? 'tv'
      : 'movie'
    : null;
}

if (!media && !useRawKitsuFallback) {
  throw new HttpError('Movie/Show not found on TMDB', 404);
}

  return {
    media,
    mediaType,
    useRawKitsuFallback,
    rawFallbackImageUrl,
    rawFallbackKitsuRating,
    rawFallbackTitle,
    rawFallbackLogoAspectRatio,
    mappedImdbId,
    mediaId,
    season,
    episode,
    allowAnimeOnlyRatings,
    hasConfirmedAnimeMapping,
  };
};
