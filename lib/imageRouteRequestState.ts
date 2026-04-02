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
  DEFAULT_AGGREGATE_RATING_SOURCE,
  DEFAULT_RATING_PRESENTATION,
  normalizeAggregateAccentBarOffset,
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
  DEFAULT_POSTER_EDGE_OFFSET,
  normalizePosterEdgeOffset,
} from './posterEdgeOffset.ts';
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
  DEFAULT_BADGE_SCALE_PERCENT,
  normalizeBadgeScalePercent,
  normalizeGenreBadgeScalePercent,
  normalizeHexColor,
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
  DEFAULT_BLOCKBUSTER_DENSITY,
  DEFAULT_POSTER_IMAGE_SIZE,
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
  normalizeBlockbusterDensity,
  normalizeBooleanSearchFlag,
  normalizeEpisodeArtworkMode,
  normalizeOptionalBadgeCount,
  normalizePosterImageSize,
  normalizeRpdbFontScalePercent,
  resolveRpdbRatingBarPositionAliases,
  toAnimeMappingProvider,
  type AnimeMappingProvider,
  type ArtworkSource,
  type BadgeKey,
  type BlockbusterDensity,
  type EpisodeArtworkMode,
  type LogoBackground,
  type PosterImageSize,
  type PosterQualityBadgesPosition,
  type PosterTextPreference,
  type QualityBadgesSide,
} from './imageRouteConfig.ts';
import {
  getDeterministicTtlMs,
  HttpError,
  sha1Hex,
} from './imageRouteRuntime.ts';
import { pickOutputFormat, type OutputFormat } from './imageRouteMedia.ts';
import {
  normalizeLogoBackground,
  normalizePosterQualityBadgesPosition,
  normalizeQualityBadgesSide,
  normalizeQualityBadgesStyle,
  normalizeStreamBadgesSetting,
} from './imageRouteDisplayPrefs.ts';

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
  qualityBadgesStyle: QualityBadgeStyle;
  qualityBadgesMax: number | null;
  qualityBadgePreferences: BadgeKey[];
  ratingStyle: RatingStyle;
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
  ratingPresentation: RatingPresentation;
  aggregateRatingSource: AggregateRatingSource;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string | null;
  aggregateCriticsAccentColor: string | null;
  aggregateAudienceAccentColor: string | null;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  blockbusterDensity: BlockbusterDensity;
  hasExplicitRatingOrder: boolean;
  shouldApplyRatings: boolean;
  shouldApplyStreamBadges: boolean;
  shouldRenderLogoBackground: boolean;
  shouldCacheFinalImage: boolean;
  posterImageSize: PosterImageSize;
  posterArtworkSource: ArtworkSource;
  backdropArtworkSource: ArtworkSource;
  logoArtworkSource: ArtworkSource;
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
  const logoGenreBadgeScale = normalizeGenreBadgeScalePercent(
    searchParams.get('logoGenreBadgeScale') ?? searchParams.get('genreBadgeScale'),
    globalGenreBadgeScale,
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
  const logoGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    searchParams.get('logoGenreBadgeAnimeGrouping') ?? searchParams.get('genreBadgeAnimeGrouping'),
    globalGenreBadgeAnimeGrouping,
  );
  const genreBadgeMode =
    imageType === 'poster'
      ? posterGenreBadgeMode
      : imageType === 'backdrop'
        ? backdropGenreBadgeMode
        : logoGenreBadgeMode;
  const genreBadgeStyle =
    imageType === 'poster'
      ? posterGenreBadgeStyle
      : imageType === 'backdrop'
        ? backdropGenreBadgeStyle
        : logoGenreBadgeStyle;
  const genreBadgePosition =
    imageType === 'poster'
      ? posterGenreBadgePosition
      : imageType === 'backdrop'
        ? backdropGenreBadgePosition
        : logoGenreBadgePosition;
  const genreBadgeScale =
    imageType === 'poster'
      ? posterGenreBadgeScale
      : imageType === 'backdrop'
        ? backdropGenreBadgeScale
        : logoGenreBadgeScale;
  const genreBadgeAnimeGrouping =
    imageType === 'poster'
      ? posterGenreBadgeAnimeGrouping
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
  const logoAggregateRatingSource = normalizeAggregateRatingSource(
    searchParams.get('logoAggregateRatingSource') ?? searchParams.get('aggregateRatingSource'),
    globalAggregateRatingSource,
  );
  const aggregateAccentMode = normalizeAggregateAccentMode(
    searchParams.get('aggregateAccentMode'),
    DEFAULT_AGGREGATE_ACCENT_MODE,
  );
  const aggregateAccentColor = normalizeHexColor(searchParams.get('aggregateAccentColor')) || null;
  const aggregateCriticsAccentColor =
    normalizeHexColor(searchParams.get('aggregateCriticsAccentColor')) || null;
  const aggregateAudienceAccentColor =
    normalizeHexColor(searchParams.get('aggregateAudienceAccentColor')) || null;
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
  const imageTextParam = searchParams.get('imageText') || searchParams.get('posterText');
  const rpdbPosterTypeParam = searchParams.get('posterType');
  const hasTextlessPosterType =
    typeof rpdbPosterTypeParam === 'string' &&
    (rpdbPosterTypeParam.trim().toLowerCase().startsWith('textless-') ||
      rpdbPosterTypeParam.trim().toLowerCase() === 'textless-order');
  const explicitTextlessFlag = normalizeBooleanSearchFlag(searchParams.get('textless'));
  const textlessEnabled =
    explicitTextlessFlag === null ? hasTextlessPosterType : explicitTextlessFlag;
  const imageText =
    imageTextParam ||
    (imageType === 'backdrop' ? 'clean' : textlessEnabled ? 'clean' : 'original');
  const posterImageSize = normalizePosterImageSize(
    searchParams.get('posterImageSize') ??
      searchParams.get('posterSize') ??
      (imageType === 'poster' ? searchParams.get('imageSize') : null),
    DEFAULT_POSTER_IMAGE_SIZE,
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
  const backdropBottomRatingsRow =
    normalizeBooleanSearchFlag(searchParams.get('backdropBottomRatingsRow')) === true;
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
  const backdropSideRatingsOffset = normalizeSideRatingOffset(
    searchParams.get('backdropSideRatingsOffset') ?? searchParams.get('sideRatingsOffset'),
    DEFAULT_SIDE_RATING_OFFSET,
  );
  const sideRatingsPosition =
    imageType === 'backdrop' ? backdropSideRatingsPosition : posterSideRatingsPosition;
  const sideRatingsOffset =
    imageType === 'backdrop' ? backdropSideRatingsOffset : posterSideRatingsOffset;
  const globalStreamBadgesSetting = normalizeStreamBadgesSetting(searchParams.get('streamBadges'));
  const posterStreamBadgesSetting = normalizeStreamBadgesSetting(
    searchParams.get('posterStreamBadges') || searchParams.get('streamBadges'),
  );
  const backdropStreamBadgesSetting = normalizeStreamBadgesSetting(
    searchParams.get('backdropStreamBadges') || searchParams.get('streamBadges'),
  );
  const streamBadgesSetting =
    imageType === 'poster'
      ? posterStreamBadgesSetting
      : imageType === 'backdrop'
        ? backdropStreamBadgesSetting
        : globalStreamBadgesSetting;
  const qualityBadgesSide = normalizeQualityBadgesSide(
    searchParams.get('qualityBadgesSide') || searchParams.get('qualityBadgesPosition'),
  );
  const posterQualityBadgesPosition = normalizePosterQualityBadgesPosition(
    searchParams.get('posterQualityBadgesPosition'),
  );
  const posterQualityBadgePreferences = parseQualityBadgePreferencesAllowEmpty(
    searchParams.get('posterQualityBadges'),
  );
  const backdropQualityBadgePreferences = parseQualityBadgePreferencesAllowEmpty(
    searchParams.get('backdropQualityBadges'),
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
  const posterQualityBadgesMax = normalizeOptionalBadgeCount(
    searchParams.get('posterQualityBadgesMax'),
  );
  const backdropQualityBadgesMax = normalizeOptionalBadgeCount(
    searchParams.get('backdropQualityBadgesMax'),
  );
  const posterRatingsMax = normalizeOptionalBadgeCount(searchParams.get('posterRatingsMax'));
  const backdropRatingsMax = normalizeOptionalBadgeCount(searchParams.get('backdropRatingsMax'));
  const qualityBadgesStyle =
    imageType === 'poster'
      ? posterQualityBadgesStyle
      : imageType === 'backdrop'
        ? backdropQualityBadgesStyle
        : globalQualityBadgesStyle;
  const qualityBadgesMax =
    imageType === 'poster'
      ? posterQualityBadgesMax
      : imageType === 'backdrop'
        ? backdropQualityBadgesMax
        : null;
  const qualityBadgePreferences =
    imageType === 'poster'
      ? posterQualityBadgePreferences
      : imageType === 'backdrop'
        ? backdropQualityBadgePreferences
        : [];
  const typeRatingStyleParam =
    imageType === 'poster'
      ? searchParams.get('posterRatingStyle') ?? searchParams.get('posterRatingsStyle')
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
  const logoRatingBadgeScale = normalizeBadgeScalePercent(
    searchParams.get('logoRatingBadgeScale') ?? rpdbFontScalePercent,
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const posterQualityBadgeScale = normalizeBadgeScalePercent(
    searchParams.get('posterQualityBadgeScale'),
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const backdropQualityBadgeScale = normalizeBadgeScalePercent(
    searchParams.get('backdropQualityBadgeScale'),
    DEFAULT_BADGE_SCALE_PERCENT,
  );
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
  const backdropUsesFanartArtwork = FANART_ARTWORK_SOURCE_SET.has(backdropArtworkSource);
  const logoUsesFanartArtwork = FANART_ARTWORK_SOURCE_SET.has(logoArtworkSource);
  const hasRandomArtworkSelection =
    posterTextPreference === 'random' ||
    posterArtworkSource === 'random' ||
    backdropArtworkSource === 'random' ||
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
    posterImageSize,
    posterArtworkSource,
    backdropArtworkSource,
    logoArtworkSource,
    thumbnailEpisodeArtwork,
    backdropEpisodeArtwork,
    posterRatingsLayout,
    posterRatingsMaxPerSide,
    posterRatingsMax,
    posterEdgeOffset,
    backdropRatingsLayout,
    backdropRatingsMax,
    backdropBottomRatingsRow,
    logoRatingsMax,
    logoBottomRatingsRow,
    qualityBadgesSide,
    posterQualityBadgesPosition,
    qualityBadgesStyle,
    qualityBadgesMax,
    qualityBadgePreferences,
    posterSideRatingsPosition,
    posterSideRatingsOffset,
    backdropSideRatingsPosition,
    backdropSideRatingsOffset,
    ratingPresentation,
    blockbusterDensity,
    aggregateRatingSource,
    aggregateAccentMode,
    aggregateAccentColor,
    aggregateCriticsAccentColor,
    aggregateAudienceAccentColor,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    artworkSelectionSeed,
    ratingStyle,
    ratingValueMode,
    posterRatingBadgeScale,
    backdropRatingBadgeScale,
    logoRatingBadgeScale,
    posterQualityBadgeScale,
    backdropQualityBadgeScale,
    genreBadgeMode,
    genreBadgeStyle,
    genreBadgePosition,
    genreBadgeScale,
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
    effectiveGenreBadgeScale,
    genreBadgeAnimeGrouping,
    posterRatingsLayout,
    posterRatingsMaxPerSide,
    posterRatingsMax,
    posterEdgeOffset,
    backdropRatingsLayout,
    backdropRatingsMax,
    backdropBottomRatingsRow,
    logoRatingsMax,
    logoBottomRatingsRow,
    posterSideRatingsPosition,
    posterSideRatingsOffset,
    backdropSideRatingsPosition,
    backdropSideRatingsOffset,
    sideRatingsPosition,
    sideRatingsOffset,
    qualityBadgesSide,
    posterQualityBadgesPosition,
    qualityBadgesStyle,
    qualityBadgesMax,
    qualityBadgePreferences,
    ratingStyle,
    logoBackground,
    providerAppearanceOverrides,
    posterRatingBadgeScale,
    backdropRatingBadgeScale,
    logoRatingBadgeScale,
    posterQualityBadgeScale,
    backdropQualityBadgeScale,
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
    ratingPresentation,
    aggregateRatingSource,
    aggregateAccentMode,
    aggregateAccentColor,
    aggregateCriticsAccentColor,
    aggregateAudienceAccentColor,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    blockbusterDensity,
    hasExplicitRatingOrder,
    shouldApplyRatings,
    shouldApplyStreamBadges,
    shouldRenderLogoBackground,
    shouldCacheFinalImage,
    posterImageSize,
    posterArtworkSource,
    backdropArtworkSource,
    logoArtworkSource,
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
