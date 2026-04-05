import type { NextRequest } from 'next/server';

import {
  ALL_RATING_PREFERENCES,
  parseRatingPreferencesAllowEmpty,
  type RatingPreference,
} from './ratingProviderCatalog.ts';
import {
  normalizeBackdropRatingLayout,
  type BackdropRatingLayout,
} from './backdropLayoutOptions.ts';
import {
  normalizePosterRatingLayout,
  normalizePosterRatingsMaxPerSide,
  type PosterRatingLayout,
} from './posterLayoutOptions.ts';
import {
  DEFAULT_RATING_STYLE,
  normalizeRatingStyle,
  type QualityBadgeStyle,
  type RatingStyle,
} from './ratingAppearance.ts';
import {
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  DEFAULT_AGGREGATE_ACCENT_MODE,
  DEFAULT_AGGREGATE_DYNAMIC_STOPS,
  DEFAULT_AGGREGATE_RATING_SOURCE,
  DEFAULT_RATING_PRESENTATION,
  normalizeAggregateAccentBarOffset,
  normalizeAggregateDynamicStops,
  normalizeAggregateAccentMode,
  normalizeAggregateRatingSource,
  normalizeRatingPresentation,
  resolveEffectiveRatingPresentation,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from './ratingPresentation.ts';
import {
  DEFAULT_SIDE_RATING_OFFSET,
  DEFAULT_SIDE_RATING_POSITION,
  normalizeSideRatingOffset,
  normalizeSideRatingPosition,
  type SideRatingPosition,
} from './sideRatingPosition.ts';
import {
  DEFAULT_RATING_STACK_OFFSET_PX,
  normalizeRatingStackOffsetPx,
  resolveStyleRatingStackOffset,
} from './ratingStackOffset.ts';
import {
  DEFAULT_POSTER_EDGE_OFFSET,
  normalizePosterEdgeOffset,
} from './posterEdgeOffset.ts';
import {
  DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
  DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
  normalizePosterCompactRingSource,
  type PosterCompactRingSource,
} from './posterCompactRing.ts';
import {
  DEFAULT_RATING_VALUE_MODE,
  normalizeRatingValueMode,
  type RatingValueMode,
} from './ratingDisplay.ts';
import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
  normalizeGenreBadgeAnimeGrouping,
  normalizeGenreBadgeMode,
  normalizeGenreBadgePosition,
  normalizeGenreBadgeStyle,
  type GenreBadgeAnimeGrouping,
  type GenreBadgeMode,
  type GenreBadgePosition,
  type GenreBadgeStyle,
} from './genreBadge.ts';
import { isAmbiguousTmdbXrdbId, normalizeXrdbId } from './proxyConfigBridge.ts';
import {
  DEFAULT_BACKDROP_GENRE_BADGE_BORDER_WIDTH_PX,
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_LOGO_GENRE_BADGE_BORDER_WIDTH_PX,
  DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_COLOR,
  DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  DEFAULT_POSTER_GENRE_BADGE_BORDER_WIDTH_PX,
  DEFAULT_THUMBNAIL_GENRE_BADGE_BORDER_WIDTH_PX,
  normalizeBadgeScalePercent,
  normalizeGenreBadgeBorderWidthPx,
  normalizeGenreBadgeScalePercent,
  normalizeHexColor,
  normalizeNoBackgroundBadgeOutlineWidthPx,
  normalizeQualityBadgeScalePercent,
  normalizeThumbnailRatingBadgeScalePercent,
  parseQualityBadgePreferencesAllowEmpty,
  parseRatingProviderAppearanceOverrides,
  type RatingProviderAppearanceOverrides,
} from './badgeCustomization.ts';
import { buildFinalImageRenderSeedKey } from './finalImageRenderSeed.ts';
import {
  buildIncludeImageLanguage,
  normalizeImageLanguage,
} from './imageLanguage.ts';
import {
  THUMBNAIL_RATING_PREFERENCES,
  XRDBID_PREFIX,
  parseKitsuEpisodeInput,
} from './episodeIdentity.ts';
import { normalizeSafeFallbackImageUrl } from './imageRouteSourceFetch.ts';
import {
  ALLOWED_IMAGE_TYPES,
  ANIME_NATIVE_INPUT_ID_PREFIX_SET,
  DEFAULT_BACKDROP_IMAGE_SIZE,
  DEFAULT_BLOCKBUSTER_DENSITY,
  DEFAULT_POSTER_IMAGE_SIZE,
  DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
  DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
  DEFAULT_RANDOM_POSTER_TEXT_MODE,
  EXPLICIT_ID_SOURCE_SET,
  FALLBACK_IMAGE_LANGUAGE,
  FANART_API_KEY,
  FANART_ARTWORK_SOURCE_SET,
  FANART_CLIENT_KEY,
  FINAL_IMAGE_RENDERER_CACHE_VERSION,
  MDBLIST_API_KEYS,
  OMDB_API_KEY,
  RAW_IMDB_ID_RE,
  SIMKL_CLIENT_ID,
  TORRENTIO_CACHE_TTL_MS,
  normalizeArtworkSource,
  normalizeBackdropImageSize,
  normalizeBlockbusterDensity,
  normalizeBooleanSearchFlag,
  normalizeEpisodeArtworkMode,
  normalizeOptionalBadgeCount,
  normalizePosterImageSize,
  normalizeRandomPosterFallbackMode,
  normalizeRandomPosterLanguageMode,
  normalizeRandomPosterMinDimension,
  normalizeRandomPosterMinVoteAverage,
  normalizeRandomPosterMinVoteCount,
  normalizeRandomPosterTextMode,
  normalizeRpdbFontScalePercent,
  resolveRpdbRatingBarPositionAliases,
  toAnimeMappingProvider,
  type AgeRatingBadgePosition,
  type AnimeMappingProvider,
  type ArtworkSource,
  type BackdropImageSize,
  type BadgeKey,
  type BlockbusterDensity,
  type EpisodeArtworkMode,
  type LogoBackground,
  type PosterImageSize,
  type PosterQualityBadgesPosition,
  type PosterTextPreference,
  type QualityBadgesSide,
  type RandomPosterFallbackMode,
  type RandomPosterLanguageMode,
  type RandomPosterTextMode,
} from './imageRouteConfig.ts';
import {
  getDeterministicTtlMs,
  HttpError,
  sha1Hex,
} from './imageRouteRuntime.ts';
import { pickOutputFormat, type OutputFormat } from './imageRouteMedia.ts';
import {
  normalizeAgeRatingBadgePosition,
  normalizeLogoBackground,
  normalizePosterQualityBadgesPosition,
  normalizeQualityBadgesSide,
  normalizeQualityBadgesStyle,
  normalizeStreamBadgesSetting,
} from './imageRouteDisplayPrefs.ts';
import { normalizeRemuxDisplayMode } from './uiConfig.ts';
import type { RemuxDisplayMode } from './mediaFeatures.ts';

type ImageType = (typeof ALLOWED_IMAGE_TYPES extends Set<infer T> ? T : never) & ('poster' | 'backdrop' | 'logo');

const MDBLIST_STATEFUL_RATING_PROVIDERS = new Set<RatingPreference>([
  'mdblist',
  'tomatoes',
  'tomatoesaudience',
  'letterboxd',
  'metacritic',
  'metacriticuser',
  'rogerebert',
  'trakt',
]);

const buildCredentialStateKey = (label: string, value?: string | null) => {
  const normalized = String(value || '').trim();
  return normalized ? `${label}:client:${sha1Hex(normalized).slice(0, 12)}` : `${label}:none`;
};

const buildPoolAwareStateKey = ({
  label,
  directValue,
  pooledValues,
}: {
  label: string;
  directValue?: string | null;
  pooledValues: string[];
}) => {
  const normalizedDirect = String(directValue || '').trim();
  if (normalizedDirect) {
    return `${label}:manual:${sha1Hex(normalizedDirect).slice(0, 12)}`;
  }
  if (pooledValues.length > 0) {
    return `${label}:pool:${sha1Hex(pooledValues.join('|')).slice(0, 12)}`;
  }
  return `${label}:none`;
};

export type ImageRouteRequestState = {
  imageType: ImageType;
  isThumbnailRequest: boolean;
  outputFormat: OutputFormat;
  cleanId: string;
  requestedImageLang: string;
  includeImageLanguage: string;
  ratingValueMode: RatingValueMode;
  genreBadgeMode: GenreBadgeMode;
  genreBadgeStyle: GenreBadgeStyle;
  genreBadgePosition: GenreBadgePosition;
  genreBadgeScale: number;
  genreBadgeBorderWidth: number;
  effectiveGenreBadgeScale: number;
  genreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  posterRatingsLayout: PosterRatingLayout;
  posterRatingsMaxPerSide: number | null;
  posterRatingsMax: number | null;
  posterEdgeOffset: number;
  backdropRatingsLayout: BackdropRatingLayout;
  backdropRatingsMax: number | null;
  backdropBottomRatingsRow: boolean;
  logoRatingsMax: number | null;
  logoBottomRatingsRow: boolean;
  posterSideRatingsPosition: SideRatingPosition;
  posterSideRatingsOffset: number;
  backdropSideRatingsPosition: SideRatingPosition;
  backdropSideRatingsOffset: number;
  sideRatingsPosition: SideRatingPosition;
  sideRatingsOffset: number;
  qualityBadgesSide: QualityBadgesSide;
  posterQualityBadgesPosition: PosterQualityBadgesPosition;
  ageRatingBadgePosition: AgeRatingBadgePosition;
  qualityBadgesStyle: QualityBadgeStyle;
  qualityBadgesMax: number | null;
  qualityBadgePreferences: BadgeKey[];
  remuxDisplayMode: RemuxDisplayMode;
  ratingStyle: RatingStyle;
  ratingStackOffsetX: number;
  ratingStackOffsetY: number;
  logoBackground: LogoBackground;
  providerAppearanceOverrides: RatingProviderAppearanceOverrides;
  posterRatingBadgeScale: number;
  backdropRatingBadgeScale: number;
  logoRatingBadgeScale: number;
  posterQualityBadgeScale: number;
  backdropQualityBadgeScale: number;
  mdblistKey: string | null;
  tmdbKey: string;
  simklClientId: string;
  simklClientSource: 'query' | 'server' | 'none';
  debugRatings: boolean;
  idPrefix: string;
  inputAnimeMappingProvider: AnimeMappingProvider | null;
  inputAnimeMappingExternalId: string | null;
  mediaId: string;
  season: string | null;
  episode: string | null;
  isTmdb: boolean;
  isTvdb: boolean;
  isCanonId: boolean;
  tvdbSeriesId: string | null;
  isKitsu: boolean;
  isAniListInput: boolean;
  explicitTmdbMediaType: 'movie' | 'tv' | null;
  hasNativeAnimeInput: boolean;
  allowAnimeOnlyRatings: boolean;
  hasConfirmedAnimeMapping: boolean;
  posterTextPreference: PosterTextPreference;
  randomPosterTextMode: RandomPosterTextMode;
  randomPosterLanguageMode: RandomPosterLanguageMode;
  randomPosterMinVoteCount: number | null;
  randomPosterMinVoteAverage: number | null;
  randomPosterMinWidth: number | null;
  randomPosterMinHeight: number | null;
  randomPosterFallbackMode: RandomPosterFallbackMode;
  ratingPresentation: RatingPresentation;
  posterRingValueSource: PosterCompactRingSource;
  posterRingProgressSource: PosterCompactRingSource;
  aggregateRatingSource: AggregateRatingSource;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string | null;
  aggregateCriticsAccentColor: string | null;
  aggregateAudienceAccentColor: string | null;
  aggregateValueColor: string | null;
  aggregateCriticsValueColor: string | null;
  aggregateAudienceValueColor: string | null;
  aggregateDynamicStops: string;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  posterNoBackgroundBadgeOutlineColor: string;
  posterNoBackgroundBadgeOutlineWidth: number;
  blockbusterDensity: BlockbusterDensity;
  hasExplicitRatingOrder: boolean;
  shouldApplyRatings: boolean;
  shouldApplyStreamBadges: boolean;
  shouldRenderLogoBackground: boolean;
  shouldCacheFinalImage: boolean;
  posterImageSize: PosterImageSize;
  backdropImageSize: BackdropImageSize;
  posterArtworkSource: ArtworkSource;
  backdropArtworkSource: ArtworkSource;
  logoArtworkSource: ArtworkSource;
  ratingBlackStripEnabled: boolean;
  thumbnailEpisodeArtwork: EpisodeArtworkMode;
  backdropEpisodeArtwork: EpisodeArtworkMode;
  artworkSelectionSeed: string;
  fanartKey: string;
  fanartClientKey: string;
  sourceFallbackUrl: string | null;
  renderSeedKey: string;
  effectiveRatingPreferences: RatingPreference[];
  selectedRatings: Set<RatingPreference>;
};

export const resolveImageRouteRequestState = async ({
  request,
  imageType,
  id,
}: {
  request: NextRequest;
  imageType: ImageType;
  id: string;
}): Promise<ImageRouteRequestState> => {
  const searchParams = request.nextUrl.searchParams;
  const isThumbnailRequest =
    imageType === 'backdrop' &&
    /^(1|true|yes|on)$/i.test(String(searchParams.get('thumbnail') || '').trim());
  const outputFormat = pickOutputFormat(imageType, request.headers.get('accept'));
  const requestedIdSourceCandidate = String(searchParams.get('idSource') || '')
    .trim()
    .toLowerCase();
  const cleanIdWithoutExtension = id.replace(/\.(?:jpg|jpeg|png|webp)$/i, '');
  const explicitIdPrefix = cleanIdWithoutExtension.split(':')[0]?.trim().toLowerCase() || '';
  const requestedCleanId =
    EXPLICIT_ID_SOURCE_SET.has(requestedIdSourceCandidate) &&
    !EXPLICIT_ID_SOURCE_SET.has(explicitIdPrefix) &&
    !RAW_IMDB_ID_RE.test(cleanIdWithoutExtension)
      ? `${requestedIdSourceCandidate}:${cleanIdWithoutExtension}`
      : cleanIdWithoutExtension;
  const cleanId = normalizeXrdbId(requestedCleanId) ?? requestedCleanId;
  const tmdbIdScopeParam = String(searchParams.get('tmdbIdScope') || '')
    .trim()
    .toLowerCase();
  const useStrictTmdbIdScope = tmdbIdScopeParam === 'strict';

  if (
    useStrictTmdbIdScope &&
    (imageType === 'backdrop' || imageType === 'logo') &&
    isAmbiguousTmdbXrdbId(cleanId)
  ) {
    throw new HttpError(
      'Strict TMDB ID scope requires tmdb:movie:{tmdb_id} or tmdb:tv:{tmdb_id} for backdrop and logo requests.',
      400,
    );
  }

  const requestedFallbackUrl = searchParams.get('fallbackUrl');
  const lang = searchParams.get('lang') || FALLBACK_IMAGE_LANGUAGE;
  const ratingValueMode = normalizeRatingValueMode(
    searchParams.get('ratingValueMode'),
    DEFAULT_RATING_VALUE_MODE,
  );
  const globalGenreBadgeMode = normalizeGenreBadgeMode(searchParams.get('genreBadge'));
  const globalGenreBadgeStyle = normalizeGenreBadgeStyle(
    searchParams.get('genreBadgeStyle'),
    DEFAULT_GENRE_BADGE_STYLE,
  );
  const globalGenreBadgePosition = normalizeGenreBadgePosition(
    searchParams.get('genreBadgePosition'),
    DEFAULT_GENRE_BADGE_POSITION,
  );
  const globalGenreBadgeScale = normalizeGenreBadgeScalePercent(
    searchParams.get('genreBadgeScale'),
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const globalGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    searchParams.get('genreBadgeAnimeGrouping'),
    DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  );
  const posterGenreBadgeMode = normalizeGenreBadgeMode(
    searchParams.get('posterGenreBadge') ?? searchParams.get('genreBadge'),
    globalGenreBadgeMode,
  );
  const backdropGenreBadgeMode = normalizeGenreBadgeMode(
    searchParams.get('backdropGenreBadge') ?? searchParams.get('genreBadge'),
    globalGenreBadgeMode,
  );
  const thumbnailGenreBadgeMode = normalizeGenreBadgeMode(
    searchParams.get('thumbnailGenreBadge') ?? searchParams.get('backdropGenreBadge') ?? searchParams.get('genreBadge'),
    backdropGenreBadgeMode,
  );
  const logoGenreBadgeMode = normalizeGenreBadgeMode(
    searchParams.get('logoGenreBadge') ?? searchParams.get('genreBadge'),
    globalGenreBadgeMode,
  );
  const posterGenreBadgeStyle = normalizeGenreBadgeStyle(
    searchParams.get('posterGenreBadgeStyle') ?? searchParams.get('genreBadgeStyle'),
    globalGenreBadgeStyle,
  );
  const backdropGenreBadgeStyle = normalizeGenreBadgeStyle(
    searchParams.get('backdropGenreBadgeStyle') ?? searchParams.get('genreBadgeStyle'),
    globalGenreBadgeStyle,
  );
  const thumbnailGenreBadgeStyle = normalizeGenreBadgeStyle(
    searchParams.get('thumbnailGenreBadgeStyle') ??
      searchParams.get('backdropGenreBadgeStyle') ??
      searchParams.get('genreBadgeStyle'),
    backdropGenreBadgeStyle,
  );
  const logoGenreBadgeStyle = normalizeGenreBadgeStyle(
    searchParams.get('logoGenreBadgeStyle') ?? searchParams.get('genreBadgeStyle'),
    globalGenreBadgeStyle,
  );
  const posterGenreBadgePosition = normalizeGenreBadgePosition(
    searchParams.get('posterGenreBadgePosition') ?? searchParams.get('genreBadgePosition'),
    globalGenreBadgePosition,
  );
  const backdropGenreBadgePosition = normalizeGenreBadgePosition(
    searchParams.get('backdropGenreBadgePosition') ?? searchParams.get('genreBadgePosition'),
    globalGenreBadgePosition,
  );
  const thumbnailGenreBadgePosition = normalizeGenreBadgePosition(
    searchParams.get('thumbnailGenreBadgePosition') ??
      searchParams.get('backdropGenreBadgePosition') ??
      searchParams.get('genreBadgePosition'),
    backdropGenreBadgePosition,
  );
  const logoGenreBadgePosition = normalizeGenreBadgePosition(
    searchParams.get('logoGenreBadgePosition') ?? searchParams.get('genreBadgePosition'),
    globalGenreBadgePosition,
  );
  const posterGenreBadgeScale = normalizeGenreBadgeScalePercent(
    searchParams.get('posterGenreBadgeScale') ?? searchParams.get('genreBadgeScale'),
    globalGenreBadgeScale,
  );
  const backdropGenreBadgeScale = normalizeGenreBadgeScalePercent(
    searchParams.get('backdropGenreBadgeScale') ?? searchParams.get('genreBadgeScale'),
    globalGenreBadgeScale,
  );
  const thumbnailGenreBadgeScale = normalizeGenreBadgeScalePercent(
    searchParams.get('thumbnailGenreBadgeScale') ??
      searchParams.get('backdropGenreBadgeScale') ??
      searchParams.get('genreBadgeScale'),
    backdropGenreBadgeScale,
  );
  const logoGenreBadgeScale = normalizeGenreBadgeScalePercent(
    searchParams.get('logoGenreBadgeScale') ?? searchParams.get('genreBadgeScale'),
    globalGenreBadgeScale,
  );
  const globalGenreBadgeBorderWidth = normalizeGenreBadgeBorderWidthPx(
    searchParams.get('genreBadgeBorderWidth'),
    DEFAULT_POSTER_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const posterGenreBadgeBorderWidth = normalizeGenreBadgeBorderWidthPx(
    searchParams.get('posterGenreBadgeBorderWidth') ?? searchParams.get('genreBadgeBorderWidth'),
    globalGenreBadgeBorderWidth,
  );
  const backdropGenreBadgeBorderWidth = normalizeGenreBadgeBorderWidthPx(
    searchParams.get('backdropGenreBadgeBorderWidth') ?? searchParams.get('genreBadgeBorderWidth'),
    DEFAULT_BACKDROP_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const thumbnailGenreBadgeBorderWidth = normalizeGenreBadgeBorderWidthPx(
    searchParams.get('thumbnailGenreBadgeBorderWidth') ??
      searchParams.get('backdropGenreBadgeBorderWidth') ??
      searchParams.get('genreBadgeBorderWidth'),
    backdropGenreBadgeBorderWidth,
  );
  const logoGenreBadgeBorderWidth = normalizeGenreBadgeBorderWidthPx(
    searchParams.get('logoGenreBadgeBorderWidth') ?? searchParams.get('genreBadgeBorderWidth'),
    DEFAULT_LOGO_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const posterGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    searchParams.get('posterGenreBadgeAnimeGrouping') ??
      searchParams.get('genreBadgeAnimeGrouping'),
    globalGenreBadgeAnimeGrouping,
  );
  const backdropGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    searchParams.get('backdropGenreBadgeAnimeGrouping') ??
      searchParams.get('genreBadgeAnimeGrouping'),
    globalGenreBadgeAnimeGrouping,
  );
  const thumbnailGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    searchParams.get('thumbnailGenreBadgeAnimeGrouping') ??
      searchParams.get('backdropGenreBadgeAnimeGrouping') ??
      searchParams.get('genreBadgeAnimeGrouping'),
    backdropGenreBadgeAnimeGrouping,
  );
  const logoGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    searchParams.get('logoGenreBadgeAnimeGrouping') ?? searchParams.get('genreBadgeAnimeGrouping'),
    globalGenreBadgeAnimeGrouping,
  );
  const genreBadgeMode =
    imageType === 'poster'
      ? posterGenreBadgeMode
      : isThumbnailRequest
        ? thumbnailGenreBadgeMode
        : imageType === 'backdrop'
        ? backdropGenreBadgeMode
        : logoGenreBadgeMode;
  const genreBadgeStyle =
    imageType === 'poster'
      ? posterGenreBadgeStyle
      : isThumbnailRequest
        ? thumbnailGenreBadgeStyle
        : imageType === 'backdrop'
        ? backdropGenreBadgeStyle
        : logoGenreBadgeStyle;
  const genreBadgePosition =
    imageType === 'poster'
      ? posterGenreBadgePosition
      : isThumbnailRequest
        ? thumbnailGenreBadgePosition
        : imageType === 'backdrop'
        ? backdropGenreBadgePosition
        : logoGenreBadgePosition;
  const genreBadgeScale =
    imageType === 'poster'
      ? posterGenreBadgeScale
      : isThumbnailRequest
        ? thumbnailGenreBadgeScale
        : imageType === 'backdrop'
        ? backdropGenreBadgeScale
        : logoGenreBadgeScale;
  const genreBadgeBorderWidth =
    imageType === 'poster'
      ? posterGenreBadgeBorderWidth
      : isThumbnailRequest
        ? thumbnailGenreBadgeBorderWidth
        : imageType === 'backdrop'
          ? backdropGenreBadgeBorderWidth
          : logoGenreBadgeBorderWidth;
  const genreBadgeAnimeGrouping =
    imageType === 'poster'
      ? posterGenreBadgeAnimeGrouping
      : isThumbnailRequest
        ? thumbnailGenreBadgeAnimeGrouping
        : imageType === 'backdrop'
        ? backdropGenreBadgeAnimeGrouping
        : logoGenreBadgeAnimeGrouping;
  const effectiveGenreBadgeScale = genreBadgeScale;
  const globalRatings =
    searchParams.get('ratings') ??
    searchParams.get('order') ??
    searchParams.get('ratingOrder');
  const posterRatings = searchParams.get('posterRatings') ?? globalRatings;
  const backdropRatings = searchParams.get('backdropRatings') ?? globalRatings;
  const thumbnailRatings =
    searchParams.get('thumbnailRatings') ?? THUMBNAIL_RATING_PREFERENCES.join(',');
  const logoRatings = searchParams.get('logoRatings') ?? globalRatings;
  const globalRatingPresentation = normalizeRatingPresentation(
    searchParams.get('ratingPresentation'),
    DEFAULT_RATING_PRESENTATION,
  );
  const posterRatingPresentation = normalizeRatingPresentation(
    searchParams.get('posterRatingPresentation') ?? searchParams.get('ratingPresentation'),
    globalRatingPresentation,
  );
  const backdropRatingPresentation = normalizeRatingPresentation(
    searchParams.get('backdropRatingPresentation') ?? searchParams.get('ratingPresentation'),
    globalRatingPresentation,
  );
  const thumbnailRatingPresentation = normalizeRatingPresentation(
    searchParams.get('thumbnailRatingPresentation') ??
      searchParams.get('backdropRatingPresentation') ??
      searchParams.get('ratingPresentation'),
    backdropRatingPresentation,
  );
  const logoRatingPresentation = normalizeRatingPresentation(
    searchParams.get('logoRatingPresentation') ?? searchParams.get('ratingPresentation'),
    globalRatingPresentation,
  );
  const globalAggregateRatingSource = normalizeAggregateRatingSource(
    searchParams.get('aggregateRatingSource'),
    DEFAULT_AGGREGATE_RATING_SOURCE,
  );
  const posterAggregateRatingSource = normalizeAggregateRatingSource(
    searchParams.get('posterAggregateRatingSource') ?? searchParams.get('aggregateRatingSource'),
    globalAggregateRatingSource,
  );
  const backdropAggregateRatingSource = normalizeAggregateRatingSource(
    searchParams.get('backdropAggregateRatingSource') ??
      searchParams.get('aggregateRatingSource'),
    globalAggregateRatingSource,
  );
  const thumbnailAggregateRatingSource = normalizeAggregateRatingSource(
    searchParams.get('thumbnailAggregateRatingSource') ??
      searchParams.get('backdropAggregateRatingSource') ??
      searchParams.get('aggregateRatingSource'),
    backdropAggregateRatingSource,
  );
  const logoAggregateRatingSource = normalizeAggregateRatingSource(
    searchParams.get('logoAggregateRatingSource') ?? searchParams.get('aggregateRatingSource'),
    globalAggregateRatingSource,
  );
  const aggregateAccentMode = normalizeAggregateAccentMode(
    searchParams.get('aggregateAccentMode'),
    DEFAULT_AGGREGATE_ACCENT_MODE,
  );
  const posterRingValueSource = normalizePosterCompactRingSource(
    searchParams.get('posterRingValueSource'),
    DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
  );
  const posterRingProgressSource = normalizePosterCompactRingSource(
    searchParams.get('posterRingProgressSource'),
    DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
  );
  const aggregateAccentColor = normalizeHexColor(searchParams.get('aggregateAccentColor')) || null;
  const aggregateCriticsAccentColor =
    normalizeHexColor(searchParams.get('aggregateCriticsAccentColor')) || null;
  const aggregateAudienceAccentColor =
    normalizeHexColor(searchParams.get('aggregateAudienceAccentColor')) || null;
  const aggregateValueColor = normalizeHexColor(searchParams.get('aggregateValueColor')) || null;
  const aggregateCriticsValueColor =
    normalizeHexColor(searchParams.get('aggregateCriticsValueColor')) || null;
  const aggregateAudienceValueColor =
    normalizeHexColor(searchParams.get('aggregateAudienceValueColor')) || null;
  const aggregateDynamicStops = normalizeAggregateDynamicStops(
    searchParams.get('aggregateDynamicStops'),
    DEFAULT_AGGREGATE_DYNAMIC_STOPS,
  );
  const aggregateAccentBarOffset = normalizeAggregateAccentBarOffset(
    searchParams.get('aggregateAccentBarOffset'),
    DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  );
  const aggregateAccentBarVisibleParam =
    searchParams.get('aggregateAccentBarVisible') ??
    searchParams.get('aggregateAccentVisible') ??
    searchParams.get('compactAccentLineVisible');
  const aggregateAccentBarVisible = !(
    typeof aggregateAccentBarVisibleParam === 'string' &&
    ['0', 'false', 'off', 'no'].includes(aggregateAccentBarVisibleParam.trim().toLowerCase())
  );
  const posterNoBackgroundBadgeOutlineColor =
    normalizeHexColor(searchParams.get('posterNoBackgroundBadgeOutlineColor')) ||
    DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_COLOR;
  const posterNoBackgroundBadgeOutlineWidth = normalizeNoBackgroundBadgeOutlineWidthPx(
    searchParams.get('posterNoBackgroundBadgeOutlineWidth'),
    DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  );
  const imageTextParam =
    searchParams.get('imageText') ||
    searchParams.get('posterImageText') ||
    searchParams.get('posterText');
  const backdropImageTextParam =
    searchParams.get('backdropImageText') ??
    searchParams.get('imageText') ??
    searchParams.get('posterImageText') ??
    searchParams.get('posterText');
  const thumbnailImageTextParam =
    searchParams.get('thumbnailImageText') ??
    searchParams.get('backdropImageText') ??
    imageTextParam;
  const rpdbPosterTypeParam = searchParams.get('posterType');
  const hasTextlessPosterType =
    typeof rpdbPosterTypeParam === 'string' &&
    (rpdbPosterTypeParam.trim().toLowerCase().startsWith('textless-') ||
      rpdbPosterTypeParam.trim().toLowerCase() === 'textless-order');
  const explicitTextlessFlag = normalizeBooleanSearchFlag(searchParams.get('textless'));
  const textlessEnabled =
    explicitTextlessFlag === null ? hasTextlessPosterType : explicitTextlessFlag;
  const imageText =
    (isThumbnailRequest
      ? thumbnailImageTextParam
      : imageType === 'backdrop'
        ? backdropImageTextParam
        : imageTextParam) ||
    (imageType === 'backdrop' ? 'clean' : textlessEnabled ? 'clean' : 'original');
  const posterImageSize = normalizePosterImageSize(
    searchParams.get('posterImageSize') ??
      searchParams.get('posterSize') ??
      (imageType === 'poster' ? searchParams.get('imageSize') : null),
    DEFAULT_POSTER_IMAGE_SIZE,
  );
  const backdropImageSize = normalizeBackdropImageSize(
    searchParams.get('backdropImageSize') ??
      (imageType === 'backdrop' && !isThumbnailRequest ? searchParams.get('imageSize') : null),
    DEFAULT_BACKDROP_IMAGE_SIZE,
  );
  const randomPosterTextMode = normalizeRandomPosterTextMode(
    searchParams.get('randomPosterText'),
    DEFAULT_RANDOM_POSTER_TEXT_MODE,
  );
  const randomPosterLanguageMode = normalizeRandomPosterLanguageMode(
    searchParams.get('randomPosterLanguage'),
    DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
  );
  const randomPosterMinVoteCount = normalizeRandomPosterMinVoteCount(
    searchParams.get('randomPosterMinVoteCount'),
  );
  const randomPosterMinVoteAverage = normalizeRandomPosterMinVoteAverage(
    searchParams.get('randomPosterMinVoteAverage'),
  );
  const randomPosterMinWidth = normalizeRandomPosterMinDimension(
    searchParams.get('randomPosterMinWidth'),
  );
  const randomPosterMinHeight = normalizeRandomPosterMinDimension(
    searchParams.get('randomPosterMinHeight'),
  );
  const randomPosterFallbackMode = normalizeRandomPosterFallbackMode(
    searchParams.get('randomPosterFallback'),
    DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
  );
  const artworkSelectionSeedParam =
    searchParams.get('artworkSeed') || searchParams.get('randomSeed') || '';
  const legacyFanartCleanMode = imageText === 'fanartclean';
  const posterArtworkSource = legacyFanartCleanMode
    ? 'fanart'
    : normalizeArtworkSource(
        searchParams.get('posterArtworkSource') ?? searchParams.get('posterCleanSource'),
      );
  const normalizeNonPosterArtworkSource = (value: string | null) => {
    const normalized = normalizeArtworkSource(value);
    return normalized === 'omdb' ? 'tmdb' : normalized;
  };
  const backdropArtworkSource = legacyFanartCleanMode
    ? 'fanart'
    : normalizeNonPosterArtworkSource(
        searchParams.get('backdropArtworkSource') ?? searchParams.get('backdropCleanSource'),
      );
  const thumbnailArtworkSource = legacyFanartCleanMode
    ? 'fanart'
    : normalizeNonPosterArtworkSource(
        searchParams.get('thumbnailArtworkSource') ??
          searchParams.get('backdropArtworkSource') ??
          searchParams.get('backdropCleanSource'),
      );
  const logoArtworkSource = normalizeNonPosterArtworkSource(
    searchParams.get('logoArtworkSource') ?? searchParams.get('logoSource'),
  );
  const thumbnailEpisodeArtwork = normalizeEpisodeArtworkMode(
    searchParams.get('thumbnailEpisodeArtwork'),
    'still',
  );
  const backdropEpisodeArtwork = normalizeEpisodeArtworkMode(
    searchParams.get('backdropEpisodeArtwork'),
    'series',
  );
  const fanartKey = searchParams.get('fanartKey') || FANART_API_KEY;
  const fanartClientKey = searchParams.get('fanartClientKey') || FANART_CLIENT_KEY;
  const rpdbRatingBarAliases = resolveRpdbRatingBarPositionAliases(
    searchParams.get('ratingBarPos'),
  );
  const posterRatingsLayout = normalizePosterRatingLayout(
    searchParams.get('posterRatingsLayout') ?? rpdbRatingBarAliases.posterRatingsLayout,
  );
  const posterRatingsMaxPerSide = normalizePosterRatingsMaxPerSide(
    searchParams.get('posterRatingsMaxPerSide'),
  );
  const posterEdgeOffset = normalizePosterEdgeOffset(
    searchParams.get('posterEdgeOffset'),
    DEFAULT_POSTER_EDGE_OFFSET,
  );
  const logoRatingsMax = normalizeOptionalBadgeCount(searchParams.get('logoRatingsMax'));
  const backdropRatingsLayout = normalizeBackdropRatingLayout(
    searchParams.get('backdropRatingsLayout') ?? rpdbRatingBarAliases.backdropRatingsLayout,
  );
  const thumbnailRatingsLayout = normalizeBackdropRatingLayout(
    searchParams.get('thumbnailRatingsLayout') ??
      searchParams.get('backdropRatingsLayout') ??
      rpdbRatingBarAliases.backdropRatingsLayout,
  );
  const backdropBottomRatingsRow =
    normalizeBooleanSearchFlag(searchParams.get('backdropBottomRatingsRow')) === true;
  const thumbnailBottomRatingsRow =
    normalizeBooleanSearchFlag(
      searchParams.get('thumbnailBottomRatingsRow') ?? searchParams.get('backdropBottomRatingsRow'),
    ) === true;
  const logoBottomRatingsRow =
    normalizeBooleanSearchFlag(searchParams.get('logoBottomRatingsRow')) === true;
  const posterSideRatingsPosition = normalizeSideRatingPosition(
    searchParams.get('posterSideRatingsPosition') ??
      searchParams.get('sideRatingsPosition') ??
      rpdbRatingBarAliases.sideRatingsPosition,
    DEFAULT_SIDE_RATING_POSITION,
  );
  const posterSideRatingsOffset = normalizeSideRatingOffset(
    searchParams.get('posterSideRatingsOffset') ?? searchParams.get('sideRatingsOffset'),
    DEFAULT_SIDE_RATING_OFFSET,
  );
  const backdropSideRatingsPosition = normalizeSideRatingPosition(
    searchParams.get('backdropSideRatingsPosition') ??
      searchParams.get('sideRatingsPosition') ??
      rpdbRatingBarAliases.sideRatingsPosition,
    DEFAULT_SIDE_RATING_POSITION,
  );
  const thumbnailSideRatingsPosition = normalizeSideRatingPosition(
    searchParams.get('thumbnailSideRatingsPosition') ??
      searchParams.get('backdropSideRatingsPosition') ??
      searchParams.get('sideRatingsPosition') ??
      rpdbRatingBarAliases.sideRatingsPosition,
    DEFAULT_SIDE_RATING_POSITION,
  );
  const backdropSideRatingsOffset = normalizeSideRatingOffset(
    searchParams.get('backdropSideRatingsOffset') ?? searchParams.get('sideRatingsOffset'),
    DEFAULT_SIDE_RATING_OFFSET,
  );
  const thumbnailSideRatingsOffset = normalizeSideRatingOffset(
    searchParams.get('thumbnailSideRatingsOffset') ??
      searchParams.get('backdropSideRatingsOffset') ??
      searchParams.get('sideRatingsOffset'),
    DEFAULT_SIDE_RATING_OFFSET,
  );
  const effectiveBackdropSideRatingsPosition = isThumbnailRequest
    ? thumbnailSideRatingsPosition
    : backdropSideRatingsPosition;
  const effectiveBackdropSideRatingsOffset = isThumbnailRequest
    ? thumbnailSideRatingsOffset
    : backdropSideRatingsOffset;
  const sideRatingsPosition =
    imageType === 'backdrop' ? effectiveBackdropSideRatingsPosition : posterSideRatingsPosition;
  const sideRatingsOffset =
    imageType === 'backdrop' ? effectiveBackdropSideRatingsOffset : posterSideRatingsOffset;
  const globalStreamBadgesSetting = normalizeStreamBadgesSetting(searchParams.get('streamBadges'));
  const posterStreamBadgesSetting = normalizeStreamBadgesSetting(
    searchParams.get('posterStreamBadges') || searchParams.get('streamBadges'),
  );
  const backdropStreamBadgesSetting = normalizeStreamBadgesSetting(
    searchParams.get('backdropStreamBadges') || searchParams.get('streamBadges'),
  );
  const thumbnailStreamBadgesSetting = normalizeStreamBadgesSetting(
    searchParams.get('thumbnailStreamBadges') ||
      searchParams.get('backdropStreamBadges') ||
      searchParams.get('streamBadges'),
  );
  const streamBadgesSetting =
    imageType === 'poster'
      ? posterStreamBadgesSetting
      : isThumbnailRequest
        ? thumbnailStreamBadgesSetting
        : imageType === 'backdrop'
        ? backdropStreamBadgesSetting
        : globalStreamBadgesSetting;
  const qualityBadgesSide = normalizeQualityBadgesSide(
    searchParams.get('qualityBadgesSide') || searchParams.get('qualityBadgesPosition'),
  );
  const posterQualityBadgesPosition = normalizePosterQualityBadgesPosition(
    searchParams.get('posterQualityBadgesPosition'),
  );
  const ageRatingBadgePosition = normalizeAgeRatingBadgePosition(
    searchParams.get('ageRatingBadgePosition'),
  );
  const posterQualityBadgePreferences = parseQualityBadgePreferencesAllowEmpty(
    searchParams.get('posterQualityBadges'),
  );
  const backdropQualityBadgePreferences = parseQualityBadgePreferencesAllowEmpty(
    searchParams.get('backdropQualityBadges'),
  );
  const thumbnailQualityBadgePreferences = parseQualityBadgePreferencesAllowEmpty(
    searchParams.get('thumbnailQualityBadges') ?? searchParams.get('backdropQualityBadges'),
  );
  const globalQualityBadgesStyle = normalizeQualityBadgesStyle(
    searchParams.get('qualityBadgesStyle'),
  );
  const posterQualityBadgesStyle = normalizeQualityBadgesStyle(
    searchParams.get('posterQualityBadgesStyle') || searchParams.get('qualityBadgesStyle'),
  );
  const backdropQualityBadgesStyle = normalizeQualityBadgesStyle(
    searchParams.get('backdropQualityBadgesStyle') || searchParams.get('qualityBadgesStyle'),
  );
  const thumbnailQualityBadgesStyle = normalizeQualityBadgesStyle(
    searchParams.get('thumbnailQualityBadgesStyle') ??
      searchParams.get('backdropQualityBadgesStyle') ??
      searchParams.get('qualityBadgesStyle'),
  );
  const posterQualityBadgesMax = normalizeOptionalBadgeCount(
    searchParams.get('posterQualityBadgesMax'),
  );
  const backdropQualityBadgesMax = normalizeOptionalBadgeCount(
    searchParams.get('backdropQualityBadgesMax'),
  );
  const thumbnailQualityBadgesMax = normalizeOptionalBadgeCount(
    searchParams.get('thumbnailQualityBadgesMax') ?? searchParams.get('backdropQualityBadgesMax'),
  );
  const posterRemuxDisplayMode = normalizeRemuxDisplayMode(
    searchParams.get('posterRemuxDisplayMode') ?? searchParams.get('remuxDisplayMode'),
  );
  const backdropRemuxDisplayMode = normalizeRemuxDisplayMode(
    searchParams.get('backdropRemuxDisplayMode') ?? searchParams.get('remuxDisplayMode'),
  );
  const thumbnailRemuxDisplayMode = normalizeRemuxDisplayMode(
    searchParams.get('thumbnailRemuxDisplayMode') ??
      searchParams.get('backdropRemuxDisplayMode') ??
      searchParams.get('remuxDisplayMode'),
  );
  const remuxDisplayMode =
    imageType === 'poster'
      ? posterRemuxDisplayMode
      : isThumbnailRequest
        ? thumbnailRemuxDisplayMode
        : imageType === 'backdrop'
          ? backdropRemuxDisplayMode
          : 'composite' as const;
  const thumbnailRatingsMax = normalizeOptionalBadgeCount(
    searchParams.get('thumbnailRatingsMax') ?? searchParams.get('backdropRatingsMax'),
  );
  const posterRatingsMax = normalizeOptionalBadgeCount(searchParams.get('posterRatingsMax'));
  const backdropRatingsMax = normalizeOptionalBadgeCount(searchParams.get('backdropRatingsMax'));
  const effectiveBackdropRatingsMax = isThumbnailRequest ? thumbnailRatingsMax : backdropRatingsMax;
  const effectiveBackdropRatingsLayout = isThumbnailRequest
    ? thumbnailRatingsLayout
    : backdropRatingsLayout;
  const effectiveBackdropBottomRatingsRow = isThumbnailRequest
    ? thumbnailBottomRatingsRow
    : backdropBottomRatingsRow;
  const qualityBadgesStyle =
    imageType === 'poster'
      ? posterQualityBadgesStyle
      : isThumbnailRequest
        ? thumbnailQualityBadgesStyle
        : imageType === 'backdrop'
        ? backdropQualityBadgesStyle
        : globalQualityBadgesStyle;
  const qualityBadgesMax =
    imageType === 'poster'
      ? posterQualityBadgesMax
      : isThumbnailRequest
        ? thumbnailQualityBadgesMax
        : imageType === 'backdrop'
          ? backdropQualityBadgesMax
        : null;
  const qualityBadgePreferences =
    imageType === 'poster'
      ? posterQualityBadgePreferences
      : isThumbnailRequest
        ? thumbnailQualityBadgePreferences
        : imageType === 'backdrop'
          ? backdropQualityBadgePreferences
        : [];
  const typeRatingStyleParam =
    imageType === 'poster'
      ? searchParams.get('posterRatingStyle') ?? searchParams.get('posterRatingsStyle')
      : isThumbnailRequest
        ? searchParams.get('thumbnailRatingStyle') ?? searchParams.get('thumbnailRatingsStyle')
        : imageType === 'backdrop'
        ? searchParams.get('backdropRatingStyle') ?? searchParams.get('backdropRatingsStyle')
        : searchParams.get('logoRatingStyle') ?? searchParams.get('logoRatingsStyle');
  const ratingStyleParam =
    searchParams.get('ratingStyle') ||
    searchParams.get('ratingsStyle') ||
    typeRatingStyleParam ||
    searchParams.get('style');
  const ratingStyle = ratingStyleParam
    ? normalizeRatingStyle(ratingStyleParam)
    : imageType === 'logo'
      ? 'plain'
      : DEFAULT_RATING_STYLE;
  const typeRatingXOffsetPillGlassParam =
    imageType === 'poster'
      ? searchParams.get('posterRatingXOffsetPillGlass')
      : isThumbnailRequest
        ? searchParams.get('thumbnailRatingXOffsetPillGlass')
        : imageType === 'backdrop'
          ? searchParams.get('backdropRatingXOffsetPillGlass')
          : null;
  const typeRatingYOffsetPillGlassParam =
    imageType === 'poster'
      ? searchParams.get('posterRatingYOffsetPillGlass')
      : isThumbnailRequest
        ? searchParams.get('thumbnailRatingYOffsetPillGlass')
        : imageType === 'backdrop'
          ? searchParams.get('backdropRatingYOffsetPillGlass')
          : null;
  const typeRatingXOffsetSquareParam =
    imageType === 'poster'
      ? searchParams.get('posterRatingXOffsetSquare')
      : isThumbnailRequest
        ? searchParams.get('thumbnailRatingXOffsetSquare')
        : imageType === 'backdrop'
          ? searchParams.get('backdropRatingXOffsetSquare')
          : null;
  const typeRatingYOffsetSquareParam =
    imageType === 'poster'
      ? searchParams.get('posterRatingYOffsetSquare')
      : isThumbnailRequest
        ? searchParams.get('thumbnailRatingYOffsetSquare')
        : imageType === 'backdrop'
          ? searchParams.get('backdropRatingYOffsetSquare')
          : null;
  const ratingXOffsetPillGlass = normalizeRatingStackOffsetPx(
    typeRatingXOffsetPillGlassParam ??
      searchParams.get('ratingXOffsetPillGlass') ??
      searchParams.get('ratingXOffsetGlass'),
    DEFAULT_RATING_STACK_OFFSET_PX,
  );
  const ratingYOffsetPillGlass = normalizeRatingStackOffsetPx(
    typeRatingYOffsetPillGlassParam ??
      searchParams.get('ratingYOffsetPillGlass') ??
      searchParams.get('ratingYOffsetGlass'),
    DEFAULT_RATING_STACK_OFFSET_PX,
  );
  const ratingXOffsetSquare = normalizeRatingStackOffsetPx(
    typeRatingXOffsetSquareParam ?? searchParams.get('ratingXOffsetSquare'),
    DEFAULT_RATING_STACK_OFFSET_PX,
  );
  const ratingYOffsetSquare = normalizeRatingStackOffsetPx(
    typeRatingYOffsetSquareParam ?? searchParams.get('ratingYOffsetSquare'),
    DEFAULT_RATING_STACK_OFFSET_PX,
  );
  const { x: ratingStackOffsetX, y: ratingStackOffsetY } = resolveStyleRatingStackOffset({
    ratingStyle,
    ratingXOffsetPillGlass,
    ratingYOffsetPillGlass,
    ratingXOffsetSquare,
    ratingYOffsetSquare,
  });
  const logoBackground = normalizeLogoBackground(searchParams.get('logoBackground'));
  const providerAppearanceOverrides = parseRatingProviderAppearanceOverrides(
    searchParams.get('providerAppearance'),
  );
  const rpdbFontScalePercent = normalizeRpdbFontScalePercent(searchParams.get('fontScale'));
  const posterRatingBadgeScale = normalizeBadgeScalePercent(
    searchParams.get('posterRatingBadgeScale') ?? rpdbFontScalePercent,
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const backdropRatingBadgeScale = normalizeBadgeScalePercent(
    searchParams.get('backdropRatingBadgeScale') ?? rpdbFontScalePercent,
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const thumbnailRatingBadgeScale = normalizeThumbnailRatingBadgeScalePercent(
    searchParams.get('thumbnailRatingBadgeScale') ??
      searchParams.get('backdropRatingBadgeScale') ??
      rpdbFontScalePercent,
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const logoRatingBadgeScale = normalizeBadgeScalePercent(
    searchParams.get('logoRatingBadgeScale') ?? rpdbFontScalePercent,
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const posterQualityBadgeScale = normalizeQualityBadgeScalePercent(
    searchParams.get('posterQualityBadgeScale'),
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const backdropQualityBadgeScale = normalizeQualityBadgeScalePercent(
    searchParams.get('backdropQualityBadgeScale'),
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const thumbnailQualityBadgeScale = normalizeQualityBadgeScalePercent(
    searchParams.get('thumbnailQualityBadgeScale') ?? searchParams.get('backdropQualityBadgeScale'),
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const effectiveBackdropRatingBadgeScale = isThumbnailRequest
    ? thumbnailRatingBadgeScale
    : backdropRatingBadgeScale;
  const effectiveBackdropQualityBadgeScale = isThumbnailRequest
    ? thumbnailQualityBadgeScale
    : backdropQualityBadgeScale;
  const mdblistKey =
    searchParams.get('mdblistKey') || searchParams.get('mdblist_key');
  const tmdbKey = searchParams.get('tmdbKey') || searchParams.get('tmdb_key') || '';
  const simklClientIdFromQuery =
    searchParams.get('simklClientId') || searchParams.get('simkl_client_id') || '';
  const simklClientId = simklClientIdFromQuery || SIMKL_CLIENT_ID;
  const simklClientSource = simklClientIdFromQuery
    ? 'query'
    : SIMKL_CLIENT_ID
      ? 'server'
      : 'none';
  const debugRatings = /^(1|true|yes|on)$/i.test(
    String(searchParams.get('debugRatings') || '').trim(),
  );
  const parts = cleanId.split(':');
  const idPrefix = (parts[0] || '').trim().toLowerCase();
  const inputAnimeMappingProvider = toAnimeMappingProvider(idPrefix);
  let inputAnimeMappingExternalId =
    inputAnimeMappingProvider && typeof parts[1] === 'string' && parts[1].trim().length > 0
      ? parts[1].trim()
      : null;
  let mediaId = parts[0];
  let season: string | null = null;
  let episode: string | null = null;
  let isTmdb = false;
  let isTvdb = false;
  let isCanonId = false;
  let tvdbSeriesId: string | null = null;
  let isKitsu = false;
  const isAniListInput = idPrefix === 'anilist';
  let explicitTmdbMediaType: 'movie' | 'tv' | null = null;
  const hasNativeAnimeInput = ANIME_NATIVE_INPUT_ID_PREFIX_SET.has(idPrefix);
  let hasConfirmedAnimeMapping = hasNativeAnimeInput;
  let allowAnimeOnlyRatings = hasNativeAnimeInput;

  if (idPrefix === 'tmdb') {
    isTmdb = true;
    const explicitTypeCandidate = (parts[1] || '').trim().toLowerCase();
    if (explicitTypeCandidate === 'movie' || explicitTypeCandidate === 'tv') {
      explicitTmdbMediaType = explicitTypeCandidate as 'movie' | 'tv';
      mediaId = parts[2];
      season = parts.length > 3 ? parts[3] : null;
      episode = parts.length > 4 ? parts[4] : null;
      if (mediaId) {
        inputAnimeMappingExternalId = mediaId;
      }
    } else {
      mediaId = parts[1];
      season = parts.length > 2 ? parts[2] : null;
      episode = parts.length > 3 ? parts[3] : null;
    }
  } else if (idPrefix === 'kitsu') {
    isKitsu = true;
    const parsedKitsu = parseKitsuEpisodeInput(parts);
    mediaId = parsedKitsu.mediaId;
    season = parsedKitsu.season;
    episode = parsedKitsu.episode;
  } else if (idPrefix === 'tvdb') {
    isTvdb = true;
    mediaId = parts[1];
    tvdbSeriesId = parts[1] || null;
    season = parts.length > 2 ? parts[2] : null;
    episode = parts.length > 3 ? parts[3] : null;
  } else if (idPrefix === XRDBID_PREFIX) {
    isCanonId = true;
    mediaId = parts[1];
    season = parts.length > 2 ? parts[2] : null;
    episode = parts.length > 3 ? parts[3] : null;
  } else if (idPrefix === 'imdb' && inputAnimeMappingExternalId) {
    mediaId = inputAnimeMappingExternalId;
    season = parts.length > 2 ? parts[2] : null;
    episode = parts.length > 3 ? parts[3] : null;
  } else if (inputAnimeMappingProvider && inputAnimeMappingExternalId) {
    mediaId = inputAnimeMappingExternalId;
    season = parts.length > 2 ? parts[2] : null;
    episode = parts.length > 3 ? parts[3] : null;
  } else {
    season = parts.length > 1 ? parts[1] : null;
    episode = parts.length > 2 ? parts[2] : null;
  }

  const requestedImageLang = normalizeImageLanguage(lang) || FALLBACK_IMAGE_LANGUAGE;
  const includeImageLanguage = buildIncludeImageLanguage(
    requestedImageLang,
    FALLBACK_IMAGE_LANGUAGE,
  );
  const posterTextPreference: PosterTextPreference =
    imageText === 'clean' ||
    imageText === 'textless' ||
    imageText === 'alternative' ||
    imageText === 'random' ||
    imageText === 'original'
      ? imageText
      : legacyFanartCleanMode
        ? 'clean'
        : 'original';
  const ratingsForType =
    imageType === 'poster'
      ? posterRatings
      : isThumbnailRequest
        ? thumbnailRatings
        : imageType === 'backdrop'
          ? backdropRatings
          : logoRatings;
  const ratingPreferences =
    ratingsForType === null || ratingsForType === undefined
      ? [...ALL_RATING_PREFERENCES]
      : parseRatingPreferencesAllowEmpty(ratingsForType);
  const requestedRatingPresentation =
    imageType === 'poster'
      ? posterRatingPresentation
      : isThumbnailRequest
        ? thumbnailRatingPresentation
        : imageType === 'backdrop'
        ? backdropRatingPresentation
        : logoRatingPresentation;
  const ratingPresentation = resolveEffectiveRatingPresentation(
    requestedRatingPresentation,
    imageType,
  );
  const blockbusterDensity = normalizeBlockbusterDensity(
    searchParams.get('posterBlockbusterDensity') ?? searchParams.get('blockbusterDensity'),
    DEFAULT_BLOCKBUSTER_DENSITY,
  );
  const aggregateRatingSource =
    imageType === 'poster'
      ? posterAggregateRatingSource
      : isThumbnailRequest
        ? thumbnailAggregateRatingSource
        : imageType === 'backdrop'
        ? backdropAggregateRatingSource
        : logoAggregateRatingSource;
  const hasExplicitRatingOrder = ratingsForType !== null && ratingsForType !== undefined;
  const shouldApplyRatings = ratingPreferences.length > 0;
  const shouldApplyStreamBadges =
    imageType !== 'logo' &&
    (streamBadgesSetting === 'on' || streamBadgesSetting === 'auto') &&
    !hasNativeAnimeInput;
  const posterUsesFanartArtwork = FANART_ARTWORK_SOURCE_SET.has(posterArtworkSource);
  const effectiveBackdropArtworkSource = isThumbnailRequest
    ? thumbnailArtworkSource
    : backdropArtworkSource;
  const activeArtworkSource =
    imageType === 'poster'
      ? posterArtworkSource
      : imageType === 'backdrop'
        ? effectiveBackdropArtworkSource
        : logoArtworkSource;
  const ratingBlackStripEnabled = activeArtworkSource === 'blackbar';
  const backdropUsesFanartArtwork = FANART_ARTWORK_SOURCE_SET.has(effectiveBackdropArtworkSource);
  const logoUsesFanartArtwork = FANART_ARTWORK_SOURCE_SET.has(logoArtworkSource);
  const hasRandomArtworkSelection =
    posterTextPreference === 'random' ||
    posterArtworkSource === 'random' ||
    effectiveBackdropArtworkSource === 'random' ||
    logoArtworkSource === 'random';
  const artworkSelectionSeed = hasRandomArtworkSelection
    ? artworkSelectionSeedParam.trim() ||
      `${cleanId}:${imageType}:${new Date().toISOString().slice(0, 10)}`
    : '';
  const shouldRenderLogoBackground = imageType === 'logo' && logoBackground === 'dark';
  const streamBadgesSeedTtlMs = shouldApplyStreamBadges
    ? getDeterministicTtlMs(TORRENTIO_CACHE_TTL_MS, cleanId)
    : null;
  const streamBadgesSeedWindow =
    shouldApplyStreamBadges && streamBadgesSeedTtlMs
      ? Math.floor(Date.now() / streamBadgesSeedTtlMs)
      : null;
  const streamBadgesCacheKeySeed = shouldApplyStreamBadges
    ? `torrentio:${streamBadgesSeedWindow ?? 0}`
    : 'off';
  const shouldCacheFinalImage =
    shouldApplyRatings ||
    shouldApplyStreamBadges ||
    shouldRenderLogoBackground ||
    hasRandomArtworkSelection ||
    genreBadgeMode !== DEFAULT_GENRE_BADGE_MODE ||
    (imageType === 'poster' && posterTextPreference !== 'original') ||
    (imageType === 'poster' && posterUsesFanartArtwork) ||
    (imageType === 'backdrop' && backdropUsesFanartArtwork) ||
    (imageType === 'logo' && logoUsesFanartArtwork);
  const renderCacheBuster = (searchParams.get('cb') || '').trim();
  const effectiveRatingPreferences = shouldApplyRatings ? ratingPreferences : [];
  const selectedRatings = new Set<RatingPreference>(ratingPreferences);
  const usesMdblistSeed = effectiveRatingPreferences.some((provider) =>
    MDBLIST_STATEFUL_RATING_PROVIDERS.has(provider),
  );
  const usesSimklSeed = selectedRatings.has('simkl');
  const usesFanartArtwork =
    (imageType === 'poster' && posterUsesFanartArtwork) ||
    (imageType === 'backdrop' && backdropUsesFanartArtwork) ||
    (imageType === 'logo' && logoUsesFanartArtwork);
  const mdblistStateKey = usesMdblistSeed
    ? buildPoolAwareStateKey({
        label: 'mdblist',
        directValue: mdblistKey,
        pooledValues: MDBLIST_API_KEYS,
      })
    : 'mdblist:off';
  const simklStateKey = usesSimklSeed
    ? buildCredentialStateKey('simkl', simklClientId)
    : 'simkl:off';
  const fanartKeyHash = usesFanartArtwork ? sha1Hex(fanartKey || '').slice(0, 12) : '-';
  const fanartClientKeyHash = usesFanartArtwork
    ? sha1Hex(fanartClientKey || '').slice(0, 12)
    : '-';
  const usesOmdbArtwork =
    imageType === 'poster' && (posterArtworkSource === 'omdb' || posterArtworkSource === 'random');
  const omdbKeyHash = usesOmdbArtwork ? sha1Hex(OMDB_API_KEY || '').slice(0, 12) : '-';

  if (!tmdbKey) {
    throw new HttpError('TMDB API Key (tmdbKey) is required', 400);
  }

  const sourceFallbackUrl = await normalizeSafeFallbackImageUrl(requestedFallbackUrl);
  const sourceFallbackKey = sourceFallbackUrl ? sha1Hex(sourceFallbackUrl).slice(0, 12) : '-';
  const renderSeedKey = buildFinalImageRenderSeedKey({
    cacheVersion: FINAL_IMAGE_RENDERER_CACHE_VERSION,
    imageType: isThumbnailRequest ? 'thumbnail' : imageType,
    outputFormat,
    cleanId,
    requestedImageLang,
    posterTextPreference,
    randomPosterTextMode,
    randomPosterLanguageMode,
    randomPosterMinVoteCount,
    randomPosterMinVoteAverage,
    randomPosterMinWidth,
    randomPosterMinHeight,
    randomPosterFallbackMode,
    posterImageSize,
    backdropImageSize,
    posterArtworkSource,
    backdropArtworkSource: effectiveBackdropArtworkSource,
    logoArtworkSource,
    thumbnailEpisodeArtwork,
    backdropEpisodeArtwork,
    posterRatingsLayout,
    posterRatingsMaxPerSide,
    posterRatingsMax,
    posterEdgeOffset,
    backdropRatingsLayout: effectiveBackdropRatingsLayout,
    backdropRatingsMax: effectiveBackdropRatingsMax,
    backdropBottomRatingsRow: effectiveBackdropBottomRatingsRow,
    logoRatingsMax,
    logoBottomRatingsRow,
    qualityBadgesSide,
    posterQualityBadgesPosition,
    ageRatingBadgePosition,
    qualityBadgesStyle,
    qualityBadgesMax,
    qualityBadgePreferences,
    remuxDisplayMode,
    posterSideRatingsPosition,
    posterSideRatingsOffset,
    backdropSideRatingsPosition: effectiveBackdropSideRatingsPosition,
    backdropSideRatingsOffset: effectiveBackdropSideRatingsOffset,
    ratingPresentation,
    posterRingValueSource,
    posterRingProgressSource,
    blockbusterDensity,
    aggregateRatingSource,
    aggregateAccentMode,
    aggregateAccentColor,
    aggregateCriticsAccentColor,
    aggregateAudienceAccentColor,
    aggregateValueColor,
    aggregateCriticsValueColor,
    aggregateAudienceValueColor,
    aggregateDynamicStops,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    posterNoBackgroundBadgeOutlineColor,
    posterNoBackgroundBadgeOutlineWidth,
    artworkSelectionSeed,
    ratingStyle,
    ratingStackOffsetX,
    ratingStackOffsetY,
    ratingValueMode,
    posterRatingBadgeScale,
    backdropRatingBadgeScale: effectiveBackdropRatingBadgeScale,
    logoRatingBadgeScale,
    posterQualityBadgeScale,
    backdropQualityBadgeScale: effectiveBackdropQualityBadgeScale,
    genreBadgeMode,
    genreBadgeStyle,
    genreBadgePosition,
    genreBadgeScale,
    genreBadgeBorderWidth,
    genreBadgeAnimeGrouping,
    logoBackground,
    effectiveRatingPreferences,
    providerAppearanceOverrides,
    mdblistStateKey,
    simklStateKey,
    streamBadgesCacheKeySeed,
    fanartKeyHash,
    fanartClientKeyHash,
    omdbKeyHash,
    sourceFallbackKey,
    renderCacheBuster,
  });

  return {
    imageType,
    isThumbnailRequest,
    outputFormat,
    cleanId,
    requestedImageLang,
    includeImageLanguage,
    ratingValueMode,
    genreBadgeMode,
    genreBadgeStyle,
    genreBadgePosition,
    genreBadgeScale,
    genreBadgeBorderWidth,
    effectiveGenreBadgeScale,
    genreBadgeAnimeGrouping,
    posterRatingsLayout,
    posterRatingsMaxPerSide,
    posterRatingsMax,
    posterEdgeOffset,
    backdropRatingsLayout: effectiveBackdropRatingsLayout,
    backdropRatingsMax: effectiveBackdropRatingsMax,
    backdropBottomRatingsRow: effectiveBackdropBottomRatingsRow,
    logoRatingsMax,
    logoBottomRatingsRow,
    posterSideRatingsPosition,
    posterSideRatingsOffset,
    backdropSideRatingsPosition: effectiveBackdropSideRatingsPosition,
    backdropSideRatingsOffset: effectiveBackdropSideRatingsOffset,
    sideRatingsPosition,
    sideRatingsOffset,
    qualityBadgesSide,
    posterQualityBadgesPosition,
    ageRatingBadgePosition,
    qualityBadgesStyle,
    qualityBadgesMax,
    qualityBadgePreferences,
    remuxDisplayMode,
    ratingStyle,
    ratingStackOffsetX,
    ratingStackOffsetY,
    logoBackground,
    providerAppearanceOverrides,
    posterRatingBadgeScale,
    backdropRatingBadgeScale: effectiveBackdropRatingBadgeScale,
    logoRatingBadgeScale,
    posterQualityBadgeScale,
    backdropQualityBadgeScale: effectiveBackdropQualityBadgeScale,
    mdblistKey,
    tmdbKey,
    simklClientId,
    simklClientSource,
    debugRatings,
    idPrefix,
    inputAnimeMappingProvider,
    inputAnimeMappingExternalId,
    mediaId,
    season,
    episode,
    isTmdb,
    isTvdb,
    isCanonId,
    tvdbSeriesId,
    isKitsu,
    isAniListInput,
    explicitTmdbMediaType,
    hasNativeAnimeInput,
    allowAnimeOnlyRatings,
    hasConfirmedAnimeMapping,
    posterTextPreference,
    randomPosterTextMode,
    randomPosterLanguageMode,
    randomPosterMinVoteCount,
    randomPosterMinVoteAverage,
    randomPosterMinWidth,
    randomPosterMinHeight,
    randomPosterFallbackMode,
    ratingPresentation,
    posterRingValueSource,
    posterRingProgressSource,
    aggregateRatingSource,
    aggregateAccentMode,
    aggregateAccentColor,
    aggregateCriticsAccentColor,
    aggregateAudienceAccentColor,
    aggregateValueColor,
    aggregateCriticsValueColor,
    aggregateAudienceValueColor,
    aggregateDynamicStops,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    posterNoBackgroundBadgeOutlineColor,
    posterNoBackgroundBadgeOutlineWidth,
    blockbusterDensity,
    hasExplicitRatingOrder,
    shouldApplyRatings,
    shouldApplyStreamBadges,
    shouldRenderLogoBackground,
    shouldCacheFinalImage,
    posterImageSize,
    backdropImageSize,
    posterArtworkSource,
    backdropArtworkSource: effectiveBackdropArtworkSource,
    logoArtworkSource,
    ratingBlackStripEnabled,
    thumbnailEpisodeArtwork,
    backdropEpisodeArtwork,
    artworkSelectionSeed,
    fanartKey,
    fanartClientKey,
    sourceFallbackUrl,
    renderSeedKey,
    effectiveRatingPreferences,
    selectedRatings,
  };
};
