import {
  DEFAULT_BACKDROP_RATING_LAYOUT,
  normalizeBackdropRatingLayout,
  type BackdropRatingLayout,
} from './backdropLayoutOptions.ts';
import {
  DEFAULT_POSTER_RATINGS_MAX_PER_SIDE,
  POSTER_RATINGS_MAX_PER_SIDE_MIN,
  isVerticalPosterRatingLayout,
  normalizePosterRatingLayout,
  normalizePosterRatingsMaxPerSide,
  type PosterRatingLayout,
} from './posterLayoutOptions.ts';
import {
  DEFAULT_QUALITY_BADGES_STYLE,
  DEFAULT_RATING_STYLE,
  normalizeQualityBadgeStyle,
  normalizeRatingStyle,
  type QualityBadgeStyle,
  type RatingStyle,
} from './ratingAppearance.ts';
import {
  AGGREGATE_RATING_SOURCE_ACCENTS,
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  DEFAULT_AGGREGATE_ACCENT_COLOR,
  DEFAULT_AGGREGATE_ACCENT_MODE,
  DEFAULT_AGGREGATE_RATING_SOURCE,
  DEFAULT_RATING_PRESENTATION,
  normalizeAggregateAccentBarOffset,
  normalizeAggregateAccentMode,
  normalizeAggregateRatingSource,
  normalizeRatingPresentation,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from './ratingPresentation.ts';
import {
  normalizeRatingPreference,
  stringifyRatingPreferencesAllowEmpty,
  type RatingPreference,
  ALL_RATING_PREFERENCES,
} from './ratingProviderCatalog.ts';
import {
  DEFAULT_RATING_VALUE_MODE,
  normalizeRatingValueMode,
  type RatingValueMode,
} from './ratingDisplay.ts';
import {
  DEFAULT_METADATA_TRANSLATION_MODE,
  normalizeMetadataTranslationMode,
  type MetadataTranslationMode,
} from './metadataTranslation.ts';
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
import {
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_QUALITY_BADGE_PREFERENCES,
  encodeRatingProviderAppearanceOverrides,
  normalizeBadgeScalePercent,
  normalizeGenreBadgeScalePercent,
  normalizeHexColor,
  normalizeQualityBadgePreferencesList,
  normalizeRatingProviderAppearanceOverrides,
  stringifyQualityBadgePreferencesAllowEmpty,
  type RatingProviderAppearanceOverrides,
} from './badgeCustomization.ts';
import type { MediaFeatureBadgeKey } from './mediaFeatures.ts';
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
  buildEpisodePatternBaseId,
  DEFAULT_EPISODE_ID_MODE,
  filterThumbnailRatingPreferences,
  normalizeEpisodeIdMode,
  type EpisodeIdMode,
} from './episodeIdentity.ts';
import {
  encodeProxyCatalogRules,
  normalizeProxyCatalogRules,
  type ProxyCatalogRule,
} from './proxyCatalogRules.ts';
export type StreamBadgesSetting = 'auto' | 'on' | 'off';
export type QualityBadgesSide = 'left' | 'right';
export type PosterQualityBadgesPosition = 'auto' | QualityBadgesSide;
export type PosterImageSize = 'normal' | 'large' | '4k';
export type PosterImageTextPreference = 'original' | 'clean' | 'alternative' | 'random';
export type BackdropImageTextPreference = 'original' | 'clean' | 'alternative' | 'random';
export type ArtworkSource = 'tmdb' | 'fanart' | 'cinemeta' | 'omdb' | 'random';
export type EpisodeArtworkMode = 'still' | 'series';
export type LogoBackground = 'transparent' | 'dark';
export type TmdbIdScopeMode = 'soft' | 'strict';
type XrdbImageType = 'poster' | 'backdrop' | 'logo';
export type AiometadataUrlPatterns = {
  posterUrlPattern: string;
  backgroundUrlPattern: string;
  logoUrlPattern: string;
  episodeThumbnailUrlPattern: string;
};
export type AiometadataPosterIdMode = 'auto' | 'tmdb' | 'imdb';
export type AiometadataEpisodeIdMode = EpisodeIdMode;

export type SharedXrdbSettings = {
  xrdbKey: string;
  tmdbKey: string;
  mdblistKey: string;
  fanartKey: string;
  simklClientId: string;
  tmdbIdScope: TmdbIdScopeMode;
  lang: string;
  posterImageSize: PosterImageSize;
  posterImageText: PosterImageTextPreference;
  backdropImageText: BackdropImageTextPreference;
  thumbnailImageText: BackdropImageTextPreference;
  posterArtworkSource: ArtworkSource;
  backdropArtworkSource: ArtworkSource;
  thumbnailArtworkSource: ArtworkSource;
  logoArtworkSource: ArtworkSource;
  thumbnailEpisodeArtwork: EpisodeArtworkMode;
  backdropEpisodeArtwork: EpisodeArtworkMode;
  ratingValueMode: RatingValueMode;
  posterGenreBadgeMode: GenreBadgeMode;
  backdropGenreBadgeMode: GenreBadgeMode;
  thumbnailGenreBadgeMode: GenreBadgeMode;
  logoGenreBadgeMode: GenreBadgeMode;
  posterGenreBadgeStyle: GenreBadgeStyle;
  backdropGenreBadgeStyle: GenreBadgeStyle;
  thumbnailGenreBadgeStyle: GenreBadgeStyle;
  logoGenreBadgeStyle: GenreBadgeStyle;
  posterGenreBadgePosition: GenreBadgePosition;
  backdropGenreBadgePosition: GenreBadgePosition;
  thumbnailGenreBadgePosition: GenreBadgePosition;
  logoGenreBadgePosition: GenreBadgePosition;
  posterGenreBadgeScale: number;
  backdropGenreBadgeScale: number;
  thumbnailGenreBadgeScale: number;
  logoGenreBadgeScale: number;
  posterGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  backdropGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  thumbnailGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  logoGenreBadgeAnimeGrouping: GenreBadgeAnimeGrouping;
  posterRatingPreferences: RatingPreference[];
  backdropRatingPreferences: RatingPreference[];
  thumbnailRatingPreferences: RatingPreference[];
  logoRatingPreferences: RatingPreference[];
  posterStreamBadges: StreamBadgesSetting;
  backdropStreamBadges: StreamBadgesSetting;
  thumbnailStreamBadges: StreamBadgesSetting;
  qualityBadgesSide: QualityBadgesSide;
  posterQualityBadgesPosition: PosterQualityBadgesPosition;
  posterQualityBadgePreferences: MediaFeatureBadgeKey[];
  backdropQualityBadgePreferences: MediaFeatureBadgeKey[];
  thumbnailQualityBadgePreferences: MediaFeatureBadgeKey[];
  logoQualityBadgePreferences: MediaFeatureBadgeKey[];
  posterQualityBadgesStyle: QualityBadgeStyle;
  backdropQualityBadgesStyle: QualityBadgeStyle;
  thumbnailQualityBadgesStyle: QualityBadgeStyle;
  logoQualityBadgesStyle: QualityBadgeStyle;
  posterQualityBadgesMax: number | null;
  backdropQualityBadgesMax: number | null;
  thumbnailQualityBadgesMax: number | null;
  logoQualityBadgesMax: number | null;
  posterRatingsLayout: PosterRatingLayout;
  backdropRatingsLayout: BackdropRatingLayout;
  thumbnailRatingsLayout: BackdropRatingLayout;
  posterRatingsMax: number | null;
  backdropRatingsMax: number | null;
  thumbnailRatingsMax: number | null;
  backdropBottomRatingsRow: boolean;
  thumbnailBottomRatingsRow: boolean;
  posterRatingStyle: RatingStyle;
  backdropRatingStyle: RatingStyle;
  thumbnailRatingStyle: RatingStyle;
  logoRatingStyle: RatingStyle;
  posterRatingBadgeScale: number;
  backdropRatingBadgeScale: number;
  thumbnailRatingBadgeScale: number;
  logoRatingBadgeScale: number;
  posterQualityBadgeScale: number;
  backdropQualityBadgeScale: number;
  thumbnailQualityBadgeScale: number;
  logoQualityBadgeScale: number;
  posterRatingPresentation: RatingPresentation;
  backdropRatingPresentation: RatingPresentation;
  thumbnailRatingPresentation: RatingPresentation;
  logoRatingPresentation: RatingPresentation;
  posterAggregateRatingSource: AggregateRatingSource;
  backdropAggregateRatingSource: AggregateRatingSource;
  thumbnailAggregateRatingSource: AggregateRatingSource;
  logoAggregateRatingSource: AggregateRatingSource;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string;
  aggregateCriticsAccentColor: string;
  aggregateAudienceAccentColor: string;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  posterRatingsMaxPerSide: number | null;
  posterEdgeOffset: number;
  posterSideRatingsPosition: SideRatingPosition;
  posterSideRatingsOffset: number;
  backdropSideRatingsPosition: SideRatingPosition;
  backdropSideRatingsOffset: number;
  thumbnailSideRatingsPosition: SideRatingPosition;
  thumbnailSideRatingsOffset: number;
  sideRatingsPosition: SideRatingPosition;
  sideRatingsOffset: number;
  logoRatingsMax: number | null;
  logoBackground: LogoBackground;
  logoBottomRatingsRow: boolean;
  ratingProviderAppearanceOverrides: RatingProviderAppearanceOverrides;
};

export type SavedUiConfig = {
  version: 1;
  settings: SharedXrdbSettings;
  proxy: SavedProxySettings;
};

export type SavedProxySettings = {
  manifestUrl: string;
  translateMeta: boolean;
  translateMetaMode: MetadataTranslationMode;
  debugMetaTranslation: boolean;
  episodeIdMode: EpisodeIdMode;
  catalogRules: ProxyCatalogRule[];
};

const DEFAULT_RATING_PREFERENCES: RatingPreference[] = [...ALL_RATING_PREFERENCES];
const POSTER_IMAGE_SIZE_SET = new Set<PosterImageSize>(['normal', 'large', '4k']);
const POSTER_IMAGE_TEXT_PREFERENCE_SET = new Set<PosterImageTextPreference>([
  'original',
  'clean',
  'alternative',
  'random',
]);
const BACKDROP_IMAGE_TEXT_PREFERENCE_SET = new Set<BackdropImageTextPreference>([
  'original',
  'clean',
  'alternative',
  'random',
]);
const POSTER_ARTWORK_SOURCE_SET = new Set<ArtworkSource>(['tmdb', 'fanart', 'cinemeta', 'omdb', 'random']);
const NON_POSTER_ARTWORK_SOURCE_SET = new Set<ArtworkSource>(['tmdb', 'fanart', 'cinemeta', 'random']);
const EPISODE_ARTWORK_MODE_SET = new Set<EpisodeArtworkMode>(['still', 'series']);
const STREAM_BADGES_SETTING_SET = new Set<StreamBadgesSetting>(['auto', 'on', 'off']);
const QUALITY_BADGES_SIDE_SET = new Set<QualityBadgesSide>(['left', 'right']);
const POSTER_QUALITY_BADGES_POSITION_SET = new Set<PosterQualityBadgesPosition>(['auto', 'left', 'right']);
const LOGO_BACKGROUND_SET = new Set<LogoBackground>(['transparent', 'dark']);
const TMDB_ID_SCOPE_MODE_SET = new Set<TmdbIdScopeMode>(['soft', 'strict']);

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const normalizeEpisodeArtworkMode = (
  value: unknown,
  fallback: EpisodeArtworkMode,
): EpisodeArtworkMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return EPISODE_ARTWORK_MODE_SET.has(normalized as EpisodeArtworkMode)
    ? (normalized as EpisodeArtworkMode)
    : fallback;
};

export const createDefaultSharedXrdbSettings = (): SharedXrdbSettings => ({
  xrdbKey: '',
  tmdbKey: '',
  mdblistKey: '',
  fanartKey: '',
  simklClientId: '',
  tmdbIdScope: 'soft',
  lang: 'en',
  posterImageSize: 'normal',
  posterImageText: 'clean',
  backdropImageText: 'clean',
  thumbnailImageText: 'clean',
  posterArtworkSource: 'tmdb',
  backdropArtworkSource: 'tmdb',
  thumbnailArtworkSource: 'tmdb',
  logoArtworkSource: 'tmdb',
  thumbnailEpisodeArtwork: 'still',
  backdropEpisodeArtwork: 'series',
  ratingValueMode: DEFAULT_RATING_VALUE_MODE,
  posterGenreBadgeMode: DEFAULT_GENRE_BADGE_MODE,
  backdropGenreBadgeMode: DEFAULT_GENRE_BADGE_MODE,
  thumbnailGenreBadgeMode: DEFAULT_GENRE_BADGE_MODE,
  logoGenreBadgeMode: DEFAULT_GENRE_BADGE_MODE,
  posterGenreBadgeStyle: DEFAULT_GENRE_BADGE_STYLE,
  backdropGenreBadgeStyle: DEFAULT_GENRE_BADGE_STYLE,
  thumbnailGenreBadgeStyle: DEFAULT_GENRE_BADGE_STYLE,
  logoGenreBadgeStyle: DEFAULT_GENRE_BADGE_STYLE,
  posterGenreBadgePosition: DEFAULT_GENRE_BADGE_POSITION,
  backdropGenreBadgePosition: DEFAULT_GENRE_BADGE_POSITION,
  thumbnailGenreBadgePosition: DEFAULT_GENRE_BADGE_POSITION,
  logoGenreBadgePosition: DEFAULT_GENRE_BADGE_POSITION,
  posterGenreBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  backdropGenreBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  thumbnailGenreBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  logoGenreBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  posterGenreBadgeAnimeGrouping: DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  backdropGenreBadgeAnimeGrouping: DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  thumbnailGenreBadgeAnimeGrouping: DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  logoGenreBadgeAnimeGrouping: DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  posterRatingPreferences: [...DEFAULT_RATING_PREFERENCES],
  backdropRatingPreferences: [...DEFAULT_RATING_PREFERENCES],
  thumbnailRatingPreferences: filterThumbnailRatingPreferences(DEFAULT_RATING_PREFERENCES),
  logoRatingPreferences: [...DEFAULT_RATING_PREFERENCES],
  posterStreamBadges: 'auto',
  backdropStreamBadges: 'auto',
  thumbnailStreamBadges: 'auto',
  qualityBadgesSide: 'left',
  posterQualityBadgesPosition: 'auto',
  posterQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
  backdropQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
  thumbnailQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
  logoQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
  posterQualityBadgesStyle: DEFAULT_QUALITY_BADGES_STYLE,
  backdropQualityBadgesStyle: DEFAULT_QUALITY_BADGES_STYLE,
  thumbnailQualityBadgesStyle: DEFAULT_QUALITY_BADGES_STYLE,
  logoQualityBadgesStyle: DEFAULT_QUALITY_BADGES_STYLE,
  posterQualityBadgesMax: null,
  backdropQualityBadgesMax: null,
  thumbnailQualityBadgesMax: null,
  logoQualityBadgesMax: null,
  posterRatingsLayout: 'bottom',
  backdropRatingsLayout: DEFAULT_BACKDROP_RATING_LAYOUT,
  thumbnailRatingsLayout: DEFAULT_BACKDROP_RATING_LAYOUT,
  posterRatingsMax: null,
  backdropRatingsMax: null,
  thumbnailRatingsMax: null,
  backdropBottomRatingsRow: false,
  thumbnailBottomRatingsRow: false,
  posterRatingStyle: DEFAULT_RATING_STYLE,
  backdropRatingStyle: DEFAULT_RATING_STYLE,
  thumbnailRatingStyle: DEFAULT_RATING_STYLE,
  logoRatingStyle: 'plain',
  posterRatingBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  backdropRatingBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  thumbnailRatingBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  logoRatingBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  posterQualityBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  backdropQualityBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  thumbnailQualityBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  logoQualityBadgeScale: DEFAULT_BADGE_SCALE_PERCENT,
  posterRatingPresentation: DEFAULT_RATING_PRESENTATION,
  backdropRatingPresentation: DEFAULT_RATING_PRESENTATION,
  thumbnailRatingPresentation: DEFAULT_RATING_PRESENTATION,
  logoRatingPresentation: DEFAULT_RATING_PRESENTATION,
  posterAggregateRatingSource: DEFAULT_AGGREGATE_RATING_SOURCE,
  backdropAggregateRatingSource: DEFAULT_AGGREGATE_RATING_SOURCE,
  thumbnailAggregateRatingSource: DEFAULT_AGGREGATE_RATING_SOURCE,
  logoAggregateRatingSource: DEFAULT_AGGREGATE_RATING_SOURCE,
  aggregateAccentMode: DEFAULT_AGGREGATE_ACCENT_MODE,
  aggregateAccentColor: DEFAULT_AGGREGATE_ACCENT_COLOR,
  aggregateCriticsAccentColor: AGGREGATE_RATING_SOURCE_ACCENTS.critics,
  aggregateAudienceAccentColor: AGGREGATE_RATING_SOURCE_ACCENTS.audience,
  aggregateAccentBarOffset: DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  aggregateAccentBarVisible: true,
  posterRatingsMaxPerSide: DEFAULT_POSTER_RATINGS_MAX_PER_SIDE,
  posterEdgeOffset: DEFAULT_POSTER_EDGE_OFFSET,
  posterSideRatingsPosition: DEFAULT_SIDE_RATING_POSITION,
  posterSideRatingsOffset: DEFAULT_SIDE_RATING_OFFSET,
  backdropSideRatingsPosition: DEFAULT_SIDE_RATING_POSITION,
  backdropSideRatingsOffset: DEFAULT_SIDE_RATING_OFFSET,
  thumbnailSideRatingsPosition: DEFAULT_SIDE_RATING_POSITION,
  thumbnailSideRatingsOffset: DEFAULT_SIDE_RATING_OFFSET,
  sideRatingsPosition: DEFAULT_SIDE_RATING_POSITION,
  sideRatingsOffset: DEFAULT_SIDE_RATING_OFFSET,
  logoRatingsMax: null,
  logoBackground: 'transparent',
  logoBottomRatingsRow: false,
  ratingProviderAppearanceOverrides: {},
});

export const createDefaultSavedUiConfig = (): SavedUiConfig => ({
  version: 1,
  settings: createDefaultSharedXrdbSettings(),
  proxy: {
    manifestUrl: '',
    translateMeta: false,
    translateMetaMode: DEFAULT_METADATA_TRANSLATION_MODE,
    debugMetaTranslation: false,
    episodeIdMode: DEFAULT_EPISODE_ID_MODE,
    catalogRules: [],
  },
});

export const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');

export const normalizeManifestUrl = (value: string, allowBareScheme = false) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith('stremio://')) {
    return trimmed;
  }

  const withoutScheme = trimmed.slice('stremio://'.length);
  if (!withoutScheme) return allowBareScheme ? 'https://' : '';
  if (/^https?:\/\//i.test(withoutScheme)) {
    return withoutScheme;
  }
  return `https://${withoutScheme}`;
};

export const isBareHttpUrl = (value: string) => value === 'http://' || value === 'https://';

export const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64url');
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const decodeBase64Url = (value: string) => {
  if (typeof window === 'undefined' && typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
  return new TextDecoder().decode(
    Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)),
  );
};

const normalizePosterImageTextPreference = (
  value: unknown,
  fallback: PosterImageTextPreference,
): PosterImageTextPreference => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return POSTER_IMAGE_TEXT_PREFERENCE_SET.has(normalized as PosterImageTextPreference)
    ? (normalized as PosterImageTextPreference)
    : fallback;
};

const normalizePosterImageSize = (
  value: unknown,
  fallback: PosterImageSize,
): PosterImageSize => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return fallback;
  if (normalized === 'default') return fallback;
  if (normalized === 'standard') return 'normal';
  if (normalized === 'verylarge') return '4k';
  if (normalized === 'uhd' || normalized === 'ultra' || normalized === '4k-slow' || normalized === '4kslow') {
    return '4k';
  }
  return POSTER_IMAGE_SIZE_SET.has(normalized as PosterImageSize)
    ? (normalized as PosterImageSize)
    : fallback;
};

type RpdbRatingBarPosition =
  | 'bottom'
  | 'top'
  | 'right-bottom'
  | 'right-center'
  | 'right-top'
  | 'left-bottom'
  | 'left-center'
  | 'left-top';
const normalizeRpdbRatingBarPosition = (value: unknown): RpdbRatingBarPosition | null => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return null;
  if (normalized === 'default') return 'bottom';
  if (normalized === 'center') return 'right-center';
  if (normalized === 'bottom') return 'bottom';
  if (
    normalized === 'top' ||
    normalized === 'right-bottom' ||
    normalized === 'right-center' ||
    normalized === 'right-top' ||
    normalized === 'left-bottom' ||
    normalized === 'left-center' ||
    normalized === 'left-top'
  ) {
    return normalized as RpdbRatingBarPosition;
  }
  return null;
};
const resolveRpdbRatingBarPositionAliases = (
  value: unknown,
): {
  posterRatingsLayout?: PosterRatingLayout;
  backdropRatingsLayout?: BackdropRatingLayout;
  sideRatingsPosition?: SideRatingPosition;
} => {
  const position = normalizeRpdbRatingBarPosition(value);
  if (!position) return {};
  if (position === 'bottom') {
    return {
      posterRatingsLayout: 'bottom',
    };
  }
  if (position === 'top') {
    return {
      posterRatingsLayout: 'top',
    };
  }
  const [layoutSide, verticalAnchor] = position.split('-') as [
    'left' | 'right',
    'bottom' | 'center' | 'top',
  ];
  const sideRatingsPosition =
    verticalAnchor === 'center'
      ? 'middle'
      : (verticalAnchor as Extract<SideRatingPosition, 'top' | 'bottom'>);
  return {
    posterRatingsLayout: layoutSide,
    backdropRatingsLayout: layoutSide === 'right' ? 'right-vertical' : undefined,
    sideRatingsPosition,
  };
};

const normalizeRpdbFontScalePercent = (value: unknown): number | null => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized || normalized === 'default') return null;
  const parsed = Number(normalized.replace('%', ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const percentValue = normalized.includes('%') || parsed > 3 ? parsed : parsed * 100;
  return Math.round(percentValue);
};

const normalizeBackdropImageTextPreference = (
  value: unknown,
  fallback: BackdropImageTextPreference,
): BackdropImageTextPreference => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return BACKDROP_IMAGE_TEXT_PREFERENCE_SET.has(normalized as BackdropImageTextPreference)
    ? (normalized as BackdropImageTextPreference)
    : fallback;
};

const normalizePosterArtworkSource = (
  value: unknown,
  fallback: ArtworkSource,
): ArtworkSource => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return POSTER_ARTWORK_SOURCE_SET.has(normalized as ArtworkSource)
    ? (normalized as ArtworkSource)
    : fallback;
};

const normalizeNonPosterArtworkSource = (
  value: unknown,
  fallback: ArtworkSource,
): ArtworkSource => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return NON_POSTER_ARTWORK_SOURCE_SET.has(normalized as ArtworkSource)
    ? (normalized as ArtworkSource)
    : fallback;
};

const normalizeStreamBadgesSetting = (
  value: unknown,
  fallback: StreamBadgesSetting,
): StreamBadgesSetting => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return STREAM_BADGES_SETTING_SET.has(normalized as StreamBadgesSetting)
    ? (normalized as StreamBadgesSetting)
    : fallback;
};

const normalizeQualityBadgesSide = (
  value: unknown,
  fallback: QualityBadgesSide,
): QualityBadgesSide => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return QUALITY_BADGES_SIDE_SET.has(normalized as QualityBadgesSide)
    ? (normalized as QualityBadgesSide)
    : fallback;
};

const normalizePosterQualityBadgesPosition = (
  value: unknown,
  fallback: PosterQualityBadgesPosition,
): PosterQualityBadgesPosition => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return POSTER_QUALITY_BADGES_POSITION_SET.has(normalized as PosterQualityBadgesPosition)
    ? (normalized as PosterQualityBadgesPosition)
    : fallback;
};

const normalizeRatingPreferencesList = (
  value: unknown,
  fallback: RatingPreference[],
): RatingPreference[] => {
  if (typeof value === 'string') {
    const parsed = value
      .split(',')
      .map((item) => normalizeRatingPreference(item))
      .filter((item): item is RatingPreference => item !== null);
    return [...new Set(parsed)];
  }

  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value
    .map((item) => (typeof item === 'string' ? normalizeRatingPreference(item) : null))
    .filter((item): item is RatingPreference => item !== null);

  return [...new Set(normalized)];
};

const normalizeOptionalBadgeCount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return null;
  const normalized = Math.trunc(numericValue);
  if (normalized < POSTER_RATINGS_MAX_PER_SIDE_MIN) return null;
  return normalized;
};

const normalizeLogoBackground = (
  value: unknown,
  fallback: LogoBackground,
): LogoBackground => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return LOGO_BACKGROUND_SET.has(normalized as LogoBackground)
    ? (normalized as LogoBackground)
    : fallback;
};

const normalizeTmdbIdScopeMode = (
  value: unknown,
  fallback: TmdbIdScopeMode,
): TmdbIdScopeMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return TMDB_ID_SCOPE_MODE_SET.has(normalized as TmdbIdScopeMode)
    ? (normalized as TmdbIdScopeMode)
    : fallback;
};

export const normalizeSharedXrdbSettings = (value: unknown): SharedXrdbSettings => {
  const defaults = createDefaultSharedXrdbSettings();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const candidate = value as Partial<Record<keyof SharedXrdbSettings, unknown>> & Record<string, unknown>;
  const rawPosterImageText =
    typeof candidate.posterImageText === 'string' ? candidate.posterImageText.trim().toLowerCase() : '';
  const rawBackdropImageText =
    typeof candidate.backdropImageText === 'string' ? candidate.backdropImageText.trim().toLowerCase() : '';
  const legacyFanartPosterMode = rawPosterImageText === 'fanartclean';
  const legacyFanartBackdropMode = rawBackdropImageText === 'fanartclean';
  const posterImageText = legacyFanartPosterMode
    ? 'clean'
    : normalizePosterImageTextPreference(candidate.posterImageText, defaults.posterImageText);
  const backdropImageText = legacyFanartBackdropMode
    ? 'clean'
    : normalizeBackdropImageTextPreference(candidate.backdropImageText, defaults.backdropImageText);
  const thumbnailImageText = normalizeBackdropImageTextPreference(
    candidate.thumbnailImageText ?? candidate.backdropImageText,
    defaults.thumbnailImageText,
  );
  const posterArtworkSource = legacyFanartPosterMode
    ? 'fanart'
    : normalizePosterArtworkSource(
        candidate.posterArtworkSource ?? candidate.posterCleanSource,
        defaults.posterArtworkSource
      );
  const backdropArtworkSource = legacyFanartBackdropMode
    ? 'fanart'
    : normalizeNonPosterArtworkSource(
        candidate.backdropArtworkSource ?? candidate.backdropCleanSource,
        defaults.backdropArtworkSource
      );
  const thumbnailArtworkSource = normalizeNonPosterArtworkSource(
    candidate.thumbnailArtworkSource ??
      candidate.backdropArtworkSource ??
      candidate.backdropCleanSource,
    defaults.thumbnailArtworkSource,
  );
  const rpdbRatingBarAliases = resolveRpdbRatingBarPositionAliases(candidate.ratingBarPos);
  const sharedRatingsInput = candidate.ratings ?? candidate.order;
  const rpdbFontScalePercent = normalizeRpdbFontScalePercent(candidate.fontScale);
  const globalGenreBadgeMode = normalizeGenreBadgeMode(
    candidate.genreBadgeMode ?? candidate.genreBadge,
    DEFAULT_GENRE_BADGE_MODE,
  );
  const globalGenreBadgeStyle = normalizeGenreBadgeStyle(
    candidate.genreBadgeStyle,
    DEFAULT_GENRE_BADGE_STYLE,
  );
  const globalGenreBadgePosition = normalizeGenreBadgePosition(
    candidate.genreBadgePosition,
    DEFAULT_GENRE_BADGE_POSITION,
  );
  const globalGenreBadgeScale = normalizeGenreBadgeScalePercent(
    candidate.genreBadgeScale,
    DEFAULT_BADGE_SCALE_PERCENT,
  );
  const globalGenreBadgeAnimeGrouping = normalizeGenreBadgeAnimeGrouping(
    candidate.genreBadgeAnimeGrouping,
    DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  );
  const legacySideRatingsPosition = normalizeSideRatingPosition(
    candidate.sideRatingsPosition ?? rpdbRatingBarAliases.sideRatingsPosition,
  );
  const legacySideRatingsOffset = normalizeSideRatingOffset(candidate.sideRatingsOffset);

  return {
    xrdbKey: typeof candidate.xrdbKey === 'string' ? candidate.xrdbKey.trim() : defaults.xrdbKey,
    tmdbKey: typeof candidate.tmdbKey === 'string' ? candidate.tmdbKey.trim() : defaults.tmdbKey,
    mdblistKey:
      typeof candidate.mdblistKey === 'string' ? candidate.mdblistKey.trim() : defaults.mdblistKey,
    fanartKey:
      typeof candidate.fanartKey === 'string' ? candidate.fanartKey.trim() : defaults.fanartKey,
    simklClientId:
      typeof candidate.simklClientId === 'string' ? candidate.simklClientId.trim() : defaults.simklClientId,
    tmdbIdScope: normalizeTmdbIdScopeMode(candidate.tmdbIdScope, defaults.tmdbIdScope),
    lang: typeof candidate.lang === 'string' && candidate.lang.trim() ? candidate.lang.trim() : defaults.lang,
    posterImageSize: normalizePosterImageSize(
      candidate.posterImageSize ?? candidate.posterSize ?? candidate.imageSize,
      defaults.posterImageSize,
    ),
    posterImageText,
    backdropImageText,
    thumbnailImageText,
    posterArtworkSource,
    backdropArtworkSource,
    thumbnailArtworkSource,
    logoArtworkSource: normalizeNonPosterArtworkSource(
      candidate.logoArtworkSource ?? candidate.logoSource,
      defaults.logoArtworkSource
    ),
    thumbnailEpisodeArtwork: normalizeEpisodeArtworkMode(
      candidate.thumbnailEpisodeArtwork,
      defaults.thumbnailEpisodeArtwork,
    ),
    backdropEpisodeArtwork: normalizeEpisodeArtworkMode(
      candidate.backdropEpisodeArtwork,
      defaults.backdropEpisodeArtwork,
    ),
    ratingValueMode: normalizeRatingValueMode(candidate.ratingValueMode, defaults.ratingValueMode),
    posterGenreBadgeMode: normalizeGenreBadgeMode(
      candidate.posterGenreBadgeMode ?? candidate.posterGenreBadge,
      globalGenreBadgeMode,
    ),
    backdropGenreBadgeMode: normalizeGenreBadgeMode(
      candidate.backdropGenreBadgeMode ?? candidate.backdropGenreBadge,
      globalGenreBadgeMode,
    ),
    thumbnailGenreBadgeMode: normalizeGenreBadgeMode(
      candidate.thumbnailGenreBadgeMode ??
        candidate.thumbnailGenreBadge ??
        candidate.backdropGenreBadge,
      defaults.thumbnailGenreBadgeMode,
    ),
    logoGenreBadgeMode: normalizeGenreBadgeMode(
      candidate.logoGenreBadgeMode ?? candidate.logoGenreBadge,
      globalGenreBadgeMode,
    ),
    posterGenreBadgeStyle: normalizeGenreBadgeStyle(
      candidate.posterGenreBadgeStyle,
      globalGenreBadgeStyle,
    ),
    backdropGenreBadgeStyle: normalizeGenreBadgeStyle(
      candidate.backdropGenreBadgeStyle,
      globalGenreBadgeStyle,
    ),
    thumbnailGenreBadgeStyle: normalizeGenreBadgeStyle(
      candidate.thumbnailGenreBadgeStyle ?? candidate.backdropGenreBadgeStyle,
      defaults.thumbnailGenreBadgeStyle,
    ),
    logoGenreBadgeStyle: normalizeGenreBadgeStyle(
      candidate.logoGenreBadgeStyle,
      globalGenreBadgeStyle,
    ),
    posterGenreBadgePosition: normalizeGenreBadgePosition(
      candidate.posterGenreBadgePosition,
      globalGenreBadgePosition,
    ),
    backdropGenreBadgePosition: normalizeGenreBadgePosition(
      candidate.backdropGenreBadgePosition,
      globalGenreBadgePosition,
    ),
    thumbnailGenreBadgePosition: normalizeGenreBadgePosition(
      candidate.thumbnailGenreBadgePosition ?? candidate.backdropGenreBadgePosition,
      defaults.thumbnailGenreBadgePosition,
    ),
    logoGenreBadgePosition: normalizeGenreBadgePosition(
      candidate.logoGenreBadgePosition,
      globalGenreBadgePosition,
    ),
    posterGenreBadgeScale: normalizeGenreBadgeScalePercent(
      candidate.posterGenreBadgeScale,
      globalGenreBadgeScale,
    ),
    backdropGenreBadgeScale: normalizeGenreBadgeScalePercent(
      candidate.backdropGenreBadgeScale,
      globalGenreBadgeScale,
    ),
    thumbnailGenreBadgeScale: normalizeGenreBadgeScalePercent(
      candidate.thumbnailGenreBadgeScale ?? candidate.backdropGenreBadgeScale,
      defaults.thumbnailGenreBadgeScale,
    ),
    logoGenreBadgeScale: normalizeGenreBadgeScalePercent(
      candidate.logoGenreBadgeScale,
      globalGenreBadgeScale,
    ),
    posterGenreBadgeAnimeGrouping: normalizeGenreBadgeAnimeGrouping(
      candidate.posterGenreBadgeAnimeGrouping,
      globalGenreBadgeAnimeGrouping,
    ),
    backdropGenreBadgeAnimeGrouping: normalizeGenreBadgeAnimeGrouping(
      candidate.backdropGenreBadgeAnimeGrouping,
      globalGenreBadgeAnimeGrouping,
    ),
    thumbnailGenreBadgeAnimeGrouping: normalizeGenreBadgeAnimeGrouping(
      candidate.thumbnailGenreBadgeAnimeGrouping ?? candidate.backdropGenreBadgeAnimeGrouping,
      defaults.thumbnailGenreBadgeAnimeGrouping,
    ),
    logoGenreBadgeAnimeGrouping: normalizeGenreBadgeAnimeGrouping(
      candidate.logoGenreBadgeAnimeGrouping,
      globalGenreBadgeAnimeGrouping,
    ),
    posterRatingPreferences: normalizeRatingPreferencesList(
      candidate.posterRatingPreferences ?? candidate.posterRatings ?? sharedRatingsInput,
      defaults.posterRatingPreferences,
    ),
    backdropRatingPreferences: normalizeRatingPreferencesList(
      candidate.backdropRatingPreferences ?? candidate.backdropRatings ?? sharedRatingsInput,
      defaults.backdropRatingPreferences,
    ),
    thumbnailRatingPreferences: filterThumbnailRatingPreferences(
      normalizeRatingPreferencesList(
        candidate.thumbnailRatingPreferences ?? candidate.thumbnailRatings ?? sharedRatingsInput,
        defaults.thumbnailRatingPreferences,
      ),
    ),
    logoRatingPreferences: normalizeRatingPreferencesList(
      candidate.logoRatingPreferences ?? candidate.logoRatings ?? sharedRatingsInput,
      defaults.logoRatingPreferences,
    ),
    posterStreamBadges: normalizeStreamBadgesSetting(
      candidate.posterStreamBadges,
      defaults.posterStreamBadges,
    ),
    backdropStreamBadges: normalizeStreamBadgesSetting(
      candidate.backdropStreamBadges,
      defaults.backdropStreamBadges,
    ),
    thumbnailStreamBadges: normalizeStreamBadgesSetting(
      candidate.thumbnailStreamBadges ?? candidate.backdropStreamBadges,
      defaults.thumbnailStreamBadges,
    ),
    qualityBadgesSide: normalizeQualityBadgesSide(
      candidate.qualityBadgesSide,
      defaults.qualityBadgesSide,
    ),
    posterQualityBadgesPosition: normalizePosterQualityBadgesPosition(
      candidate.posterQualityBadgesPosition,
      defaults.posterQualityBadgesPosition,
    ),
    posterQualityBadgePreferences: normalizeQualityBadgePreferencesList(
      candidate.posterQualityBadgePreferences,
      defaults.posterQualityBadgePreferences,
    ),
    backdropQualityBadgePreferences: normalizeQualityBadgePreferencesList(
      candidate.backdropQualityBadgePreferences,
      defaults.backdropQualityBadgePreferences,
    ),
    thumbnailQualityBadgePreferences: normalizeQualityBadgePreferencesList(
      candidate.thumbnailQualityBadgePreferences ?? candidate.backdropQualityBadgePreferences,
      defaults.thumbnailQualityBadgePreferences,
    ),
    logoQualityBadgePreferences: normalizeQualityBadgePreferencesList(
      candidate.logoQualityBadgePreferences,
      defaults.logoQualityBadgePreferences,
    ),
    posterQualityBadgesStyle: normalizeQualityBadgeStyle(
      candidate.posterQualityBadgesStyle as string | null | undefined,
    ),
    backdropQualityBadgesStyle: normalizeQualityBadgeStyle(
      candidate.backdropQualityBadgesStyle as string | null | undefined,
    ),
    thumbnailQualityBadgesStyle: normalizeQualityBadgeStyle(
      (candidate.thumbnailQualityBadgesStyle ?? candidate.backdropQualityBadgesStyle) as
        | string
        | null
        | undefined,
    ),
    logoQualityBadgesStyle: normalizeQualityBadgeStyle(
      candidate.logoQualityBadgesStyle as string | null | undefined,
    ),
    posterQualityBadgesMax: normalizeOptionalBadgeCount(candidate.posterQualityBadgesMax),
    backdropQualityBadgesMax: normalizeOptionalBadgeCount(candidate.backdropQualityBadgesMax),
    thumbnailQualityBadgesMax: normalizeOptionalBadgeCount(
      candidate.thumbnailQualityBadgesMax ?? candidate.backdropQualityBadgesMax,
    ),
    logoQualityBadgesMax: normalizeOptionalBadgeCount(candidate.logoQualityBadgesMax),
    posterRatingsLayout: normalizePosterRatingLayout(
      (candidate.posterRatingsLayout ?? rpdbRatingBarAliases.posterRatingsLayout) as
        | string
        | null
        | undefined,
    ),
    backdropRatingsLayout: normalizeBackdropRatingLayout(
      (candidate.backdropRatingsLayout ?? rpdbRatingBarAliases.backdropRatingsLayout) as
        | string
        | null
        | undefined,
    ),
    thumbnailRatingsLayout: normalizeBackdropRatingLayout(
      (candidate.thumbnailRatingsLayout ??
        candidate.backdropRatingsLayout ??
        rpdbRatingBarAliases.backdropRatingsLayout) as string | null | undefined,
    ),
    posterRatingsMax: normalizeOptionalBadgeCount(candidate.posterRatingsMax),
    backdropRatingsMax: normalizeOptionalBadgeCount(candidate.backdropRatingsMax),
    thumbnailRatingsMax: normalizeOptionalBadgeCount(
      candidate.thumbnailRatingsMax ?? candidate.backdropRatingsMax,
    ),
    backdropBottomRatingsRow: normalizeBoolean(
      candidate.backdropBottomRatingsRow,
      defaults.backdropBottomRatingsRow,
    ),
    thumbnailBottomRatingsRow: normalizeBoolean(
      candidate.thumbnailBottomRatingsRow ?? candidate.backdropBottomRatingsRow,
      defaults.thumbnailBottomRatingsRow,
    ),
    posterRatingStyle: normalizeRatingStyle(candidate.posterRatingStyle as string | null | undefined),
    backdropRatingStyle: normalizeRatingStyle(candidate.backdropRatingStyle as string | null | undefined),
    thumbnailRatingStyle: normalizeRatingStyle(
      (candidate.thumbnailRatingStyle ?? candidate.backdropRatingStyle) as
        | string
        | null
        | undefined,
    ),
    posterRatingPresentation: normalizeRatingPresentation(
      candidate.posterRatingPresentation,
      defaults.posterRatingPresentation,
    ),
    backdropRatingPresentation: normalizeRatingPresentation(
      candidate.backdropRatingPresentation,
      defaults.backdropRatingPresentation,
    ),
    thumbnailRatingPresentation: normalizeRatingPresentation(
      candidate.thumbnailRatingPresentation ?? candidate.backdropRatingPresentation,
      defaults.thumbnailRatingPresentation,
    ),
    logoRatingPresentation: normalizeRatingPresentation(
      candidate.logoRatingPresentation,
      defaults.logoRatingPresentation,
    ),
    posterAggregateRatingSource: normalizeAggregateRatingSource(
      candidate.posterAggregateRatingSource,
      defaults.posterAggregateRatingSource,
    ),
    backdropAggregateRatingSource: normalizeAggregateRatingSource(
      candidate.backdropAggregateRatingSource,
      defaults.backdropAggregateRatingSource,
    ),
    thumbnailAggregateRatingSource: normalizeAggregateRatingSource(
      candidate.thumbnailAggregateRatingSource ?? candidate.backdropAggregateRatingSource,
      defaults.thumbnailAggregateRatingSource,
    ),
    logoAggregateRatingSource: normalizeAggregateRatingSource(
      candidate.logoAggregateRatingSource,
      defaults.logoAggregateRatingSource,
    ),
    aggregateAccentMode: normalizeAggregateAccentMode(
      candidate.aggregateAccentMode,
      defaults.aggregateAccentMode,
    ),
    aggregateAccentColor:
      normalizeHexColor(candidate.aggregateAccentColor) || defaults.aggregateAccentColor,
    aggregateCriticsAccentColor:
      normalizeHexColor(candidate.aggregateCriticsAccentColor) ||
      normalizeHexColor(candidate.compactCriticsAccentColor) ||
      defaults.aggregateCriticsAccentColor,
    aggregateAudienceAccentColor:
      normalizeHexColor(candidate.aggregateAudienceAccentColor) ||
      normalizeHexColor(candidate.compactAudienceAccentColor) ||
      defaults.aggregateAudienceAccentColor,
    aggregateAccentBarOffset: normalizeAggregateAccentBarOffset(
      candidate.aggregateAccentBarOffset,
      defaults.aggregateAccentBarOffset,
    ),
    aggregateAccentBarVisible: normalizeBoolean(
      candidate.aggregateAccentBarVisible ?? candidate.aggregateAccentVisible ?? candidate.compactAccentLineVisible,
      defaults.aggregateAccentBarVisible,
    ),
    logoRatingStyle:
      candidate.logoRatingStyle === 'glass' ||
      candidate.logoRatingStyle === 'plain' ||
      candidate.logoRatingStyle === 'square' ||
      candidate.logoRatingStyle === 'stacked'
        ? (candidate.logoRatingStyle as RatingStyle)
        : 'plain',
    posterRatingBadgeScale: normalizeBadgeScalePercent(
      candidate.posterRatingBadgeScale ?? rpdbFontScalePercent,
      defaults.posterRatingBadgeScale,
    ),
    backdropRatingBadgeScale: normalizeBadgeScalePercent(
      candidate.backdropRatingBadgeScale ?? rpdbFontScalePercent,
      defaults.backdropRatingBadgeScale,
    ),
    thumbnailRatingBadgeScale: normalizeBadgeScalePercent(
      candidate.thumbnailRatingBadgeScale ??
        candidate.backdropRatingBadgeScale ??
        rpdbFontScalePercent,
      defaults.thumbnailRatingBadgeScale,
    ),
    logoRatingBadgeScale: normalizeBadgeScalePercent(
      candidate.logoRatingBadgeScale ?? rpdbFontScalePercent,
      defaults.logoRatingBadgeScale,
    ),
    posterQualityBadgeScale: normalizeBadgeScalePercent(
      candidate.posterQualityBadgeScale,
      defaults.posterQualityBadgeScale,
    ),
    backdropQualityBadgeScale: normalizeBadgeScalePercent(
      candidate.backdropQualityBadgeScale,
      defaults.backdropQualityBadgeScale,
    ),
    thumbnailQualityBadgeScale: normalizeBadgeScalePercent(
      candidate.thumbnailQualityBadgeScale ?? candidate.backdropQualityBadgeScale,
      defaults.thumbnailQualityBadgeScale,
    ),
    logoQualityBadgeScale: normalizeBadgeScalePercent(
      candidate.logoQualityBadgeScale,
      defaults.logoQualityBadgeScale,
    ),
    posterRatingsMaxPerSide: normalizePosterRatingsMaxPerSide(candidate.posterRatingsMaxPerSide),
    posterEdgeOffset: normalizePosterEdgeOffset(candidate.posterEdgeOffset),
    posterSideRatingsPosition: normalizeSideRatingPosition(
      candidate.posterSideRatingsPosition ?? legacySideRatingsPosition,
    ),
    posterSideRatingsOffset: normalizeSideRatingOffset(
      candidate.posterSideRatingsOffset ?? legacySideRatingsOffset,
    ),
    backdropSideRatingsPosition: normalizeSideRatingPosition(
      candidate.backdropSideRatingsPosition ?? legacySideRatingsPosition,
    ),
    backdropSideRatingsOffset: normalizeSideRatingOffset(
      candidate.backdropSideRatingsOffset ?? legacySideRatingsOffset,
    ),
    thumbnailSideRatingsPosition: normalizeSideRatingPosition(
      candidate.thumbnailSideRatingsPosition ?? candidate.backdropSideRatingsPosition ?? legacySideRatingsPosition,
    ),
    thumbnailSideRatingsOffset: normalizeSideRatingOffset(
      candidate.thumbnailSideRatingsOffset ?? candidate.backdropSideRatingsOffset ?? legacySideRatingsOffset,
    ),
    sideRatingsPosition: legacySideRatingsPosition,
    sideRatingsOffset: legacySideRatingsOffset,
    logoRatingsMax: normalizeOptionalBadgeCount(candidate.logoRatingsMax),
    logoBackground: normalizeLogoBackground(candidate.logoBackground, defaults.logoBackground),
    logoBottomRatingsRow: normalizeBoolean(
      candidate.logoBottomRatingsRow,
      defaults.logoBottomRatingsRow,
    ),
    ratingProviderAppearanceOverrides: normalizeRatingProviderAppearanceOverrides(
      candidate.ratingProviderAppearanceOverrides,
    ),
  };
};

export const normalizeSavedUiConfig = (value: unknown): SavedUiConfig => {
  const defaults = createDefaultSavedUiConfig();
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const candidate = value as {
    settings?: unknown;
    proxy?: {
      manifestUrl?: unknown;
      translateMeta?: unknown;
      translateMetaMode?: unknown;
      debugMetaTranslation?: unknown;
      episodeIdMode?: unknown;
      catalogRules?: unknown;
    };
  };

  return {
    version: 1,
    settings: normalizeSharedXrdbSettings(candidate.settings),
    proxy: {
      manifestUrl:
        typeof candidate.proxy?.manifestUrl === 'string'
          ? normalizeManifestUrl(candidate.proxy.manifestUrl, true)
          : defaults.proxy.manifestUrl,
      translateMeta: normalizeBoolean(candidate.proxy?.translateMeta, defaults.proxy.translateMeta),
      translateMetaMode: normalizeMetadataTranslationMode(
        candidate.proxy?.translateMetaMode,
        defaults.proxy.translateMetaMode,
      ),
      debugMetaTranslation: normalizeBoolean(
        candidate.proxy?.debugMetaTranslation,
        defaults.proxy.debugMetaTranslation,
      ),
      episodeIdMode: normalizeEpisodeIdMode(
        candidate.proxy?.episodeIdMode,
        defaults.proxy.episodeIdMode,
      ),
      catalogRules: normalizeProxyCatalogRules(candidate.proxy?.catalogRules),
    },
  };
};

export const parseSavedUiConfig = (raw: string): SavedUiConfig | null => {
  try {
    return normalizeSavedUiConfig(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const serializeSavedUiConfig = (config: SavedUiConfig) =>
  JSON.stringify(normalizeSavedUiConfig(config), null, 2);

const XRDB_IMAGE_TYPES: XrdbImageType[] = ['poster', 'backdrop', 'logo'];

const appendSharedOrPerTypePayload = <Value extends string | number | boolean>(options: {
  payload: Record<string, string | number | boolean>;
  globalKey: string;
  perTypeKeys: Record<XrdbImageType, string>;
  values: Record<XrdbImageType, Value>;
  defaultValue: Value;
}) => {
  const { payload, globalKey, perTypeKeys, values, defaultValue } = options;
  const [firstType, ...remainingTypes] = XRDB_IMAGE_TYPES;
  const sharedValue = values[firstType];
  const allValuesMatch = remainingTypes.every((type) => values[type] === sharedValue);

  if (allValuesMatch) {
    if (sharedValue !== defaultValue) {
      payload[globalKey] = sharedValue;
    }
    return;
  }

  for (const type of XRDB_IMAGE_TYPES) {
    if (values[type] !== defaultValue) {
      payload[perTypeKeys[type]] = values[type];
    }
  }
};

const buildSharedPayload = (settings: SharedXrdbSettings) => {
  const xrdbKey = settings.xrdbKey.trim();
  const tmdbKey = settings.tmdbKey.trim();
  const mdblistKey = settings.mdblistKey.trim();
  const fanartKey = settings.fanartKey.trim();
  if (!tmdbKey || !mdblistKey) {
    return null;
  }

  const payload: Record<string, string | number | boolean> = {
    tmdbKey,
    mdblistKey,
  };
  if (xrdbKey) {
    payload.xrdbKey = xrdbKey;
  }
  if (fanartKey) {
    payload.fanartKey = fanartKey;
  }
  const simklClientId = settings.simklClientId.trim();
  if (simklClientId) {
    payload.simklClientId = simklClientId;
  }
  if (settings.tmdbIdScope !== 'soft') {
    payload.tmdbIdScope = settings.tmdbIdScope;
  }

  const posterRatings = stringifyRatingPreferencesAllowEmpty(settings.posterRatingPreferences);
  const backdropRatings = stringifyRatingPreferencesAllowEmpty(settings.backdropRatingPreferences);
  const thumbnailRatings = stringifyRatingPreferencesAllowEmpty(settings.thumbnailRatingPreferences);
  const logoRatings = stringifyRatingPreferencesAllowEmpty(settings.logoRatingPreferences);
  const ratingsMatch =
    posterRatings === backdropRatings &&
    posterRatings === thumbnailRatings &&
    posterRatings === logoRatings;

  if (ratingsMatch) {
    payload.ratings = posterRatings;
  } else {
    payload.posterRatings = posterRatings;
    payload.backdropRatings = backdropRatings;
    payload.thumbnailRatings = thumbnailRatings;
    payload.logoRatings = logoRatings;
  }

  if (settings.lang) {
    payload.lang = settings.lang;
  }
  if (settings.posterImageSize !== 'normal') {
    payload.posterImageSize = settings.posterImageSize;
  }
  if (settings.ratingValueMode !== DEFAULT_RATING_VALUE_MODE) {
    payload.ratingValueMode = settings.ratingValueMode;
  }
  appendSharedOrPerTypePayload({
    payload,
    globalKey: 'genreBadge',
    perTypeKeys: {
      poster: 'posterGenreBadge',
      backdrop: 'backdropGenreBadge',
      logo: 'logoGenreBadge',
    },
    values: {
      poster: settings.posterGenreBadgeMode,
      backdrop: settings.backdropGenreBadgeMode,
      logo: settings.logoGenreBadgeMode,
    },
    defaultValue: DEFAULT_GENRE_BADGE_MODE,
  });
  appendSharedOrPerTypePayload({
    payload,
    globalKey: 'genreBadgeStyle',
    perTypeKeys: {
      poster: 'posterGenreBadgeStyle',
      backdrop: 'backdropGenreBadgeStyle',
      logo: 'logoGenreBadgeStyle',
    },
    values: {
      poster: settings.posterGenreBadgeStyle,
      backdrop: settings.backdropGenreBadgeStyle,
      logo: settings.logoGenreBadgeStyle,
    },
    defaultValue: DEFAULT_GENRE_BADGE_STYLE,
  });
  appendSharedOrPerTypePayload({
    payload,
    globalKey: 'genreBadgePosition',
    perTypeKeys: {
      poster: 'posterGenreBadgePosition',
      backdrop: 'backdropGenreBadgePosition',
      logo: 'logoGenreBadgePosition',
    },
    values: {
      poster: settings.posterGenreBadgePosition,
      backdrop: settings.backdropGenreBadgePosition,
      logo: settings.logoGenreBadgePosition,
    },
    defaultValue: DEFAULT_GENRE_BADGE_POSITION,
  });
  appendSharedOrPerTypePayload({
    payload,
    globalKey: 'genreBadgeScale',
    perTypeKeys: {
      poster: 'posterGenreBadgeScale',
      backdrop: 'backdropGenreBadgeScale',
      logo: 'logoGenreBadgeScale',
    },
    values: {
      poster: settings.posterGenreBadgeScale,
      backdrop: settings.backdropGenreBadgeScale,
      logo: settings.logoGenreBadgeScale,
    },
    defaultValue: DEFAULT_BADGE_SCALE_PERCENT,
  });
  appendSharedOrPerTypePayload({
    payload,
    globalKey: 'genreBadgeAnimeGrouping',
    perTypeKeys: {
      poster: 'posterGenreBadgeAnimeGrouping',
      backdrop: 'backdropGenreBadgeAnimeGrouping',
      logo: 'logoGenreBadgeAnimeGrouping',
    },
    values: {
      poster: settings.posterGenreBadgeAnimeGrouping,
      backdrop: settings.backdropGenreBadgeAnimeGrouping,
      logo: settings.logoGenreBadgeAnimeGrouping,
    },
    defaultValue: DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  });
  if (settings.thumbnailGenreBadgeMode !== DEFAULT_GENRE_BADGE_MODE) {
    payload.thumbnailGenreBadge = settings.thumbnailGenreBadgeMode;
  }
  if (settings.thumbnailGenreBadgeStyle !== DEFAULT_GENRE_BADGE_STYLE) {
    payload.thumbnailGenreBadgeStyle = settings.thumbnailGenreBadgeStyle;
  }
  if (settings.thumbnailGenreBadgePosition !== DEFAULT_GENRE_BADGE_POSITION) {
    payload.thumbnailGenreBadgePosition = settings.thumbnailGenreBadgePosition;
  }
  if (settings.thumbnailGenreBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.thumbnailGenreBadgeScale = settings.thumbnailGenreBadgeScale;
  }
  if (settings.thumbnailGenreBadgeAnimeGrouping !== DEFAULT_GENRE_BADGE_ANIME_GROUPING) {
    payload.thumbnailGenreBadgeAnimeGrouping = settings.thumbnailGenreBadgeAnimeGrouping;
  }
  if (settings.posterStreamBadges !== 'auto') {
    payload.posterStreamBadges = settings.posterStreamBadges;
  }
  if (settings.backdropStreamBadges !== 'auto') {
    payload.backdropStreamBadges = settings.backdropStreamBadges;
  }
  if (settings.thumbnailStreamBadges !== 'auto') {
    payload.thumbnailStreamBadges = settings.thumbnailStreamBadges;
  }
  if (settings.posterRatingsLayout === 'top-bottom' && settings.qualityBadgesSide !== 'left') {
    payload.qualityBadgesSide = settings.qualityBadgesSide;
  }
  if (
    (settings.posterRatingsLayout === 'top' || settings.posterRatingsLayout === 'bottom') &&
    settings.posterQualityBadgesPosition !== 'auto'
  ) {
    payload.posterQualityBadgesPosition = settings.posterQualityBadgesPosition;
  }
  const posterQualityBadges = stringifyQualityBadgePreferencesAllowEmpty(
    settings.posterQualityBadgePreferences,
  );
  const backdropQualityBadges = stringifyQualityBadgePreferencesAllowEmpty(
    settings.backdropQualityBadgePreferences,
  );
  const thumbnailQualityBadges = stringifyQualityBadgePreferencesAllowEmpty(
    settings.thumbnailQualityBadgePreferences,
  );
  const logoQualityBadges = stringifyQualityBadgePreferencesAllowEmpty(
    settings.logoQualityBadgePreferences,
  );
  if (
    posterQualityBadges !==
    stringifyQualityBadgePreferencesAllowEmpty(DEFAULT_QUALITY_BADGE_PREFERENCES)
  ) {
    payload.posterQualityBadges = posterQualityBadges;
  }
  if (
    backdropQualityBadges !==
    stringifyQualityBadgePreferencesAllowEmpty(DEFAULT_QUALITY_BADGE_PREFERENCES)
  ) {
    payload.backdropQualityBadges = backdropQualityBadges;
  }
  if (
    thumbnailQualityBadges !==
    stringifyQualityBadgePreferencesAllowEmpty(DEFAULT_QUALITY_BADGE_PREFERENCES)
  ) {
    payload.thumbnailQualityBadges = thumbnailQualityBadges;
  }
  if (
    logoQualityBadges !==
    stringifyQualityBadgePreferencesAllowEmpty(DEFAULT_QUALITY_BADGE_PREFERENCES)
  ) {
    payload.logoQualityBadges = logoQualityBadges;
  }
  if (settings.posterQualityBadgesStyle !== DEFAULT_QUALITY_BADGES_STYLE) {
    payload.posterQualityBadgesStyle = settings.posterQualityBadgesStyle;
  }
  if (settings.backdropQualityBadgesStyle !== DEFAULT_QUALITY_BADGES_STYLE) {
    payload.backdropQualityBadgesStyle = settings.backdropQualityBadgesStyle;
  }
  if (settings.thumbnailQualityBadgesStyle !== DEFAULT_QUALITY_BADGES_STYLE) {
    payload.thumbnailQualityBadgesStyle = settings.thumbnailQualityBadgesStyle;
  }
  if (settings.logoQualityBadgesStyle !== DEFAULT_QUALITY_BADGES_STYLE) {
    payload.logoQualityBadgesStyle = settings.logoQualityBadgesStyle;
  }
  if (settings.posterQualityBadgesMax !== null) {
    payload.posterQualityBadgesMax = settings.posterQualityBadgesMax;
  }
  if (settings.backdropQualityBadgesMax !== null) {
    payload.backdropQualityBadgesMax = settings.backdropQualityBadgesMax;
  }
  if (settings.thumbnailQualityBadgesMax !== null) {
    payload.thumbnailQualityBadgesMax = settings.thumbnailQualityBadgesMax;
  }
  if (settings.logoQualityBadgesMax !== null) {
    payload.logoQualityBadgesMax = settings.logoQualityBadgesMax;
  }
  if (settings.posterRatingsMax !== null) {
    payload.posterRatingsMax = settings.posterRatingsMax;
  }
  if (settings.backdropRatingsMax !== null) {
    payload.backdropRatingsMax = settings.backdropRatingsMax;
  }
  if (settings.thumbnailRatingsMax !== null) {
    payload.thumbnailRatingsMax = settings.thumbnailRatingsMax;
  }
  if (settings.backdropBottomRatingsRow) {
    payload.backdropBottomRatingsRow = true;
  }
  if (settings.thumbnailBottomRatingsRow) {
    payload.thumbnailBottomRatingsRow = true;
  }

  payload.posterRatingStyle = settings.posterRatingStyle;
  payload.backdropRatingStyle = settings.backdropRatingStyle;
  payload.thumbnailRatingStyle = settings.thumbnailRatingStyle;
  payload.logoRatingStyle = settings.logoRatingStyle;
  if (settings.posterRatingBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.posterRatingBadgeScale = settings.posterRatingBadgeScale;
  }
  if (settings.backdropRatingBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.backdropRatingBadgeScale = settings.backdropRatingBadgeScale;
  }
  if (settings.thumbnailRatingBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.thumbnailRatingBadgeScale = settings.thumbnailRatingBadgeScale;
  }
  if (settings.logoRatingBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.logoRatingBadgeScale = settings.logoRatingBadgeScale;
  }
  if (settings.posterQualityBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.posterQualityBadgeScale = settings.posterQualityBadgeScale;
  }
  if (settings.backdropQualityBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.backdropQualityBadgeScale = settings.backdropQualityBadgeScale;
  }
  if (settings.thumbnailQualityBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.thumbnailQualityBadgeScale = settings.thumbnailQualityBadgeScale;
  }
  if (settings.logoQualityBadgeScale !== DEFAULT_BADGE_SCALE_PERCENT) {
    payload.logoQualityBadgeScale = settings.logoQualityBadgeScale;
  }
  payload.posterImageText = settings.posterImageText;
  payload.backdropImageText = settings.backdropImageText;
  payload.thumbnailImageText = settings.thumbnailImageText;
  if (settings.posterArtworkSource !== 'tmdb') {
    payload.posterArtworkSource = settings.posterArtworkSource;
  }
  if (settings.backdropArtworkSource !== 'tmdb') {
    payload.backdropArtworkSource = settings.backdropArtworkSource;
  }
  if (settings.thumbnailArtworkSource !== 'tmdb') {
    payload.thumbnailArtworkSource = settings.thumbnailArtworkSource;
  }
  if (settings.logoArtworkSource !== 'tmdb') {
    payload.logoArtworkSource = settings.logoArtworkSource;
  }
  if (settings.thumbnailEpisodeArtwork !== 'still') {
    payload.thumbnailEpisodeArtwork = settings.thumbnailEpisodeArtwork;
  }
  if (settings.backdropEpisodeArtwork !== 'series') {
    payload.backdropEpisodeArtwork = settings.backdropEpisodeArtwork;
  }
  payload.posterRatingsLayout = settings.posterRatingsLayout;
  if (settings.posterRatingPresentation !== DEFAULT_RATING_PRESENTATION) {
    payload.posterRatingPresentation = settings.posterRatingPresentation;
  }
  if (settings.backdropRatingPresentation !== DEFAULT_RATING_PRESENTATION) {
    payload.backdropRatingPresentation = settings.backdropRatingPresentation;
  }
  if (settings.thumbnailRatingPresentation !== DEFAULT_RATING_PRESENTATION) {
    payload.thumbnailRatingPresentation = settings.thumbnailRatingPresentation;
  }
  if (settings.logoRatingPresentation !== DEFAULT_RATING_PRESENTATION) {
    payload.logoRatingPresentation = settings.logoRatingPresentation;
  }
  if (settings.posterAggregateRatingSource !== DEFAULT_AGGREGATE_RATING_SOURCE) {
    payload.posterAggregateRatingSource = settings.posterAggregateRatingSource;
  }
  if (settings.backdropAggregateRatingSource !== DEFAULT_AGGREGATE_RATING_SOURCE) {
    payload.backdropAggregateRatingSource = settings.backdropAggregateRatingSource;
  }
  if (settings.thumbnailAggregateRatingSource !== DEFAULT_AGGREGATE_RATING_SOURCE) {
    payload.thumbnailAggregateRatingSource = settings.thumbnailAggregateRatingSource;
  }
  if (settings.logoAggregateRatingSource !== DEFAULT_AGGREGATE_RATING_SOURCE) {
    payload.logoAggregateRatingSource = settings.logoAggregateRatingSource;
  }
  if (settings.aggregateAccentMode !== DEFAULT_AGGREGATE_ACCENT_MODE) {
    payload.aggregateAccentMode = settings.aggregateAccentMode;
  }
  if (
    settings.aggregateAccentMode === 'custom' ||
    settings.aggregateAccentColor !== DEFAULT_AGGREGATE_ACCENT_COLOR
  ) {
    payload.aggregateAccentColor = settings.aggregateAccentColor;
  }
  if (
    settings.aggregateAccentMode === 'custom' ||
    settings.aggregateCriticsAccentColor !== AGGREGATE_RATING_SOURCE_ACCENTS.critics
  ) {
    payload.aggregateCriticsAccentColor = settings.aggregateCriticsAccentColor;
  }
  if (
    settings.aggregateAccentMode === 'custom' ||
    settings.aggregateAudienceAccentColor !== AGGREGATE_RATING_SOURCE_ACCENTS.audience
  ) {
    payload.aggregateAudienceAccentColor = settings.aggregateAudienceAccentColor;
  }
  if (settings.aggregateAccentBarOffset !== DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET) {
    payload.aggregateAccentBarOffset = settings.aggregateAccentBarOffset;
  }
  if (settings.aggregateAccentBarVisible !== true) {
    payload.aggregateAccentBarVisible = false;
  }

  if (
    isVerticalPosterRatingLayout(settings.posterRatingsLayout) &&
    settings.posterRatingsMaxPerSide !== null
  ) {
    payload.posterRatingsMaxPerSide = settings.posterRatingsMaxPerSide;
  }
  if (settings.posterEdgeOffset !== DEFAULT_POSTER_EDGE_OFFSET) {
    payload.posterEdgeOffset = settings.posterEdgeOffset;
  }
  if (settings.posterSideRatingsPosition !== DEFAULT_SIDE_RATING_POSITION) {
    payload.posterSideRatingsPosition = settings.posterSideRatingsPosition;
    if (settings.posterSideRatingsPosition === 'custom') {
      payload.posterSideRatingsOffset = settings.posterSideRatingsOffset;
    }
  }
  if (
    !settings.backdropBottomRatingsRow &&
    settings.backdropSideRatingsPosition !== DEFAULT_SIDE_RATING_POSITION
  ) {
    payload.backdropSideRatingsPosition = settings.backdropSideRatingsPosition;
    if (settings.backdropSideRatingsPosition === 'custom') {
      payload.backdropSideRatingsOffset = settings.backdropSideRatingsOffset;
    }
  }
  if (
    !settings.thumbnailBottomRatingsRow &&
    settings.thumbnailSideRatingsPosition !== DEFAULT_SIDE_RATING_POSITION
  ) {
    payload.thumbnailSideRatingsPosition = settings.thumbnailSideRatingsPosition;
    if (settings.thumbnailSideRatingsPosition === 'custom') {
      payload.thumbnailSideRatingsOffset = settings.thumbnailSideRatingsOffset;
    }
  }
  if (settings.logoRatingsMax !== null) {
    payload.logoRatingsMax = settings.logoRatingsMax;
  }
  if (settings.logoBackground !== 'transparent') {
    payload.logoBackground = settings.logoBackground;
  }
  if (settings.logoBottomRatingsRow) {
    payload.logoBottomRatingsRow = true;
  }
  const providerAppearance = encodeRatingProviderAppearanceOverrides(
    settings.ratingProviderAppearanceOverrides,
  );
  if (providerAppearance) {
    payload.providerAppearance = providerAppearance;
  }
  if (!settings.backdropBottomRatingsRow) {
    payload.backdropRatingsLayout = settings.backdropRatingsLayout;
  }
  if (!settings.thumbnailBottomRatingsRow) {
    payload.thumbnailRatingsLayout = settings.thumbnailRatingsLayout;
  }

  return payload;
};

export const buildConfigPayload = (baseUrl: string, settings: SharedXrdbSettings) => {
  const origin = normalizeBaseUrl(baseUrl);
  const sharedPayload = buildSharedPayload(settings);
  if (!origin || !sharedPayload) {
    return null;
  }

  return {
    baseUrl: origin,
    ...sharedPayload,
  };
};

export const buildConfigString = (baseUrl: string, settings: SharedXrdbSettings) => {
  const payload = buildConfigPayload(baseUrl, settings);
  if (!payload) {
    return '';
  }
  return encodeBase64Url(JSON.stringify(payload));
};

const AIO_TMDB_KEY_PLACEHOLDER = '{tmdb_key}';
const AIO_MDBLIST_KEY_PLACEHOLDER = '{mdblist_key}';
const AIO_FANART_KEY_PLACEHOLDER = '{fanart_key}';
const AIO_XRDB_KEY_PLACEHOLDER = '{xrdb_key}';
const AIO_SIMKL_CLIENT_ID_PLACEHOLDER = '{simkl_client_id}';

const restoreAiometadataPlaceholders = (value: string) => {
  const placeholders = [
    AIO_TMDB_KEY_PLACEHOLDER,
    AIO_MDBLIST_KEY_PLACEHOLDER,
    AIO_FANART_KEY_PLACEHOLDER,
    AIO_XRDB_KEY_PLACEHOLDER,
    AIO_SIMKL_CLIENT_ID_PLACEHOLDER,
    '{imdb_id}',
    '{tmdb_id}',
    '{tvdb_id}',
    '{mal_id}',
    '{kitsu_id}',
    '{anilist_id}',
    '{anidb_id}',
    '{season}',
    '{episode}',
    '{language}',
    '{language_short}',
    '{thumbnail}',
    '{blur}',
    '{type}',
  ];

  return placeholders.reduce(
    (normalized, placeholder) =>
      normalized.replaceAll(encodeURIComponent(placeholder), placeholder),
    value,
  );
};

const chooseAiometadataCredentialValue = ({
  value,
  placeholder,
  hideCredentials,
  forcePlaceholder = false,
}: {
  value: string;
  placeholder: string;
  hideCredentials: boolean;
  forcePlaceholder?: boolean;
}) => {
  const trimmed = value.trim();
  if (hideCredentials || forcePlaceholder) {
    return placeholder;
  }
  return trimmed || placeholder;
};

export const buildAiometadataUrlPatterns = (
  baseUrl: string,
  settings: SharedXrdbSettings,
  options?: {
    hideCredentials?: boolean;
    posterIdMode?: AiometadataPosterIdMode;
    episodeIdMode?: AiometadataEpisodeIdMode;
  },
): AiometadataUrlPatterns | null => {
  const origin = normalizeBaseUrl(baseUrl);
  if (!origin) {
    return null;
  }

  const hideCredentials = options?.hideCredentials ?? true;
  const posterIdMode = options?.posterIdMode === 'imdb' ? 'imdb' : 'auto';
  const episodeIdMode = normalizeEpisodeIdMode(options?.episodeIdMode, DEFAULT_EPISODE_ID_MODE);
  const useTmdbPosterIds = posterIdMode === 'imdb' ? false : true;
  const needsFanartKey =
    settings.posterArtworkSource === 'fanart' ||
    settings.posterArtworkSource === 'random' ||
    settings.backdropArtworkSource === 'fanart' ||
    settings.backdropArtworkSource === 'random' ||
    settings.logoArtworkSource === 'fanart' ||
    settings.logoArtworkSource === 'random';

  const exportSettings: SharedXrdbSettings = {
    ...settings,
    xrdbKey: settings.xrdbKey.trim()
      ? chooseAiometadataCredentialValue({
          value: settings.xrdbKey,
          placeholder: AIO_XRDB_KEY_PLACEHOLDER,
          hideCredentials,
        })
      : settings.xrdbKey.trim(),
    tmdbKey: chooseAiometadataCredentialValue({
      value: settings.tmdbKey,
      placeholder: AIO_TMDB_KEY_PLACEHOLDER,
      hideCredentials,
    }),
    mdblistKey: chooseAiometadataCredentialValue({
      value: settings.mdblistKey,
      placeholder: AIO_MDBLIST_KEY_PLACEHOLDER,
      hideCredentials,
    }),
    fanartKey: needsFanartKey
      ? chooseAiometadataCredentialValue({
          value: settings.fanartKey,
          placeholder: AIO_FANART_KEY_PLACEHOLDER,
          hideCredentials,
        })
      : '',
    simklClientId: settings.simklClientId.trim()
      ? chooseAiometadataCredentialValue({
          value: settings.simklClientId,
          placeholder: AIO_SIMKL_CLIENT_ID_PLACEHOLDER,
          hideCredentials,
        })
      : settings.simklClientId.trim(),
  };

  const payload = buildSharedPayload(exportSettings);
  if (!payload) {
    return null;
  }

  const payloadEntries = Object.entries(payload).map(([key, value]) => [key, String(value)] as [string, string]);
  const buildScopedEntries = (scope: 'poster' | 'backdrop' | 'logo' | 'thumbnail') => {
    if (scope === 'thumbnail') {
      return payloadEntries.filter(
        ([key]) =>
          !key.startsWith('poster') &&
          !key.startsWith('backdrop') &&
          !key.startsWith('logo') &&
          key !== 'qualityBadgesSide',
      );
    }

    return payloadEntries.filter(([key]) => {
      if (key.startsWith('thumbnail')) {
        return false;
      }

      if (scope === 'poster') {
        return !key.startsWith('backdrop') && !key.startsWith('logo');
      }

      if (scope === 'backdrop') {
        return !key.startsWith('poster') && !key.startsWith('logo') && key !== 'qualityBadgesSide';
      }

      return !key.startsWith('poster') && !key.startsWith('backdrop') && key !== 'qualityBadgesSide';
    });
  };
  const buildQueryString = (
    scope: 'poster' | 'backdrop' | 'logo' | 'thumbnail',
    extraParams?: Record<string, string>,
  ) =>
    restoreAiometadataPlaceholders(
      new URLSearchParams([
        ...(extraParams
          ? Object.entries(extraParams).map(([key, value]) => [key, value] as [string, string])
          : []),
        ...buildScopedEntries(scope),
      ]).toString(),
    );

  return {
    posterUrlPattern: useTmdbPosterIds
      ? `${origin}/poster/tmdb:{type}:{tmdb_id}.jpg?${buildQueryString('poster', { idSource: 'tmdb' })}`
      : `${origin}/poster/{imdb_id}.jpg?${buildQueryString('poster')}`,
    backgroundUrlPattern: `${origin}/backdrop/tmdb:{type}:{tmdb_id}.jpg?${buildQueryString('backdrop', { idSource: 'tmdb' })}`,
    logoUrlPattern: `${origin}/logo/tmdb:{type}:{tmdb_id}.png?${buildQueryString('logo', { idSource: 'tmdb' })}`,
    episodeThumbnailUrlPattern: `${origin}/thumbnail/${buildEpisodePatternBaseId(episodeIdMode)}/S{season}E{episode}.jpg?${buildQueryString('thumbnail')}`,
  };
};

export const buildProxyPayload = (
  baseUrl: string,
  proxy: SavedProxySettings,
  settings: SharedXrdbSettings,
) => {
  const origin = normalizeBaseUrl(baseUrl);
  const normalizedManifestUrl = normalizeManifestUrl(proxy.manifestUrl);
  const sharedPayload = buildSharedPayload(settings);
  if (!origin || !normalizedManifestUrl || isBareHttpUrl(normalizedManifestUrl) || !sharedPayload) {
    return null;
  }

  const payload: Record<string, string | number | boolean> = {
    url: normalizedManifestUrl,
    ...sharedPayload,
    xrdbBase: origin,
  };

  if (proxy.translateMeta) {
    payload.translateMeta = true;
    payload.translateMetaMode = normalizeMetadataTranslationMode(
      proxy.translateMetaMode,
      DEFAULT_METADATA_TRANSLATION_MODE,
    );
    if (proxy.debugMetaTranslation) {
      payload.debugMetaTranslation = true;
    }
  }
  if (proxy.episodeIdMode !== DEFAULT_EPISODE_ID_MODE) {
    payload.episodeIdMode = normalizeEpisodeIdMode(proxy.episodeIdMode, DEFAULT_EPISODE_ID_MODE);
  }
  const encodedCatalogPlan = encodeProxyCatalogRules(proxy.catalogRules);
  if (encodedCatalogPlan) {
    payload.catalogPlan = encodedCatalogPlan;
  }

  return payload;
};

export const buildProxyUrl = (
  baseUrl: string,
  proxy: SavedProxySettings,
  settings: SharedXrdbSettings,
) => {
  const origin = normalizeBaseUrl(baseUrl);
  const payload = buildProxyPayload(baseUrl, proxy, settings);
  if (!origin || !payload) {
    return '';
  }

  return `${origin}/proxy/${encodeBase64Url(JSON.stringify(payload))}/manifest.json`;
};
