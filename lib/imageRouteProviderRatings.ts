import { getImdbRatingFromDataset, type ImdbDatasetRating } from './imdbDatasetLookup.ts';
import {
  fetchAniListIdFromReverseMapping,
  fetchKitsuIdFromReverseMapping,
  fetchMalIdFromReverseMapping,
} from './imageRouteAnimeReverse.ts';
import {
  fetchAniListRating,
  fetchKitsuRating,
  fetchMyAnimeListRating,
} from './imageRouteAnimeRatings.ts';
import {
  IMDB_DATASET_CACHE_TTL_MS,
  KITSU_CACHE_TTL_MS,
  MDBLIST_CACHE_TTL_MS,
  MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
  SIMKL_CACHE_TTL_MS,
  type AnimeMappingProvider,
  type BadgeKey,
} from './imageRouteConfig.ts';
import { fetchSimklRating, fetchTraktRating } from './imageRouteExternalRatings.ts';
import { fetchMdbListRatings } from './imageRouteMdbFetch.ts';
import { getMdbListCacheTtlMs, getRatingCacheTtlMs } from './imageRouteMdbList.ts';
import { normalizeRatingValue } from './imageRouteMedia.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';
import type {
  CachedJsonNetworkObserver,
  CachedJsonResponse,
  JsonFetchImpl,
  PhaseDurations,
} from './imageRouteRuntime.ts';

type ProviderRatingsFetchJson = (
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

type MediaRecord = {
  id?: number | string | null;
  imdb_id?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
};

type BundledExternalIds = {
  imdb_id?: string | null;
};

type DetailsBundleRecord = {
  bundledExternalIds?: BundledExternalIds | null;
};

type ProviderRatingsDeps = {
  fetchMalIdFromReverseMapping: typeof fetchMalIdFromReverseMapping;
  fetchKitsuIdFromReverseMapping: typeof fetchKitsuIdFromReverseMapping;
  fetchAniListIdFromReverseMapping: typeof fetchAniListIdFromReverseMapping;
  fetchAniListRating: typeof fetchAniListRating;
  fetchKitsuRating: typeof fetchKitsuRating;
  fetchMyAnimeListRating: typeof fetchMyAnimeListRating;
  fetchTraktRating: typeof fetchTraktRating;
  fetchSimklRating: typeof fetchSimklRating;
  fetchMdbListRatings: typeof fetchMdbListRatings;
  getImdbRatingFromDataset: (imdbId: string) => ImdbDatasetRating | null;
  normalizeRatingValue: typeof normalizeRatingValue;
};

const DEFAULT_DEPS: ProviderRatingsDeps = {
  fetchMalIdFromReverseMapping,
  fetchKitsuIdFromReverseMapping,
  fetchAniListIdFromReverseMapping,
  fetchAniListRating,
  fetchKitsuRating,
  fetchMyAnimeListRating,
  fetchTraktRating,
  fetchSimklRating,
  fetchMdbListRatings,
  getImdbRatingFromDataset,
  normalizeRatingValue,
};

const ANIME_ONLY_RATING_PROVIDER_SET = new Set<RatingPreference>(['myanimelist', 'anilist', 'kitsu']);

export type ResolvedProviderRatings = {
  ratings: Map<RatingPreference, string>;
  allowAnimeOnlyRatings: boolean;
  hasConfirmedAnimeMapping: boolean;
};

export const resolveImageRouteProviderRatings = async (
  input: {
    cleanId: string;
    imageType: 'poster' | 'backdrop' | 'logo';
    mediaType: 'movie' | 'tv';
    media: MediaRecord | null;
    mediaId: string;
    isTmdb: boolean;
    isKitsu: boolean;
    isAniListInput: boolean;
    idPrefix: string;
    season: string | null;
    mappedImdbId: string | null;
    inputAnimeMappingProvider: AnimeMappingProvider | null;
    inputAnimeMappingExternalId: string | null;
    requestedExternalRatings: Set<RatingPreference>;
    shouldAttemptAnimeMapping: boolean;
    initialAllowAnimeOnlyRatings: boolean;
    initialHasConfirmedAnimeMapping: boolean;
    resolvedRatingMediaType: 'movie' | 'tv';
    releaseDate: string | null;
    mdblistKey?: string | null;
    hasMdbListApiKey: boolean;
    simklClientId?: string | null;
    phases: PhaseDurations;
    fetchJsonCached: ProviderRatingsFetchJson;
    getMetadata: MetadataReader;
    setMetadata: MetadataWriter;
    detailsBundlePromise: Promise<DetailsBundleRecord | null> | null;
    renderedRatingTtlByProvider: Map<BadgeKey, number>;
    undiciFetchImpl: JsonFetchImpl;
  },
  deps: Partial<ProviderRatingsDeps> = {},
): Promise<ResolvedProviderRatings> => {
  const runtimeDeps = { ...DEFAULT_DEPS, ...deps };
  let hasConfirmedAnimeMapping = input.initialHasConfirmedAnimeMapping;
  let allowAnimeOnlyRatings = input.initialAllowAnimeOnlyRatings;

  let imdbId: string | null = input.media?.imdb_id || input.mappedImdbId;
  let kitsuId: string | null = input.isKitsu ? input.mediaId : null;
  let malId: string | null = input.idPrefix === 'mal' || input.idPrefix === 'myanimelist' ? input.mediaId : null;
  let aniListId: string | null = input.isAniListInput ? input.mediaId : null;
  const combinedRatings = new Map<RatingPreference, string>();

  const needsAnimeOnlyRatings = [...input.requestedExternalRatings].some((provider) =>
    ANIME_ONLY_RATING_PROVIDER_SET.has(provider)
  );
  const needsImdbRating = input.requestedExternalRatings.has('imdb');
  const needsAniListRating = input.requestedExternalRatings.has('anilist');
  const needsKitsuRating = input.requestedExternalRatings.has('kitsu');
  const needsMyAnimeListRating = input.requestedExternalRatings.has('myanimelist');
  const needsTraktRating = input.requestedExternalRatings.has('trakt');
  const needsSimklRating = input.requestedExternalRatings.has('simkl');

  const setAnimeMappingState = () => {
    if (kitsuId || aniListId || malId) {
      hasConfirmedAnimeMapping = true;
      allowAnimeOnlyRatings = true;
    }
  };

  setAnimeMappingState();

  const ensureImdbId = async () => {
    if (imdbId) return imdbId;
    imdbId = input.media?.imdb_id || input.mappedImdbId || null;
    if (!imdbId && input.detailsBundlePromise) {
      const bundle = await input.detailsBundlePromise;
      const bundledImdbId = bundle?.bundledExternalIds?.imdb_id;
      if (bundledImdbId) {
        imdbId = bundledImdbId;
      }
    }
    if (!imdbId && input.mappedImdbId) {
      imdbId = input.mappedImdbId;
    }
    return imdbId;
  };

  if (!imdbId && !kitsuId && !aniListId && !needsAnimeOnlyRatings) {
    return {
      ratings: combinedRatings,
      allowAnimeOnlyRatings,
      hasConfirmedAnimeMapping,
    };
  }

  const resolveAnimeMappingFor = async (provider: AnimeMappingProvider, externalId: string) => {
    if (!malId) {
      malId = await runtimeDeps.fetchMalIdFromReverseMapping({
        provider,
        externalId,
        season: input.season,
        phases: input.phases,
        fetchJsonCached: input.fetchJsonCached,
      });
    }
    if (!kitsuId) {
      kitsuId = await runtimeDeps.fetchKitsuIdFromReverseMapping({
        provider,
        externalId,
        season: input.season,
        phases: input.phases,
        fetchJsonCached: input.fetchJsonCached,
      });
    }
    if (!aniListId) {
      aniListId = await runtimeDeps.fetchAniListIdFromReverseMapping({
        provider,
        externalId,
        season: input.season,
        phases: input.phases,
        fetchJsonCached: input.fetchJsonCached,
      });
    }
  };

  const resolveAnimeRatingIds = async () => {
    if (!input.shouldAttemptAnimeMapping) return;

    if (input.inputAnimeMappingProvider && input.inputAnimeMappingExternalId) {
      await resolveAnimeMappingFor(input.inputAnimeMappingProvider, input.inputAnimeMappingExternalId);
    }

    const resolvedImdbId = await ensureImdbId();
    if (resolvedImdbId) {
      await resolveAnimeMappingFor('imdb', resolvedImdbId);
    }

    const tmdbId = input.media?.id != null ? String(input.media.id) : null;
    if (tmdbId) {
      await resolveAnimeMappingFor('tmdb', tmdbId);
    }

    setAnimeMappingState();
  };

  if (needsAnimeOnlyRatings && input.shouldAttemptAnimeMapping && (!kitsuId || !aniListId || !malId)) {
    await resolveAnimeRatingIds();
  }
  setAnimeMappingState();

  if (imdbId && (input.mdblistKey || input.hasMdbListApiKey)) {
    try {
      const mdbListCacheTtlMs = getMdbListCacheTtlMs({
        imdbId,
        mediaType: input.resolvedRatingMediaType,
        releaseDate: input.releaseDate,
      });
      const mdbRatings = await runtimeDeps.fetchMdbListRatings({
        imdbId,
        cacheTtlMs: mdbListCacheTtlMs,
        phases: input.phases,
        requestSource: 'addon',
        imageType: input.imageType,
        cleanId: input.cleanId,
        manualApiKey: input.mdblistKey,
        fetchJsonCached: input.fetchJsonCached,
      });
      if (mdbRatings) {
        for (const [provider, value] of mdbRatings.entries()) {
          if (!allowAnimeOnlyRatings && ANIME_ONLY_RATING_PROVIDER_SET.has(provider)) {
            continue;
          }
          combinedRatings.set(provider, value);
          input.renderedRatingTtlByProvider.set(provider, mdbListCacheTtlMs);
        }
      }
    } catch {
    }
  }

  if (needsImdbRating) {
    const resolvedImdbId = await ensureImdbId();
    if (resolvedImdbId && !combinedRatings.has('imdb')) {
      const datasetRating = runtimeDeps.getImdbRatingFromDataset(resolvedImdbId);
      if (datasetRating) {
        const normalized = runtimeDeps.normalizeRatingValue(datasetRating.rating);
        if (normalized) {
          combinedRatings.set('imdb', normalized);
          input.renderedRatingTtlByProvider.set('imdb', IMDB_DATASET_CACHE_TTL_MS);
        }
      }
    }
  }

  if (needsAniListRating && allowAnimeOnlyRatings && aniListId) {
    try {
      const aniListCacheTtlMs = getRatingCacheTtlMs({
        id: `anilist:${aniListId}`,
        mediaType: input.resolvedRatingMediaType,
        releaseDate: input.releaseDate,
        defaultTtlMs: KITSU_CACHE_TTL_MS,
        oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
      });
      const aniListRating = await runtimeDeps.fetchAniListRating(aniListId, input.phases, input.fetchJsonCached);
      if (aniListRating) {
        combinedRatings.set('anilist', aniListRating);
        input.renderedRatingTtlByProvider.set('anilist', aniListCacheTtlMs);
      }
    } catch {
    }
  }

  if (needsMyAnimeListRating && allowAnimeOnlyRatings && malId) {
    try {
      const malCacheTtlMs = getRatingCacheTtlMs({
        id: `mal:${malId}`,
        mediaType: input.resolvedRatingMediaType,
        releaseDate: input.releaseDate,
        defaultTtlMs: KITSU_CACHE_TTL_MS,
        oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
      });
      const malRating = await runtimeDeps.fetchMyAnimeListRating(malId, input.phases, input.fetchJsonCached);
      if (malRating) {
        combinedRatings.set('myanimelist', malRating);
        input.renderedRatingTtlByProvider.set('myanimelist', malCacheTtlMs);
      }
    } catch {
    }
  }

  if (needsKitsuRating && allowAnimeOnlyRatings && kitsuId) {
    try {
      const kitsuCacheTtlMs = getRatingCacheTtlMs({
        id: kitsuId,
        mediaType: input.resolvedRatingMediaType,
        releaseDate: input.releaseDate,
        defaultTtlMs: KITSU_CACHE_TTL_MS,
        oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
      });
      const kitsuRating = await runtimeDeps.fetchKitsuRating(kitsuId, input.phases, input.fetchJsonCached);
      if (kitsuRating) {
        combinedRatings.set('kitsu', kitsuRating);
        input.renderedRatingTtlByProvider.set('kitsu', kitsuCacheTtlMs);
      }
    } catch {
    }
  }

  if (needsTraktRating) {
    const resolvedImdbId = await ensureImdbId();
    if (resolvedImdbId) {
      try {
        const traktCacheTtlMs = getRatingCacheTtlMs({
          id: `trakt:${resolvedImdbId}`,
          mediaType: input.resolvedRatingMediaType,
          releaseDate: input.releaseDate,
          defaultTtlMs: MDBLIST_CACHE_TTL_MS,
          oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
        });
        const traktRating = await runtimeDeps.fetchTraktRating({
          imdbId: resolvedImdbId,
          mediaType: input.resolvedRatingMediaType,
          phases: input.phases,
          fetchJsonCached: input.fetchJsonCached,
          undiciFetchImpl: input.undiciFetchImpl,
        });
        if (traktRating) {
          combinedRatings.set('trakt', traktRating);
          input.renderedRatingTtlByProvider.set('trakt', traktCacheTtlMs);
        }
      } catch {
      }
    }
  }

  if (needsSimklRating && input.simklClientId) {
    try {
      const resolvedImdbId = await ensureImdbId();
      const tmdbIdForCache =
        input.media?.id != null ? String(input.media.id) : input.isTmdb && input.mediaId ? String(input.mediaId) : null;
      const simklCacheTtlMs = getRatingCacheTtlMs({
        id: resolvedImdbId || tmdbIdForCache || aniListId || malId || kitsuId || input.cleanId,
        mediaType: input.resolvedRatingMediaType,
        releaseDate: input.releaseDate,
        defaultTtlMs: SIMKL_CACHE_TTL_MS,
        oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
      });
      const simklRating = await runtimeDeps.fetchSimklRating({
        clientId: input.simklClientId,
        imdbId: resolvedImdbId,
        tmdbId: tmdbIdForCache,
        mediaType: input.resolvedRatingMediaType,
        anilistId: aniListId,
        malId,
        kitsuId,
        cacheTtlMs: simklCacheTtlMs,
        phases: input.phases,
        fetchJsonCached: input.fetchJsonCached,
        getMetadata: input.getMetadata,
        setMetadata: input.setMetadata,
      });
      if (simklRating) {
        combinedRatings.set('simkl', simklRating);
        input.renderedRatingTtlByProvider.set('simkl', simklCacheTtlMs);
      }
    } catch {
    }
  }

  return {
    ratings: combinedRatings,
    allowAnimeOnlyRatings,
    hasConfirmedAnimeMapping,
  };
};
