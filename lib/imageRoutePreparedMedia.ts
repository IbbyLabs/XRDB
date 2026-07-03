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
  buildTrendingRecognitionBadges,
  type TrendingRankingMembership,
  buildNetworkBadgesFromTvNetworks,
  buildNetworkBadgesFromWatchProviderResults,
  buildCertificationBadgeMeta,
  hasMoviePhysicalMediaRelease,
  resolveMovieCertificationBadge,
  resolveMovieReleaseStatusBadge,
  resolveTvCertificationBadge,
  isStreamingServiceBadgeKey,
  MEDIA_FEATURE_BADGE_ORDER,
  type RemuxDisplayMode,
} from './mediaFeatures.ts';
import { getMetadata, setMetadata } from './metadataStore.ts';
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
import { type CommunityBadgeTheme } from './communityBadgeAssets.ts';
import { type QualityBadgeStyle } from './ratingAppearance.ts';
import { type QualityBadgeAppearanceOverrides } from './badgeCustomization.ts';
import {
  pickPosterTitleFromMedia,
} from './imageRouteKitsuFallback.ts';
import { normalizeRatingValue, isTmdbAnimationTitle } from './imageRouteMedia.ts';
import { resolveImageRouteProviderRatings } from './imageRouteProviderRatings.ts';
import { fetchTorrentioBadges, getAdaptiveStreamCacheTtlMs, getCachedTorrentioBadges } from './imageRouteTorrentio.ts';
import { pickByLanguageOrNeutral, pickByLanguageWithFallback } from './imageLanguage.ts';
import {
  buildIncludeImageLanguage,
  normalizeImageLanguage,
} from './imageLanguage.ts';
import { resolveGenreBadgeAutoScale } from './overlayScale.ts';
import { logger } from './serverLogger.ts';
import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';
import {
  LOGO_BASE_HEIGHT,
  LOGO_FALLBACK_ASPECT_RATIO,
  LOGO_MAX_WIDTH,
  LOGO_MIN_WIDTH,
} from './imageRouteText.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';
import type {
  CanonicalEpisodeIdentity,
  CanonicalSeriesIdentity,
} from './canonicalAnimeIdentity/index.ts';

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

const GENRE_IDS_BY_FAMILY = {
  anime: [],
  animation: [16],
  horror: [27],
  comedy: [35],
  romance: [10749],
  action: [28, 12, 10752, 37, 10759],
  scifi: [878, 10765],
  fantasy: [14],
  crime: [80, 53, 9648],
  drama: [18],
  documentary: [99],
  music: [10402],
  reality: [10764],
  family: [10751],
  history: [36],
  kids: [10762],
  news: [10763],
  soap: [10766],
  talk: [10767],
  tvmovie: [10770],
  warpolitics: [10768],
  other: [],
} as const;

const normalizeGenreLabel = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const parseGenreId = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const collectGenreBadgeLabelCandidates = (
  genres: Array<{ id?: number | null; name?: string | null } | string | null | undefined>,
) =>
  genres.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = normalizeGenreLabel(entry);
      return name ? [{ id: null, name }] : [];
    }
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const name = normalizeGenreLabel((entry as { name?: unknown }).name);
    if (!name) {
      return [];
    }
    return [{ id: parseGenreId((entry as { id?: unknown }).id), name }];
  });

const resolveLocalizedGenreBadgeLabel = ({
  family,
  genres,
  genreIds,
}: {
  family: GenreBadgeFamilyMeta;
  genres: Array<{ id?: number | null; name?: string | null } | string | null | undefined>;
  genreIds: Array<number | string | null | undefined>;
}) => {
  const candidates = collectGenreBadgeLabelCandidates(genres);
  if (candidates.length === 0) return family.label;

  const familyGenreIds = new Set<number>(GENRE_IDS_BY_FAMILY[family.id]);
  if (familyGenreIds.size > 0) {
    const matchByGenreObjectId = candidates.find((entry) => entry.id !== null && familyGenreIds.has(entry.id));
    if (matchByGenreObjectId) {
      return matchByGenreObjectId.name;
    }

    const resolvedIds = new Set(
      genreIds
        .map((entry) => parseGenreId(entry))
        .filter((entry): entry is number => entry !== null),
    );
    const hasFamilyId = [...familyGenreIds].some((entry) => resolvedIds.has(entry));
    if (hasFamilyId) {
      return candidates[0]?.name || family.label;
    }
  }

  return candidates[0]?.name || family.label;
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
  streamBadgesDeferred: boolean;
  posterTitleText: string | null;
  posterLogoUrl: string | null;
  providerRatingsEnabled: boolean;
  transientProviderFailureTtlMs: number | null;
  shouldRenderBadges: boolean;
};

const ANIME_ONLY_RATING_PROVIDER_SET = new Set<RatingPreference>(['myanimelist', 'anilist', 'kitsu']);
const SOURCE_BACKED_TRENDING_BADGE_KEYS = new Set<BadgeKey>([
  'trendingtoday',
  'trendingweek',
  'top10',
  'top25',
]);
const TMDB_TRENDING_RANK_CACHE_TTL_MS = Math.min(TMDB_CACHE_TTL_MS, 6 * 60 * 60 * 1000);

const resolveTmdbTrendingRank = ({
  responses,
  mediaId,
}: {
  responses: CachedJsonResponse[];
  mediaId: number;
}) => {
  for (let pageIndex = 0; pageIndex < responses.length; pageIndex += 1) {
    const results = Array.isArray(responses[pageIndex]?.data?.results)
      ? responses[pageIndex].data.results
      : [];
    const itemIndex = results.findIndex((entry: unknown) => {
      if (!entry || typeof entry !== 'object') {
        return false;
      }
      const entryId = Number((entry as { id?: unknown }).id);
      return Number.isFinite(entryId) && entryId === mediaId;
    });
    if (itemIndex >= 0) {
      return pageIndex * 20 + itemIndex + 1;
    }
  }
  return null;
};

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
  shouldBlockOnStreamBadges: boolean;
  shouldRenderLogoBackground: boolean;
  genreBadgeMode: GenreBadgeMode;
  genreBadgeStyle: GenreBadgeStyle;
  genreBadgePosition: GenreBadgePosition;
  genreBadgeScale: number;
  genreBadgeOffsetX: number;
  genreBadgeOffsetY: number;
  effectiveGenreBadgeScale: number;
  genreBadgeBorderWidth: number;
  genreBadgeBackgroundOpacity: number;
  noBackgroundBadgeOutlineColor: string;
  noBackgroundBadgeOutlineWidth: number;
  genreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  useOriginalImageLanguage: boolean;
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
  rawFallbackProviderRatings: Partial<Record<RatingPreference, string>>;
  rawFallbackTitle: string | null;
  rawFallbackLogoAspectRatio: number | null;
  canonicalSeriesIdentity?: CanonicalSeriesIdentity | null;
  canonicalEpisodeIdentity?: CanonicalEpisodeIdentity | null;
  ageRatingTileColor?: string | null;
  releaseStatusTileColor?: string | null;
  qualityBadgesTileAccentColor?: string | null;
  networkTileColor?: string | null;
  genreBadgeTileAccentColor?: string | null;
  communityBadgeTheme?: CommunityBadgeTheme;
  ageRatingBadgeStyle?: QualityBadgeStyle | null;
  releaseStatusBadgeStyle?: QualityBadgeStyle | null;
  qualityBadgeAppearanceOverrides?: QualityBadgeAppearanceOverrides | null;
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
    rawFallbackProviderRatings,
    rawFallbackTitle,
    rawFallbackLogoAspectRatio,
    canonicalSeriesIdentity,
    canonicalEpisodeIdentity,
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
    shouldBlockOnStreamBadges,
    shouldRenderLogoBackground,
    genreBadgeMode,
    genreBadgeStyle,
    genreBadgePosition,
    genreBadgeScale,
    genreBadgeOffsetX,
    genreBadgeOffsetY,
    genreBadgeAnimeGrouping,
    noBackgroundBadgeOutlineColor,
    noBackgroundBadgeOutlineWidth,
    useOriginalImageLanguage,
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
const buildResolvedGenreBadge = ({
  family,
  genres,
  genreIds,
}: {
  family: ReturnType<typeof resolvePrimaryGenreFamily>;
  genres: Array<{ id?: number | null; name?: string | null } | string | null | undefined>;
  genreIds: Array<number | string | null | undefined>;
}): GenreBadgeSpec | null => {
  if (genreBadgeMode === DEFAULT_GENRE_BADGE_MODE || !family) {
    return null;
  }
  const localizedLabel = resolveLocalizedGenreBadgeLabel({
    family,
    genres,
    genreIds,
  });
  return {
    familyId: family.id,
    label: localizedLabel,
    accentColor: family.accentColor,
    mode: genreBadgeMode,
    style: genreBadgeStyle,
    position: genreBadgePosition,
    scalePercent: effectiveGenreBadgeScale,
    offsetX: genreBadgeOffsetX,
    offsetY: genreBadgeOffsetY,
    borderWidth: input.genreBadgeBorderWidth,
    backgroundOpacity: input.genreBadgeBackgroundOpacity,
    noBackgroundOutlineColor: noBackgroundBadgeOutlineColor,
    noBackgroundOutlineWidth: noBackgroundBadgeOutlineWidth,
    tileAccentColor: genreBadgeStyle === 'tile' ? (input.genreBadgeTileAccentColor || undefined) : undefined,
  };
};
let primaryGenreFamily = resolvePrimaryGenreFamily(
  Array.isArray(media?.genres) ? media.genres : [],
  Array.isArray(media?.genre_ids) ? media.genre_ids : [],
);
let resolvedGenres = Array.isArray(media?.genres) ? media.genres : [];
let resolvedGenreIds = Array.isArray(media?.genre_ids) ? media.genre_ids : [];
let genreBadge = buildResolvedGenreBadge({
  family: primaryGenreFamily,
  genres: resolvedGenres,
  genreIds: resolvedGenreIds,
});

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
let trendingRecognitionBadges: RatingBadge[] = [];
let streamBadgesDeferred = false;
let bundledWatchProviderResults: unknown = null;
let movieHasPhysicalMediaRelease: boolean | null = null;
let transientProviderFailureTtlMs: number | null = null;
let localizedPosterTitleFromDetails: string | null = null;
let effectiveRequestedImageLang = requestedImageLang;
let effectiveIncludeImageLanguage = includeImageLanguage;

const resolveOriginalImageLanguage = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const normalized = normalizeImageLanguage(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const originalImageLanguageFromMedia = useOriginalImageLanguage
  ? resolveOriginalImageLanguage(media?.original_language)
  : null;

if (originalImageLanguageFromMedia) {
  effectiveRequestedImageLang = originalImageLanguageFromMedia;
  effectiveIncludeImageLanguage = buildIncludeImageLanguage(
    originalImageLanguageFromMedia,
    FALLBACK_IMAGE_LANGUAGE,
  );
}
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
const fallbackKitsuRating = rawFallbackProviderRatings.kitsu || rawFallbackKitsuRating;
const shouldRenderRawKitsuFallbackRating =
  useRawKitsuFallback && needsKitsuRating && typeof fallbackKitsuRating === 'string' && fallbackKitsuRating.length > 0;
const shouldRenderRatings = shouldApplyRatings;
const shouldRenderStreamBadges = shouldApplyStreamBadges && !resolveIsAnimeContent();
const shouldFetchSourceBackedTrendingRanks =
  shouldRenderStreamBadges &&
  (mediaType === 'movie' || mediaType === 'tv') &&
  qualityBadgePreferences.some((badgeKey) => SOURCE_BACKED_TRENDING_BADGE_KEYS.has(badgeKey as BadgeKey));
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
    ? getAdaptiveStreamCacheTtlMs({
      id: torrentioIdForCache,
      mediaType: resolvedRatingMediaType === 'movie' ? 'movie' : 'series',
      releaseDate: releaseDateForCache,
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
const trendingRankingMembershipPromise: Promise<TrendingRankingMembership | null> =
  shouldFetchSourceBackedTrendingRanks && media?.id != null && mediaType
    ? (async () => {
        const tmdbMediaId = Number(media.id);
        if (!Number.isFinite(tmdbMediaId)) {
          return null;
        }

        const fetchTrendingWindowResponses = async (window: 'day' | 'week') =>
          Promise.all(
            [1, 2].map((page) =>
              fetchJsonCached(
                `tmdb:${mediaType}:trending:${window}:page:${page}:v1`,
                `${TMDB_API_BASE_URL}/trending/${mediaType}/${window}?api_key=${tmdbKey}&page=${page}`,
                TMDB_TRENDING_RANK_CACHE_TTL_MS,
                phases,
                'tmdb',
              ),
            ),
          );

        const [dayResponses, weekResponses] = await Promise.all([
          fetchTrendingWindowResponses('day'),
          fetchTrendingWindowResponses('week'),
        ]);

        return {
          trendingDayRank: resolveTmdbTrendingRank({ responses: dayResponses, mediaId: tmdbMediaId }),
          trendingWeekRank: resolveTmdbTrendingRank({ responses: weekResponses, mediaId: tmdbMediaId }),
        };
      })()
    : Promise.resolve(null);
const detailsBundlePromise = !useRawKitsuFallback
  ? (async () => {
    const loadDetailsBundle = async (language: string, includeImageLanguageValue: string) => {
      const detailsUrl =
        `${TMDB_API_BASE_URL}/${mediaType}/${media.id}?api_key=${tmdbKey}&language=${language}&append_to_response=${['images', 'external_ids', certificationAppendTarget, 'keywords'].filter(Boolean).join(',')}&include_image_language=${encodeURIComponent(includeImageLanguageValue)}`;

      const [detailsResponse, fallbackDetailsResponse, watchProvidersResponse] = await Promise.all([
        fetchJsonCached(
          `tmdb:${mediaType}:${media.id}:details:${useOriginalImageLanguage ? `original:${language}` : language}:bundle:v2:${includeImageLanguageValue}`,
          detailsUrl,
          TMDB_CACHE_TTL_MS,
          phases,
          'tmdb'
        ),
        language !== FALLBACK_IMAGE_LANGUAGE
          ? fetchJsonCached(
            `tmdb:${mediaType}:${media.id}:details:${useOriginalImageLanguage ? `original:${FALLBACK_IMAGE_LANGUAGE}` : FALLBACK_IMAGE_LANGUAGE}:bundle:v2:${includeImageLanguageValue}`,
            `${TMDB_API_BASE_URL}/${mediaType}/${media.id}?api_key=${tmdbKey}&language=${FALLBACK_IMAGE_LANGUAGE}&append_to_response=${['images', 'external_ids', certificationAppendTarget, 'keywords'].filter(Boolean).join(',')}&include_image_language=${encodeURIComponent(includeImageLanguageValue)}`,
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
        requestedImageLang: language,
        includeImageLanguage: includeImageLanguageValue,
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
    };

    const certificationAppendTarget =
      mediaType === 'movie' ? 'release_dates' : mediaType === 'tv' ? 'content_ratings' : null;
    const watchProvidersUrl = `${TMDB_API_BASE_URL}/${mediaType}/${media.id}/watch/providers?api_key=${tmdbKey}`;

    let detailsBundle = await loadDetailsBundle(
      effectiveRequestedImageLang,
      effectiveIncludeImageLanguage,
    );
    const resolvedOriginalImageLanguage = useOriginalImageLanguage
      ? resolveOriginalImageLanguage(
        originalImageLanguageFromMedia,
        detailsBundle.details?.original_language,
        detailsBundle.fallbackDetails?.original_language,
      )
      : null;

    if (
      resolvedOriginalImageLanguage &&
      (resolvedOriginalImageLanguage !== detailsBundle.requestedImageLang ||
        buildIncludeImageLanguage(resolvedOriginalImageLanguage, FALLBACK_IMAGE_LANGUAGE) !==
          detailsBundle.includeImageLanguage)
    ) {
      detailsBundle = await loadDetailsBundle(
        resolvedOriginalImageLanguage,
        buildIncludeImageLanguage(resolvedOriginalImageLanguage, FALLBACK_IMAGE_LANGUAGE),
      );
    }

    return detailsBundle;
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
let streamBadgesPromise: Promise<Awaited<ReturnType<typeof fetchTorrentioBadges>>> | null = null;
const startStreamBadgesWarm =
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
      const torrentioCacheTtlMs = getAdaptiveStreamCacheTtlMs({
        id: baseTorrentioId,
        mediaType: torrentioType,
        releaseDate: mediaType === 'movie' ? media?.release_date : media?.first_air_date,
      });
      if (!shouldBlockOnStreamBadges) {
        const cachedStreamBadges = getCachedTorrentioBadges({
          type: torrentioType,
          id: torrentioId,
          cacheTtlMs: torrentioCacheTtlMs,
          remuxDisplayMode,
        });
        if (cachedStreamBadges) {
          return cachedStreamBadges;
        }

        streamBadgesDeferred = true;
        streamBadgesPromise = fetchTorrentioBadges({
          type: torrentioType,
          id: torrentioId,
          phases,
          cacheTtlMs: torrentioCacheTtlMs,
          remuxDisplayMode,
        });
        void streamBadgesPromise.then((result) => {
          logger.request(
            `[XRDB] background Torrentio warm completed for ${torrentioType}:${torrentioId} cacheHit=${result.cacheHit === true ? 'true' : 'false'} host=${result.selectedBaseUrl ?? 'cache'}`,
          );
        });
        void streamBadgesPromise.catch((error) => {
          logger.warn(
            '[XRDB] background Torrentio warm failed:',
            error instanceof Error ? error.message : error,
          );
        });
        return { badges: [], cacheTtlMs: torrentioCacheTtlMs };
      }

      streamBadgesPromise = fetchTorrentioBadges({
        type: torrentioType,
        id: torrentioId,
        phases,
        cacheTtlMs: torrentioCacheTtlMs,
        remuxDisplayMode,
      });
      return streamBadgesPromise;
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
const genreBadgeAutoScale = resolveGenreBadgeAutoScale({
  imageType,
  outputWidth,
  outputHeight,
});
effectiveGenreBadgeScale = Math.max(1, Math.round(genreBadgeScale * genreBadgeAutoScale));
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
    requestedImageLang: bundledRequestedImageLang,
    includeImageLanguage: bundledIncludeImageLanguage,
  } = await detailsBundlePromise;
  effectiveRequestedImageLang = bundledRequestedImageLang;
  effectiveIncludeImageLanguage = bundledIncludeImageLanguage;
  bundledWatchProviderResults = watchProviderResults;
  tmdbRating = bundledRating;
  localizedPosterTitleFromDetails = pickPosterTitleFromMedia(details, mediaType, null);
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
        ? resolveMovieCertificationBadge(bundledCertificationPayload, effectiveRequestedImageLang)
        : mediaType === 'tv'
          ? resolveTvCertificationBadge(bundledCertificationPayload, effectiveRequestedImageLang)
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
    trendingRecognitionBadges =
      mediaType === 'movie' || mediaType === 'tv'
        ? buildTrendingRecognitionBadges({
            media,
            details,
            mediaType,
            rankingMembership: await trendingRankingMembershipPromise,
          }).map((badge) => ({
            key: badge.key,
            label: badge.label,
            value: '',
            iconUrl: '',
            accentColor: badge.accentColor,
          }))
        : [];
  }
  primaryGenreFamily = resolvePrimaryGenreFamily(
    [
      ...(Array.isArray(details?.genres) ? details.genres : []),
      ...(Array.isArray(fallbackDetails?.genres) ? fallbackDetails.genres : []),
      ...(Array.isArray(media?.genres) ? media.genres : []),
    ],
    [
      ...(Array.isArray(details?.genres) ? details.genres.map((entry: any) => entry?.id) : []),
      ...(Array.isArray(fallbackDetails?.genres)
        ? fallbackDetails.genres.map((entry: any) => entry?.id)
        : []),
      ...(Array.isArray(media?.genres) ? media.genres.map((entry: any) => entry?.id) : []),
      ...(Array.isArray(media?.genre_ids) ? media.genre_ids : []),
    ],
  );
  resolvedGenres = [
    ...(Array.isArray(details?.genres) ? details.genres : []),
    ...(Array.isArray(fallbackDetails?.genres) ? fallbackDetails.genres : []),
    ...(Array.isArray(media?.genres) ? media.genres : []),
  ];
  resolvedGenreIds = [
    ...(Array.isArray(details?.genres) ? details.genres.map((entry: any) => entry?.id) : []),
    ...(Array.isArray(fallbackDetails?.genres)
      ? fallbackDetails.genres.map((entry: any) => entry?.id)
      : []),
    ...(Array.isArray(media?.genres) ? media.genres.map((entry: any) => entry?.id) : []),
    ...(Array.isArray(media?.genre_ids) ? media.genre_ids : []),
  ];
  genreBadge = buildResolvedGenreBadge({
    family: primaryGenreFamily,
    genres: resolvedGenres,
    genreIds: resolvedGenreIds,
  });
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
    requestedImageLang: effectiveRequestedImageLang,
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
    canonicalSeriesIdentity,
    canonicalEpisodeIdentity,
  });

  const initialImages = bundledImages || {};
  const initialSelection = await selectImagePath({
    posters: initialImages.posters || [],
    backdrops: initialImages.backdrops || [],
    logos: initialImages.logos || [],
    seasonIncludeImageLanguage: effectiveIncludeImageLanguage
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
      const logoFallback = pickByLanguageOrNeutral<{ iso_639_1?: string | null; iso_3166_1?: string | null; file_path?: string | null }>(
        logoFallbackImages.logos || [],
        effectiveRequestedImageLang,
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
  ? (localizedPosterTitleFromDetails || pickPosterTitleFromMedia(media, mediaType, rawFallbackTitle))
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
  transientProviderFailureTtlMs = providerRatingResult.transientProviderFailureTtlMs;
  primaryGenreFamily = resolvePrimaryGenreFamily(resolvedGenres, resolvedGenreIds);
  genreBadge = buildResolvedGenreBadge({
    family: primaryGenreFamily,
    genres: resolvedGenres,
    genreIds: resolvedGenreIds,
  });
}
if (startStreamBadgesWarm && shouldBlockOnStreamBadges) {
  const streamBadgeResult = await startStreamBadgesWarm;
  streamBadges = streamBadgeResult.badges;
  streamBadgesCacheTtlMs = streamBadgeResult.cacheTtlMs;
} else if (startStreamBadgesWarm && !shouldBlockOnStreamBadges) {
  const streamBadgeResult = await startStreamBadgesWarm;
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
      ...(input.ageRatingTileColor ? { tileAccentColor: input.ageRatingTileColor } : {}),
      ...(input.ageRatingBadgeStyle ? { styleOverride: input.ageRatingBadgeStyle } : {}),
    },
    ...streamBadges,
  ];
}
if (releaseStatusBadge) {
  streamBadges = [
    {
      ...releaseStatusBadge,
      ...(input.releaseStatusTileColor ? { tileAccentColor: input.releaseStatusTileColor } : {}),
      ...(input.releaseStatusBadgeStyle ? { styleOverride: input.releaseStatusBadgeStyle } : {}),
    },
    ...streamBadges,
  ];
}
if (mediaType === 'movie' && movieHasPhysicalMediaRelease === false) {
  streamBadges = streamBadges.filter((badge) => badge.key !== 'bluray' && badge.key !== 'remux');
}
if (imageType !== 'logo') {
  const watchProviderBadges =
    shouldRenderStreamBadges
      ? buildNetworkBadgesFromWatchProviderResults(
          bundledWatchProviderResults,
          effectiveRequestedImageLang,
        ).map((badge) => ({
          key: badge.key,
          label: badge.label,
          value: '',
          iconUrl: '',
          accentColor: badge.accentColor,
        }))
      : [];
  const networkBadges =
    mediaType === 'tv' && shouldRenderStreamBadges
      ? buildNetworkBadgesFromTvNetworks(media?.networks).map((badge) => ({
          key: badge.key,
          label: badge.label,
          value: '',
          iconUrl: '',
          accentColor: badge.accentColor,
        }))
      : [];
  streamBadges = [...trendingRecognitionBadges, ...networkBadges, ...watchProviderBadges, ...streamBadges];
}
const enabledQualityBadgeSet = new Set(qualityBadgePreferences);
streamBadges = MEDIA_FEATURE_BADGE_ORDER.flatMap((badgeKey) => {
  if (!enabledQualityBadgeSet.has(badgeKey)) {
    return [];
  }
  const match = streamBadges.find((badge) => badge.key === badgeKey);
  return match ? [match] : [];
});
if (input.qualityBadgesTileAccentColor) {
  streamBadges = streamBadges.map((badge) => {
    const k = String(badge.key);
    if (k === 'certification' || k === 'releasestatus' || isStreamingServiceBadgeKey(k)) return badge;
    return { ...badge, tileAccentColor: input.qualityBadgesTileAccentColor! };
  });
}
if (input.networkTileColor) {
  streamBadges = streamBadges.map((badge) => {
    if (!isStreamingServiceBadgeKey(String(badge.key))) return badge;
    return { ...badge, tileAccentColor: input.networkTileColor! };
  });
}
if (input.communityBadgeTheme) {
  streamBadges = streamBadges.map((badge) => ({
    ...badge,
    communityBadgeTheme: input.communityBadgeTheme,
  }));
}
if (input.qualityBadgeAppearanceOverrides) {
  const overrides = input.qualityBadgeAppearanceOverrides;
  streamBadges = streamBadges.map((badge) => {
    const override = overrides[String(badge.key)];
    if (!override?.iconUrl) return badge;
    return { ...badge, iconUrl: override.iconUrl, ...(override.fullBadge && { fullBadge: true }) };
  });
}
if (shouldRenderRawKitsuFallbackRating) {
  const existingKitsuRating = normalizeRatingValue(providerRatings.get('kitsu') || null);
  if (!existingKitsuRating) {
    providerRatings.set('kitsu', fallbackKitsuRating as string);
    renderedRatingTtlByProvider.set('kitsu', KITSU_CACHE_TTL_MS);
  }
}

const rawFallbackProviderEntries = Object.entries(rawFallbackProviderRatings || {}) as Array<[
  RatingPreference,
  string,
]>;
for (const [provider, value] of rawFallbackProviderEntries) {
  if (!requestedExternalRatings.has(provider)) continue;
  const normalized = normalizeRatingValue(value);
  if (!normalized) continue;
  const existingProviderRating = normalizeRatingValue(providerRatings.get(provider) || null);
  if (existingProviderRating) continue;
  providerRatings.set(provider, normalized);
  renderedRatingTtlByProvider.set(provider, KITSU_CACHE_TTL_MS);
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
    streamBadgesDeferred,
    posterTitleText,
    posterLogoUrl,
    providerRatingsEnabled: providerRatingsPromise !== null,
    transientProviderFailureTtlMs,
    shouldRenderBadges,
  };
};
