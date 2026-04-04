import { fetch as undiciFetch } from 'undici';
import {
  DEFAULT_GENRE_BADGE_MODE,
  resolveGenreBadgeFamily,
  type GenreBadgeAnimeGrouping,
  type GenreBadgeFamilyMeta,
  type GenreBadgeMode,
  type GenreBadgePosition,
  type GenreBadgeStyle,
} from './genreBadge.ts';
import {
  BACKDROP_IMAGE_DIMENSIONS,
  FALLBACK_IMAGE_LANGUAGE,
  KITSU_CACHE_TTL_MS,
  MDBLIST_API_KEYS,
  MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
  POSTER_IMAGE_DIMENSIONS,
  TMDB_CACHE_TTL_MS,
  TORRENTIO_CACHE_TTL_MS,
  type AnimeMappingProvider,
  type ArtworkSource,
  type BackdropImageSize,
  type BadgeKey,
  type EpisodeArtworkMode,
  type PosterImageSize,
  type PosterTextPreference,
  type RandomPosterFallbackMode,
  type RandomPosterLanguageMode,
  type RandomPosterTextMode,
} from './imageRouteConfig.ts';
import {
  buildNetworkBadgesFromTvNetworks,
  buildNetworkBadgesFromWatchProviderResults,
  buildCertificationBadgeMeta,
  hasMoviePhysicalMediaRelease,
  resolveMovieCertificationBadge,
  resolveMovieReleaseStatusBadge,
  resolveTvCertificationBadge,
  MEDIA_FEATURE_BADGE_ORDER,
  type RemuxDisplayMode,
} from './mediaFeatures.ts';
import { getMetadata, setMetadata } from './metadataStore.ts';
import { getRatingCacheTtlMs } from './imageRouteMdbList.ts';
import {
  getDeterministicTtlMs,
  HttpError,
  isImdbId,
  type CachedJsonResponse,
  type JsonFetchImpl,
  type PhaseDurations,
} from './imageRouteRuntime.ts';
import { createImageRouteArtworkSelector } from './imageRouteArtworkSelection.ts';
import {
  getRemoteImageAspectRatio,
  type GenreBadgeSpec,
  type RatingBadge,
} from './imageRouteRenderer.ts';
import {
  buildTmdbImageUrl,
} from './imageRouteSourceUrls.ts';
import {
  pickPosterTitleFromMedia,
} from './imageRouteKitsuFallback.ts';
import { normalizeRatingValue, isTmdbAnimationTitle } from './imageRouteMedia.ts';
import { resolveImageRouteProviderRatings } from './imageRouteProviderRatings.ts';
import { fetchTorrentioBadges } from './imageRouteTorrentio.ts';
import { pickByLanguageWithFallback } from './imageLanguage.ts';
import { resolveOverlayAutoScale } from './overlayScale.ts';
import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';
import {
  LOGO_BASE_HEIGHT,
  LOGO_FALLBACK_ASPECT_RATIO,
  LOGO_MAX_WIDTH,
  LOGO_MIN_WIDTH,
} from './imageRouteText.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';

type PreparedMediaFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type PreparedMediaDeps = {
  resolveImageRouteProviderRatings: typeof resolveImageRouteProviderRatings;
};

const DEFAULT_DEPS: PreparedMediaDeps = {
  resolveImageRouteProviderRatings,
};

export type PreparedImageRouteMediaState = {
  allowAnimeOnlyRatings: boolean;
  hasConfirmedAnimeMapping: boolean;
  primaryGenreFamily: GenreBadgeFamilyMeta | null;
  genreBadge: GenreBadgeSpec | null;
  imgUrl: string;
  tmdbRating: string;
  providerRatings: Map<RatingPreference, string>;
  renderedRatingTtlByProvider: Map<BadgeKey, number>;
  outputWidth: number;
  outputHeight: number;
  certificationBadgeLabel: string | null;
  streamBadges: RatingBadge[];
  streamBadgesCacheTtlMs: number | null;
  posterTitleText: string | null;
  posterLogoUrl: string | null;
  providerRatingsEnabled: boolean;
  shouldRenderBadges: boolean;
};

const ANIME_ONLY_RATING_PROVIDER_SET = new Set<RatingPreference>(['myanimelist', 'anilist', 'kitsu']);

export const prepareImageRouteMediaState = async (input: {
  imageType: 'poster' | 'backdrop' | 'logo';
  isThumbnailRequest: boolean;
  tmdbKey: string;
  phases: PhaseDurations;
  fetchJsonCached: PreparedMediaFetchJson;
  media: any;
  mediaType: 'movie' | 'tv' | null;
  mediaId: string;
  season: string | null;
  episode: string | null;
  mappedImdbId: string | null;
  isTmdb: boolean;
  isKitsu: boolean;
  isAniListInput: boolean;
  idPrefix: string;
  inputAnimeMappingProvider: AnimeMappingProvider | null;
  inputAnimeMappingExternalId: string | null;
  selectedRatings: Set<RatingPreference>;
  hasNativeAnimeInput: boolean;
  allowAnimeOnlyRatings: boolean;
  hasConfirmedAnimeMapping: boolean;
  shouldApplyRatings: boolean;
  shouldApplyStreamBadges: boolean;
  shouldRenderLogoBackground: boolean;
  genreBadgeMode: GenreBadgeMode;
  genreBadgeStyle: GenreBadgeStyle;
  genreBadgePosition: GenreBadgePosition;
  genreBadgeScale: number;
  effectiveGenreBadgeScale: number;
  genreBadgeBorderWidth: number;
  noBackgroundBadgeOutlineColor: string;
  noBackgroundBadgeOutlineWidth: number;
  genreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  requestedImageLang: string;
  includeImageLanguage: string;
  posterTextPreference: PosterTextPreference;
  randomPosterTextMode: RandomPosterTextMode;
  randomPosterLanguageMode: RandomPosterLanguageMode;
  randomPosterMinVoteCount: number | null;
  randomPosterMinVoteAverage: number | null;
  randomPosterMinWidth: number | null;
  randomPosterMinHeight: number | null;
  randomPosterFallbackMode: RandomPosterFallbackMode;
  posterArtworkSource: ArtworkSource;
  backdropArtworkSource: ArtworkSource;
  logoArtworkSource: ArtworkSource;
  thumbnailEpisodeArtwork: EpisodeArtworkMode;
  backdropEpisodeArtwork: EpisodeArtworkMode;
  artworkSelectionSeed: string;
  cleanId: string;
  fanartKey: string;
  fanartClientKey: string;
  sourceFallbackUrl: string | null;
  qualityBadgePreferences: string[];
  remuxDisplayMode: RemuxDisplayMode;
  posterImageSize: PosterImageSize;
  backdropImageSize: BackdropImageSize;
  mdblistKey: string | null;
  simklClientId: string;
  useRawKitsuFallback: boolean;
  rawFallbackImageUrl: string | null;
  rawFallbackKitsuRating: string | null;
  rawFallbackTitle: string | null;
  rawFallbackLogoAspectRatio: number | null;
}, deps: Partial<PreparedMediaDeps> = {}): Promise<PreparedImageRouteMediaState> => {
  const runtimeDeps = { ...DEFAULT_DEPS, ...deps };
  let {
    media,
    mediaType,
    mediaId,
    season,
    episode,
    mappedImdbId,
    allowAnimeOnlyRatings,
    hasConfirmedAnimeMapping,
    effectiveGenreBadgeScale,
    useRawKitsuFallback,
    rawFallbackImageUrl,
    rawFallbackKitsuRating,
    rawFallbackTitle,
    rawFallbackLogoAspectRatio,
  } = input;
  const {
    imageType,
    isThumbnailRequest,
    tmdbKey,
    phases,
    fetchJsonCached,
    isTmdb,
    isKitsu,
    isAniListInput,
    idPrefix,
    inputAnimeMappingProvider,
    inputAnimeMappingExternalId,
    selectedRatings,
    hasNativeAnimeInput,
    shouldApplyRatings,
    shouldApplyStreamBadges,
    shouldRenderLogoBackground,
    genreBadgeMode,
    genreBadgeStyle,
    genreBadgePosition,
    genreBadgeScale,
    genreBadgeAnimeGrouping,
    noBackgroundBadgeOutlineColor,
    noBackgroundBadgeOutlineWidth,
    requestedImageLang,
    includeImageLanguage,
    posterTextPreference,
    randomPosterTextMode,
    randomPosterLanguageMode,
    randomPosterMinVoteCount,
    randomPosterMinVoteAverage,
    randomPosterMinWidth,
    randomPosterMinHeight,
    randomPosterFallbackMode,
    posterArtworkSource,
    backdropArtworkSource,
    logoArtworkSource,
    thumbnailEpisodeArtwork,
    backdropEpisodeArtwork,
    artworkSelectionSeed,
    cleanId,
    fanartKey,
    fanartClientKey,
    sourceFallbackUrl,
    qualityBadgePreferences,
    remuxDisplayMode,
    posterImageSize,
    backdropImageSize,
    mdblistKey,
    simklClientId,
  } = input;

const mediaLooksAnimated = media ? isTmdbAnimationTitle(media) : false;
if (!hasNativeAnimeInput) {
  allowAnimeOnlyRatings = hasConfirmedAnimeMapping;
}
const resolveIsAnimeContent = () => hasNativeAnimeInput || hasConfirmedAnimeMapping;
const resolvePrimaryGenreFamily = (
  genres: Array<{ id?: number | null; name?: string | null } | string | null | undefined>,
  genreIds: Array<number | string | null | undefined> = [],
) =>
  resolveGenreBadgeFamily({
    genres,
    genreIds,
    isAnimeContent: resolveIsAnimeContent(),
    animeGrouping: genreBadgeAnimeGrouping,
  });
const buildResolvedGenreBadge = (
  family: ReturnType<typeof resolvePrimaryGenreFamily>,
): GenreBadgeSpec | null => {
  if (genreBadgeMode === DEFAULT_GENRE_BADGE_MODE || !family) {
    return null;
  }
  return {
    familyId: family.id,
    label: family.label,
    accentColor: family.accentColor,
    mode: genreBadgeMode,
    style: genreBadgeStyle,
    position: genreBadgePosition,
    scalePercent: effectiveGenreBadgeScale,
    borderWidth: input.genreBadgeBorderWidth,
    noBackgroundOutlineColor: noBackgroundBadgeOutlineColor,
    noBackgroundOutlineWidth: noBackgroundBadgeOutlineWidth,
  };
};
let primaryGenreFamily = resolvePrimaryGenreFamily(
  Array.isArray(media?.genres) ? media.genres : [],
  Array.isArray(media?.genre_ids) ? media.genre_ids : [],
);
let genreBadge = buildResolvedGenreBadge(primaryGenreFamily);
let resolvedGenres = Array.isArray(media?.genres) ? media.genres : [];
let resolvedGenreIds = Array.isArray(media?.genre_ids) ? media.genre_ids : [];

let imgPath = '';
let imgUrl = rawFallbackImageUrl;
let tmdbRating = 'N/A';
let providerRatings = new Map<RatingPreference, string>();
const renderedRatingTtlByProvider = new Map<BadgeKey, number>();
const defaultBackdropDimensions =
  imageType === 'backdrop' && !isThumbnailRequest
    ? BACKDROP_IMAGE_DIMENSIONS[backdropImageSize] || BACKDROP_IMAGE_DIMENSIONS.normal
    : BACKDROP_IMAGE_DIMENSIONS.normal;
let outputWidth = defaultBackdropDimensions.width;
let outputHeight = defaultBackdropDimensions.height;
let selectedLogoAspectRatio: number | null = null;
let selectedPosterLogoPath: string | null = null;
let selectedPosterIsTextless = false;
let certificationBadgeLabel: string | null = null;
let releaseStatusBadge: RatingBadge | null = null;
let bundledWatchProviderResults: unknown = null;
let movieHasPhysicalMediaRelease: boolean | null = null;
const requestedExternalRatings = new Set([...selectedRatings]);
const shouldAttemptAnimeMapping = hasNativeAnimeInput || mediaLooksAnimated;
const needsExternalRatings = [...requestedExternalRatings].some((provider) => provider !== 'tmdb');
const needsImdbRating = requestedExternalRatings.has('imdb');
const needsAllocineRating = requestedExternalRatings.has('allocine');
const needsAllocinePressRating = requestedExternalRatings.has('allocinepress');
const needsAniListRating = requestedExternalRatings.has('anilist');
const needsKitsuRating = requestedExternalRatings.has('kitsu');
const needsMyAnimeListRating = requestedExternalRatings.has('myanimelist');
const needsTraktRating = requestedExternalRatings.has('trakt');
const needsSimklRating = requestedExternalRatings.has('simkl');
const hasMdbListApiKey = MDBLIST_API_KEYS.length > 0;
const shouldRenderRawKitsuFallbackRating =
  useRawKitsuFallback && needsKitsuRating && typeof rawFallbackKitsuRating === 'string' && rawFallbackKitsuRating.length > 0;
const shouldRenderRatings = shouldApplyRatings;
const shouldRenderStreamBadges = shouldApplyStreamBadges && !resolveIsAnimeContent();
const shouldRenderBadges =
  shouldRenderRatings ||
  shouldRenderStreamBadges ||
  shouldRenderLogoBackground ||
  Boolean(genreBadge);
const releaseDateForCache =
  mediaType === 'movie' ? media?.release_date : mediaType === 'tv' ? media?.first_air_date : null;
const resolvedRatingMediaType: 'movie' | 'tv' =
  mediaType === 'tv' || (mediaType !== 'movie' && season !== null) ? 'tv' : 'movie';
const tmdbIdForCache =
  media?.id != null
    ? String(media.id)
    : isTmdb && mediaId
      ? String(mediaId)
      : null;
let torrentioIdForCache: string | null = isImdbId(mediaId) ? mediaId : null;
if (!torrentioIdForCache) {
  torrentioIdForCache = media?.imdb_id || mappedImdbId || null;
}
if (!torrentioIdForCache && tmdbIdForCache) {
  torrentioIdForCache = `tmdb:${tmdbIdForCache}`;
}
if (mediaType === 'tv' && torrentioIdForCache) {
  const streamSeason = season || '1';
  const streamEpisode = episode || '1';
  torrentioIdForCache = `${torrentioIdForCache}:${streamSeason}:${streamEpisode}`;
}
const streamBadgesWindowTtlMs = shouldRenderStreamBadges
    ? mediaType && torrentioIdForCache
    ? getRatingCacheTtlMs({
      id: torrentioIdForCache,
      mediaType: resolvedRatingMediaType,
      releaseDate: releaseDateForCache,
      defaultTtlMs: TORRENTIO_CACHE_TTL_MS,
      oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
    })
    : getDeterministicTtlMs(TORRENTIO_CACHE_TTL_MS, cleanId)
  : null;
const streamBadgesCacheWindow =
  shouldRenderStreamBadges && streamBadgesWindowTtlMs
    ? Math.floor(Date.now() / streamBadgesWindowTtlMs)
    : null;
const streamBadgesCacheKey = shouldRenderStreamBadges
  ? `torrentio:${streamBadgesCacheWindow ?? 0}`
  : 'off';
const detailsBundlePromise = !useRawKitsuFallback
  ? (async () => {
    const certificationAppendTarget =
      mediaType === 'movie' ? 'release_dates' : mediaType === 'tv' ? 'content_ratings' : null;
    const buildDetailsUrl = (language: string) =>
      `${TMDB_API_BASE_URL}/${mediaType}/${media.id}?api_key=${tmdbKey}&language=${language}&append_to_response=${['images', 'external_ids', certificationAppendTarget].filter(Boolean).join(',')}&include_image_language=${encodeURIComponent(includeImageLanguage)}`;
    const watchProvidersUrl = `${TMDB_API_BASE_URL}/${mediaType}/${media.id}/watch/providers?api_key=${tmdbKey}`;

    const [detailsResponse, fallbackDetailsResponse, watchProvidersResponse] = await Promise.all([
      fetchJsonCached(
        `tmdb:${mediaType}:${media.id}:details:${requestedImageLang}:bundle:v2:${includeImageLanguage}`,
        buildDetailsUrl(requestedImageLang),
        TMDB_CACHE_TTL_MS,
        phases,
        'tmdb'
      ),
      requestedImageLang !== FALLBACK_IMAGE_LANGUAGE
        ? fetchJsonCached(
          `tmdb:${mediaType}:${media.id}:details:${FALLBACK_IMAGE_LANGUAGE}:bundle:v2:${includeImageLanguage}`,
          buildDetailsUrl(FALLBACK_IMAGE_LANGUAGE),
          TMDB_CACHE_TTL_MS,
          phases,
          'tmdb'
        )
        : Promise.resolve({ ok: false, status: 0, data: null } as CachedJsonResponse),
      shouldRenderStreamBadges
        ? fetchJsonCached(
          `tmdb:${mediaType}:${media.id}:watch-providers:v1`,
          watchProvidersUrl,
          TMDB_CACHE_TTL_MS,
          phases,
          'tmdb'
        )
        : Promise.resolve({ ok: false, status: 0, data: null } as CachedJsonResponse)
    ]);

    const details = detailsResponse.data || {};
    const fallbackDetails = fallbackDetailsResponse?.data || {};

    return {
      details,
      fallbackDetails,
      bundledImages: details.images || {},
      bundledExternalIds: details.external_ids || {},
      bundledCertificationPayload:
        mediaType === 'movie'
          ? details.release_dates || fallbackDetails.release_dates || null
          : details.content_ratings || fallbackDetails.content_ratings || null,
      bundledWatchProviderResults: watchProvidersResponse.data?.results || null,
      tmdbRating: details.vote_average ? normalizeRatingValue(details.vote_average) || 'N/A' : 'N/A',
    };
  })()
  : null;
const episodeDetailsPromise =
  !useRawKitsuFallback &&
  isThumbnailRequest &&
  mediaType === 'tv' &&
  season &&
  episode &&
  media?.id != null
    ? fetchJsonCached(
      `tmdb:tv:${media.id}:season:${season}:episode:${episode}:details`,
      `${TMDB_API_BASE_URL}/tv/${media.id}/season/${season}/episode/${episode}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb'
    )
    : null;
const providerRatingsPromise =
  shouldRenderRatings &&
    needsExternalRatings &&
    (
      mdblistKey ||
      hasMdbListApiKey ||
      needsKitsuRating ||
      needsImdbRating ||
      needsAllocineRating ||
      needsAllocinePressRating ||
      needsAniListRating ||
      needsMyAnimeListRating ||
      needsTraktRating ||
      needsSimklRating
    )
    ? runtimeDeps.resolveImageRouteProviderRatings({
      cleanId,
      imageType,
      mediaType: resolvedRatingMediaType,
      media,
      mediaId,
      isTmdb,
      isKitsu,
      isAniListInput,
      idPrefix,
      season,
      episode,
      mappedImdbId,
      inputAnimeMappingProvider,
      inputAnimeMappingExternalId,
      requestedExternalRatings,
      shouldAttemptAnimeMapping,
      initialAllowAnimeOnlyRatings: allowAnimeOnlyRatings,
      initialHasConfirmedAnimeMapping: hasConfirmedAnimeMapping,
      resolvedRatingMediaType,
      releaseDate: releaseDateForCache,
      mdblistKey,
      hasMdbListApiKey,
      simklClientId,
      phases,
      fetchJsonCached,
      getMetadata,
      setMetadata,
      detailsBundlePromise,
      renderedRatingTtlByProvider,
      undiciFetchImpl: undiciFetch as unknown as JsonFetchImpl,
    })
    : null;
const streamBadgesPromise =
  shouldRenderStreamBadges && !useRawKitsuFallback && (mediaType === 'movie' || mediaType === 'tv')
    ? (async () => {
      let imdbId: string | null = isImdbId(mediaId) ? mediaId : null;
      if (!imdbId) {
        imdbId = media?.imdb_id || mappedImdbId || null;
        if (!imdbId && detailsBundlePromise) {
          const bundle = await detailsBundlePromise;
          if (bundle?.bundledExternalIds?.imdb_id) {
            imdbId = bundle.bundledExternalIds.imdb_id;
          }
        }
        if (!imdbId && mappedImdbId) {
          imdbId = mappedImdbId;
        }
      }

      const tmdbId =
        media?.id != null
          ? String(media.id)
          : isTmdb && mediaId
            ? String(mediaId)
            : null;
      const baseTorrentioId = imdbId || (tmdbId ? `tmdb:${tmdbId}` : null);
      if (!baseTorrentioId) {
        return { badges: [], cacheTtlMs: TORRENTIO_CACHE_TTL_MS };
      }
      const torrentioType = mediaType === 'movie' ? 'movie' : 'series';
      const torrentioId = torrentioType === 'series'
        ? `${baseTorrentioId}:${season || '1'}:${episode || '1'}`
        : baseTorrentioId;
      const torrentioCacheTtlMs = getRatingCacheTtlMs({
        id: baseTorrentioId,
        mediaType: resolvedRatingMediaType,
        releaseDate: mediaType === 'movie' ? media?.release_date : media?.first_air_date,
        defaultTtlMs: TORRENTIO_CACHE_TTL_MS,
        oldTtlMs: MDBLIST_OLD_MOVIE_CACHE_TTL_MS,
      });
      return fetchTorrentioBadges({ type: torrentioType, id: torrentioId, phases, cacheTtlMs: torrentioCacheTtlMs, remuxDisplayMode });
    })()
    : null;

if (imageType === 'poster') {
  const posterDimensions = POSTER_IMAGE_DIMENSIONS[posterImageSize];
  outputWidth = posterDimensions.width;
  outputHeight = posterDimensions.height;
} else if (imageType === 'logo') {
  outputHeight = LOGO_BASE_HEIGHT;
  outputWidth = Math.max(
    LOGO_MIN_WIDTH,
    Math.min(
      LOGO_MAX_WIDTH,
      Math.round(LOGO_BASE_HEIGHT * (rawFallbackLogoAspectRatio || LOGO_FALLBACK_ASPECT_RATIO))
    )
  );
}
const overlayAutoScale = resolveOverlayAutoScale({
  imageType,
  outputWidth,
  outputHeight,
});
effectiveGenreBadgeScale = Math.max(1, Math.round(genreBadgeScale * overlayAutoScale));
if (genreBadge) {
  genreBadge = { ...genreBadge, scalePercent: effectiveGenreBadgeScale };
}

if (!useRawKitsuFallback && detailsBundlePromise) {
  const {
    details,
    fallbackDetails,
    bundledImages,
    bundledExternalIds,
    bundledCertificationPayload,
    bundledWatchProviderResults: watchProviderResults,
    tmdbRating: bundledRating,
  } = await detailsBundlePromise;
  bundledWatchProviderResults = watchProviderResults;
  tmdbRating = bundledRating;
  if (episodeDetailsPromise) {
    const episodeDetailsResponse = await episodeDetailsPromise;
    if (episodeDetailsResponse.ok) {
      tmdbRating = normalizeRatingValue(episodeDetailsResponse.data?.vote_average) || 'N/A';
    }
  }
  if (shouldRenderStreamBadges) {
    movieHasPhysicalMediaRelease =
      mediaType === 'movie' ? hasMoviePhysicalMediaRelease(bundledCertificationPayload) : null;
    certificationBadgeLabel =
      mediaType === 'movie'
        ? resolveMovieCertificationBadge(bundledCertificationPayload, requestedImageLang)
        : mediaType === 'tv'
          ? resolveTvCertificationBadge(bundledCertificationPayload, requestedImageLang)
          : null;
    const resolvedReleaseStatusBadge =
      mediaType === 'movie' ? resolveMovieReleaseStatusBadge(bundledCertificationPayload) : null;
    releaseStatusBadge = resolvedReleaseStatusBadge
      ? {
          key: resolvedReleaseStatusBadge.key,
          label: resolvedReleaseStatusBadge.label,
          value: '',
          iconUrl: '',
          accentColor: resolvedReleaseStatusBadge.accentColor,
        }
      : null;
  }
  primaryGenreFamily = resolvePrimaryGenreFamily(
    [
      ...(Array.isArray(details?.genres) ? details.genres : []),
      ...(Array.isArray(fallbackDetails?.genres) ? fallbackDetails.genres : []),
      ...(Array.isArray(media?.genres) ? media.genres : []),
    ],
    Array.isArray(media?.genre_ids) ? media.genre_ids : [],
  );
  resolvedGenres = [
    ...(Array.isArray(details?.genres) ? details.genres : []),
    ...(Array.isArray(fallbackDetails?.genres) ? fallbackDetails.genres : []),
    ...(Array.isArray(media?.genres) ? media.genres : []),
  ];
  resolvedGenreIds = Array.isArray(media?.genre_ids) ? media.genre_ids : [];
  genreBadge = buildResolvedGenreBadge(primaryGenreFamily);
  const fanartTvdbId =
    mediaType === 'tv'
      ? String(
          bundledExternalIds?.tvdb_id ||
          details?.external_ids?.tvdb_id ||
          fallbackDetails?.external_ids?.tvdb_id ||
          media?.external_ids?.tvdb_id ||
          ''
        ).trim()
      : '';
  const resolveArtworkImdbId = async () => {
    let imdbId: string | null = isImdbId(mediaId) ? mediaId : null;
    if (!imdbId) {
      imdbId = media?.imdb_id || mappedImdbId || null;
      if (!imdbId && detailsBundlePromise) {
        const bundle = await detailsBundlePromise;
        if (bundle?.bundledExternalIds?.imdb_id) {
          imdbId = bundle.bundledExternalIds.imdb_id;
        }
      }
    }
    return imdbId;
  };
  const selectImagePath = createImageRouteArtworkSelector({
    imageType,
    isThumbnailRequest,
    mediaType: mediaType as 'movie' | 'tv',
    media,
    details,
    requestedImageLang,
    fallbackImageLang: FALLBACK_IMAGE_LANGUAGE,
    posterTextPreference,
    randomPosterTextMode,
    randomPosterLanguageMode,
    randomPosterMinVoteCount,
    randomPosterMinVoteAverage,
    randomPosterMinWidth,
    randomPosterMinHeight,
    randomPosterFallbackMode,
    posterArtworkSource,
    backdropArtworkSource,
    logoArtworkSource,
    thumbnailEpisodeArtwork,
    backdropEpisodeArtwork,
    artworkSelectionSeed,
    cleanId,
    season,
    episode,
    isKitsu,
    tmdbKey,
    fanartKey,
    fanartClientKey,
    fanartTvdbId,
    phases,
    fetchJsonCached,
    getRemoteImageAspectRatio,
    resolveImdbId: resolveArtworkImdbId,
  });

  const initialImages = bundledImages || {};
  const initialSelection = await selectImagePath({
    posters: initialImages.posters || [],
    backdrops: initialImages.backdrops || [],
    logos: initialImages.logos || [],
    seasonIncludeImageLanguage: includeImageLanguage
  });

  imgPath = initialSelection.imgPath;
  imgUrl = initialSelection.imgUrlOverride || imgUrl;
  selectedLogoAspectRatio = initialSelection.logoAspectRatio;
  selectedPosterLogoPath = initialSelection.logoPath || null;
  selectedPosterIsTextless = initialSelection.posterIsTextless;
  if (
    imageType === 'poster' &&
    posterTextPreference === 'clean' &&
    selectedPosterIsTextless &&
    !selectedPosterLogoPath
  ) {
    const logoFallbackImagesResponse = await fetchJsonCached(
      `tmdb:${mediaType}:${media.id}:images:all`,
      `${TMDB_API_BASE_URL}/${mediaType}/${media.id}/images?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb'
    );
    if (logoFallbackImagesResponse.ok) {
      const logoFallbackImages = logoFallbackImagesResponse.data || {};
      const logoFallback = pickByLanguageWithFallback<{ iso_639_1?: string | null; file_path?: string | null }>(
        logoFallbackImages.logos || [],
        requestedImageLang,
        FALLBACK_IMAGE_LANGUAGE
      );
      if (logoFallback?.file_path) {
        selectedPosterLogoPath = logoFallback.file_path;
      }
    }
  }
  if (selectedLogoAspectRatio) {
    outputWidth = Math.max(
      LOGO_MIN_WIDTH,
      Math.min(LOGO_MAX_WIDTH, Math.round(LOGO_BASE_HEIGHT * selectedLogoAspectRatio))
    );
  }

  if (!imgPath && !imgUrl) {
    const fallbackImagesResponse = await fetchJsonCached(
      `tmdb:${mediaType}:${media.id}:images:all`,
      `${TMDB_API_BASE_URL}/${mediaType}/${media.id}/images?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb'
    );
    if (fallbackImagesResponse.ok) {
      const fallbackImages = fallbackImagesResponse.data || {};
      const fallbackSelection = await selectImagePath({
        posters: fallbackImages.posters || [],
        backdrops: fallbackImages.backdrops || [],
        logos: fallbackImages.logos || [],
        seasonIncludeImageLanguage: undefined
      });
      if (fallbackSelection.imgPath) {
        imgPath = fallbackSelection.imgPath;
        imgUrl = fallbackSelection.imgUrlOverride || imgUrl;
        selectedLogoAspectRatio = fallbackSelection.logoAspectRatio;
        selectedPosterLogoPath = fallbackSelection.logoPath || selectedPosterLogoPath;
        selectedPosterIsTextless = fallbackSelection.posterIsTextless;
        if (selectedLogoAspectRatio) {
          outputWidth = Math.max(
            LOGO_MIN_WIDTH,
            Math.min(LOGO_MAX_WIDTH, Math.round(LOGO_BASE_HEIGHT * selectedLogoAspectRatio))
          );
        }
      }
    }
  }
}

if (!imgUrl) {
  imgUrl = imgPath ? buildTmdbImageUrl(imageType, imgPath, outputWidth) : sourceFallbackUrl || '';
}
if (!imgUrl) {
  throw new HttpError('Image not found', 404);
}
const shouldApplyPosterCleanOverlay =
  imageType === 'poster' && posterTextPreference === 'clean' && selectedPosterIsTextless;
const shouldApplyPosterBrandingOverlay =
  shouldApplyPosterCleanOverlay;
const posterTitleText = shouldApplyPosterBrandingOverlay
  ? pickPosterTitleFromMedia(media, mediaType, rawFallbackTitle)
  : null;
const posterLogoUrl =
  shouldApplyPosterBrandingOverlay && selectedPosterLogoPath
    ? (/^https?:\/\//i.test(selectedPosterLogoPath)
      ? selectedPosterLogoPath
      : buildTmdbImageUrl('logo', selectedPosterLogoPath, outputWidth))
    : null;
let streamBadges: RatingBadge[] = [];
let streamBadgesCacheTtlMs: number | null = null;
if (providerRatingsPromise) {
  const providerRatingResult = await providerRatingsPromise;
  providerRatings = providerRatingResult.ratings;
  allowAnimeOnlyRatings = providerRatingResult.allowAnimeOnlyRatings;
  hasConfirmedAnimeMapping = providerRatingResult.hasConfirmedAnimeMapping;
  primaryGenreFamily = resolvePrimaryGenreFamily(resolvedGenres, resolvedGenreIds);
  genreBadge = buildResolvedGenreBadge(primaryGenreFamily);
}
if (streamBadgesPromise) {
  const streamBadgeResult = await streamBadgesPromise;
  streamBadges = streamBadgeResult.badges;
  streamBadgesCacheTtlMs = streamBadgeResult.cacheTtlMs;
}
if (certificationBadgeLabel) {
  const certificationBadge = buildCertificationBadgeMeta(certificationBadgeLabel);
  streamBadges = [
    {
      key: certificationBadge.key,
      label: certificationBadge.label,
      value: '',
      iconUrl: '',
      accentColor: certificationBadge.accentColor,
    },
    ...streamBadges,
  ];
}
if (releaseStatusBadge) {
  streamBadges = [releaseStatusBadge, ...streamBadges];
}
if (mediaType === 'movie' && movieHasPhysicalMediaRelease === false) {
  streamBadges = streamBadges.filter((badge) => badge.key !== 'bluray' && badge.key !== 'remux');
}
if (imageType !== 'logo') {
  const watchProviderBadges =
    shouldRenderStreamBadges
      ? buildNetworkBadgesFromWatchProviderResults(bundledWatchProviderResults, requestedImageLang).map((badge) => ({
          key: badge.key,
          label: badge.label,
          value: '',
          iconUrl: '',
          accentColor: badge.accentColor,
        }))
      : [];
  const networkBadges =
    mediaType === 'tv'
      ? buildNetworkBadgesFromTvNetworks(media?.networks).map((badge) => ({
          key: badge.key,
          label: badge.label,
          value: '',
          iconUrl: '',
          accentColor: badge.accentColor,
        }))
      : [];
  streamBadges = [...networkBadges, ...watchProviderBadges, ...streamBadges];
  const enabledQualityBadgeSet = new Set(qualityBadgePreferences);
  streamBadges = MEDIA_FEATURE_BADGE_ORDER.flatMap((badgeKey) => {
    if (!enabledQualityBadgeSet.has(badgeKey)) {
      return [];
    }
    const match = streamBadges.find((badge) => badge.key === badgeKey);
    return match ? [match] : [];
  });
}
if (shouldRenderRawKitsuFallbackRating) {
  providerRatings.set('kitsu', rawFallbackKitsuRating as string);
  renderedRatingTtlByProvider.set('kitsu', KITSU_CACHE_TTL_MS);
}

  return {
    allowAnimeOnlyRatings,
    hasConfirmedAnimeMapping,
    primaryGenreFamily,
    genreBadge,
    imgUrl,
    tmdbRating,
    providerRatings,
    renderedRatingTtlByProvider,
    outputWidth,
    outputHeight,
    certificationBadgeLabel,
    streamBadges,
    streamBadgesCacheTtlMs,
    posterTitleText,
    posterLogoUrl,
    providerRatingsEnabled: providerRatingsPromise !== null,
    shouldRenderBadges,
  };
};
