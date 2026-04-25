import { ALL_RATING_PREFERENCES } from './ratingProviderCatalog.ts';
import {
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_QUALITY_BADGE_PREFERENCES,
  MAX_BADGE_SCALE_PERCENT,
  MAX_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  MAX_GENRE_BADGE_BORDER_WIDTH_PX,
  MAX_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  MIN_BADGE_SCALE_PERCENT,
  MIN_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  MIN_GENRE_BADGE_BORDER_WIDTH_PX,
  MIN_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
} from './badgeCustomization.ts';
import {
  AGGREGATE_ACCENT_MODE_OPTIONS,
  AGGREGATE_RATING_SOURCE_OPTIONS,
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  MAX_AGGREGATE_ACCENT_BAR_OFFSET,
  MIN_AGGREGATE_ACCENT_BAR_OFFSET,
  RATING_PRESENTATION_OPTIONS,
} from './ratingPresentation.ts';
import { BACKDROP_RATING_LAYOUT_OPTIONS } from './backdropLayoutOptions.ts';
import {
  DEFAULT_POSTER_EDGE_OFFSET,
  MAX_POSTER_EDGE_OFFSET,
  MIN_POSTER_EDGE_OFFSET,
} from './posterEdgeOffset.ts';
import {
  POSTER_RATING_LAYOUT_OPTIONS,
  POSTER_RATINGS_MAX_PER_SIDE_MAX,
  POSTER_RATINGS_MAX_PER_SIDE_MIN,
} from './posterLayoutOptions.ts';
import {
  DEFAULT_POSTER_COMPACT_RING_CENTER_OPACITY_PERCENT,
  POSTER_COMPACT_RING_SOURCE_OPTIONS,
} from './posterCompactRing.ts';
import {
  DEFAULT_QUALITY_BADGES_STYLE,
  ICON_SHAPE_OPTIONS,
  QUALITY_BADGE_STYLE_OPTIONS,
  RATING_STYLE_OPTIONS,
} from './ratingAppearance.ts';
import {
  COMMUNITY_BADGE_THEME_OPTIONS,
  DEFAULT_COMMUNITY_BADGE_THEME,
} from './communityBadgeTheme.ts';
import {
  DEFAULT_RATING_STACK_OFFSET_PX,
  MAX_RATING_STACK_OFFSET_PX,
  MIN_RATING_STACK_OFFSET_PX,
} from './ratingStackOffset.ts';
import {
  DEFAULT_SIDE_RATING_OFFSET,
  DEFAULT_SIDE_RATING_POSITION,
  SIDE_RATING_POSITION_OPTIONS,
} from './sideRatingPosition.ts';
import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
  GENRE_BADGE_MODE_OPTIONS,
  GENRE_BADGE_POSITION_OPTIONS,
  GENRE_BADGE_STYLE_OPTIONS,
} from './genreBadge.ts';

export type ConfigProfileBrowserFamily =
  | 'credentials'
  | 'providers'
  | 'presentation'
  | 'artwork'
  | 'genre-badge'
  | 'quality-badge'
  | 'layout'
  | 'position'
  | 'offset'
  | 'limits'
  | 'appearance';

export type ConfigProfileVerificationEntry = {
  key: string;
  coverageValues: readonly string[];
  requiredParams?: Readonly<Record<string, string>>;
  browserFamily: ConfigProfileBrowserFamily;
  surfaces: readonly string[];
};

export type ConfigProfileInteractionCase = {
  id: string;
  params: Readonly<Record<string, string>>;
  expectedIncludedKeys: readonly string[];
  expectedOmittedKeys?: readonly string[];
};

export const CONFIG_PROFILE_TYPE_SURFACES = ['poster', 'backdrop', 'thumbnail', 'logo'] as const;

export const CONFIG_PROFILE_GLOBAL_KEYS = [
  'tmdbKey',
  'mdblistKey',
  'xrdbKey',
  'fanartKey',
  'simklClientId',
  'lang',
  'tmdbIdScope',
] as const;

export const CONFIG_PROFILE_LEGACY_SHARED_OPTION_KEYS = [
  'ratings',
  'ratingValueMode',
  'qualityBadgesStyle',
  'ratingPresentation',
  'aggregateRatingSource',
  'aggregateAccentMode',
  'aggregateAccentColor',
  'aggregateCriticsAccentColor',
  'aggregateAudienceAccentColor',
  'aggregateValueColor',
  'aggregateCriticsValueColor',
  'aggregateAudienceValueColor',
  'aggregateDynamicStops',
  'aggregateAccentBarOffset',
  'aggregateAccentBarVisible',
  'ageRatingTileColor',
  'releaseStatusTileColor',
  'qualityBadgesTileAccentColor',
  'networkTileColor',
  'genreBadgeTileAccentColor',
  'iconShape',
  'communityBadgeTheme',
  'ageRatingBadgeStyle',
  'releaseStatusBadgeStyle',
  'ratingXOffsetPillGlass',
  'ratingYOffsetPillGlass',
  'ratingXOffsetSquare',
  'ratingYOffsetSquare',
  'sideRatingsPosition',
  'sideRatingsOffset',
  'providerAppearance',
  'qualityBadgeAppearance',
] as const;

const STRING_CASES = ['alpha', 'omega'] as const;
const LANGUAGE_CASES = ['en', 'it', 'ja'] as const;
const RATINGS_CASES = [
  'tmdb',
  'tmdb,imdb',
  'tmdb,mdblist,imdb',
  ALL_RATING_PREFERENCES.join(','),
] as const;
const QUALITY_BADGE_CASES = [
  'certification',
  'certification,hdr',
  DEFAULT_QUALITY_BADGE_PREFERENCES.join(','),
] as const;
const RING_PRIORITY_CASES = ['tomatoes,metacritic,imdb', 'imdb,tmdb'] as const;
const HEX_COLOR_CASES = ['#111111', '#22d3ee', '#f97316'] as const;
const DYNAMIC_STOP_CASES = [
  '0:#111111,50:#777777,100:#ffffff',
  '0:#7f1d1d,40:#dc2626,60:#f59e0b,75:#84cc16,85:#16a34a',
] as const;
const PROVIDER_APPEARANCE_CASES = [
  'trakt.7c3aed.118.86.74.logo.0.86',
  'imdb.facc15.100.92.100.badge.1.100',
] as const;
const QUALITY_BADGE_APPEARANCE_CASES = [
  '{"hdr":{"iconUrl":"https://example.com/hdr.svg"}}',
  '{"certification":{"iconUrl":"data:image/svg+xml;base64,PHN2Zy8+"}}',
] as const;
const STREAM_BADGE_VALUES = ['auto', 'on', 'off'] as const;
const POSTER_QUALITY_POSITION_VALUES = ['auto', 'left', 'right'] as const;
const AGE_RATING_POSITION_VALUES = [
  'inherit',
  'grouped',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
  'left-top',
  'left-center',
  'left-bottom',
  'right-top',
  'right-center',
  'right-bottom',
] as const;
const IMAGE_SIZE_VALUES = ['normal', 'large', '4k'] as const;
const RANDOM_POSTER_TEXT_VALUES = ['any', 'text', 'textless'] as const;
const RANDOM_POSTER_LANGUAGE_VALUES = ['any', 'requested', 'fallback'] as const;
const RANDOM_POSTER_FALLBACK_VALUES = ['best', 'original'] as const;
const ARTWORK_SOURCE_VALUES = ['tmdb', 'fanart', 'random', 'blackbar'] as const;
const POSTER_ARTWORK_SOURCE_VALUES = [
  'tmdb',
  'fanart',
  'cinemeta',
  'omdb',
  'random',
  'blackbar',
] as const;
const LOGO_ARTWORK_SOURCE_VALUES = ['tmdb', 'fanart', 'cinemeta', 'random'] as const;
const IMAGE_TEXT_VALUES = ['original', 'clean', 'textless', 'alternative', 'random'] as const;
const EPISODE_ARTWORK_VALUES = ['still', 'series', 'streaming'] as const;
const RATING_VALUE_MODE_VALUES = ['native', 'normalized', 'normalizedclean', 'normalized100'] as const;
const TMDB_ID_SCOPE_VALUES = ['soft', 'strict'] as const;
const LOGO_BACKGROUND_VALUES = ['transparent', 'dark'] as const;
const REMUX_DISPLAY_VALUES = ['composite', 'separate'] as const;
const QUALITY_BADGES_SIDE_VALUES = ['left', 'right'] as const;

const ratingStyleValues = RATING_STYLE_OPTIONS.map((option) => option.id);
const iconShapeValues = ICON_SHAPE_OPTIONS.map((option) => option.id);
const qualityBadgeStyleValues = QUALITY_BADGE_STYLE_OPTIONS.map((option) => option.id);
const communityBadgeThemeValues = COMMUNITY_BADGE_THEME_OPTIONS.map((option) => option.id);
const genreBadgeModeValues = GENRE_BADGE_MODE_OPTIONS.map((option) => option.id);
const genreBadgeStyleValues = GENRE_BADGE_STYLE_OPTIONS.map((option) => option.id);
const genreBadgePositionValues = GENRE_BADGE_POSITION_OPTIONS.map((option) => option.id);
const genreBadgeAnimeGroupingValues = ['split', 'animation', 'secondary'] as const;
const ratingPresentationValues = RATING_PRESENTATION_OPTIONS.map((option) => option.id);
const aggregateRatingSourceValues = AGGREGATE_RATING_SOURCE_OPTIONS.map((option) => option.id);
const aggregateAccentModeValues = AGGREGATE_ACCENT_MODE_OPTIONS.map((option) => option.id);
const posterLayoutValues = POSTER_RATING_LAYOUT_OPTIONS.map((option) => option.id);
const backdropLayoutValues = BACKDROP_RATING_LAYOUT_OPTIONS.map((option) => option.id);
const sideRatingPositionValues = SIDE_RATING_POSITION_OPTIONS.map((option) => option.id);
const ringSourceValues = POSTER_COMPACT_RING_SOURCE_OPTIONS.map((option) => option.id);

const toIntegerRange = (min: number, max: number, omit?: number) => {
  const values: string[] = [];
  for (let current = min; current <= max; current += 1) {
    if (current === omit) {
      continue;
    }
    values.push(String(current));
  }
  return values;
};

const toDecimalTenthsRange = (min: number, max: number, omit?: number) => {
  const values: string[] = [];
  for (let current = Math.round(min * 10); current <= Math.round(max * 10); current += 1) {
    const numeric = current / 10;
    if (omit !== undefined && numeric === omit) {
      continue;
    }
    values.push(numeric.toFixed(1));
  }
  return values;
};

const withType = (type: string, suffix: string) => `${type}${suffix}`;

const buildEntries = () => {
  const entries: ConfigProfileVerificationEntry[] = [
    { key: 'tmdbKey', coverageValues: STRING_CASES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'mdblistKey', coverageValues: STRING_CASES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'xrdbKey', coverageValues: STRING_CASES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'fanartKey', coverageValues: STRING_CASES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'simklClientId', coverageValues: STRING_CASES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'lang', coverageValues: LANGUAGE_CASES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'tmdbIdScope', coverageValues: TMDB_ID_SCOPE_VALUES, browserFamily: 'credentials', surfaces: ['shared'] },
    { key: 'ratings', coverageValues: RATINGS_CASES, browserFamily: 'providers', surfaces: ['shared'] },
    { key: 'genreBadge', coverageValues: genreBadgeModeValues, browserFamily: 'genre-badge', surfaces: ['poster', 'backdrop', 'logo'] },
    { key: 'genreBadgeStyle', coverageValues: genreBadgeStyleValues, browserFamily: 'genre-badge', surfaces: ['poster', 'backdrop', 'logo'] },
    { key: 'genreBadgePosition', coverageValues: genreBadgePositionValues, browserFamily: 'genre-badge', surfaces: ['poster', 'backdrop', 'logo'] },
    { key: 'genreBadgeScale', coverageValues: toIntegerRange(MIN_BADGE_SCALE_PERCENT, MAX_BADGE_SCALE_PERCENT, DEFAULT_BADGE_SCALE_PERCENT), browserFamily: 'genre-badge', surfaces: ['poster', 'backdrop', 'logo'] },
    { key: 'posterGenreBadgeOffsetX', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['poster'] },
    { key: 'posterGenreBadgeOffsetY', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['poster'] },
    { key: 'backdropGenreBadgeOffsetX', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['backdrop'] },
    { key: 'backdropGenreBadgeOffsetY', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['backdrop'] },
    { key: 'thumbnailGenreBadgeOffsetX', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['thumbnail'] },
    { key: 'thumbnailGenreBadgeOffsetY', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['thumbnail'] },
    { key: 'logoGenreBadgeOffsetX', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['logo'] },
    { key: 'logoGenreBadgeOffsetY', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'genre-badge', surfaces: ['logo'] },
    { key: 'genreBadgeAnimeGrouping', coverageValues: genreBadgeAnimeGroupingValues, browserFamily: 'genre-badge', surfaces: ['poster', 'backdrop', 'logo'] },
    { key: 'qualityBadgesSide', coverageValues: QUALITY_BADGES_SIDE_VALUES, requiredParams: { posterRatingsLayout: 'top-bottom' }, browserFamily: 'quality-badge', surfaces: ['poster'] },
    { key: 'posterQualityBadgesPosition', coverageValues: POSTER_QUALITY_POSITION_VALUES, requiredParams: { posterRatingsLayout: 'top' }, browserFamily: 'quality-badge', surfaces: ['poster'] },
    { key: 'posterQualityBadgeOffsetX', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'position', surfaces: ['poster'] },
    { key: 'posterQualityBadgeOffsetY', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'position', surfaces: ['poster'] },
    { key: 'ageRatingBadgePosition', coverageValues: AGE_RATING_POSITION_VALUES, browserFamily: 'quality-badge', surfaces: ['poster'] },
    { key: 'ratingValueMode', coverageValues: RATING_VALUE_MODE_VALUES, browserFamily: 'presentation', surfaces: ['shared'] },
    { key: 'qualityBadgesStyle', coverageValues: qualityBadgeStyleValues, browserFamily: 'quality-badge', surfaces: ['shared-alias'] },
    { key: 'ratingPresentation', coverageValues: ratingPresentationValues, browserFamily: 'presentation', surfaces: ['shared-alias'] },
    { key: 'aggregateRatingSource', coverageValues: aggregateRatingSourceValues, browserFamily: 'presentation', surfaces: ['shared-alias'] },
    { key: 'aggregateAccentMode', coverageValues: aggregateAccentModeValues, browserFamily: 'presentation', surfaces: ['shared'] },
    { key: 'aggregateAccentColor', coverageValues: HEX_COLOR_CASES, requiredParams: { aggregateAccentMode: 'custom' }, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateCriticsAccentColor', coverageValues: HEX_COLOR_CASES, requiredParams: { aggregateAccentMode: 'custom' }, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateAudienceAccentColor', coverageValues: HEX_COLOR_CASES, requiredParams: { aggregateAccentMode: 'custom' }, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateValueColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateCriticsValueColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateAudienceValueColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateDynamicStops', coverageValues: DYNAMIC_STOP_CASES, requiredParams: { aggregateAccentMode: 'dynamic' }, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateAccentBarOffset', coverageValues: toIntegerRange(MIN_AGGREGATE_ACCENT_BAR_OFFSET, MAX_AGGREGATE_ACCENT_BAR_OFFSET, DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET), browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'aggregateAccentBarVisible', coverageValues: ['false'], browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'posterNoBackgroundBadgeOutlineColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'appearance', surfaces: ['poster'] },
    { key: 'posterNoBackgroundBadgeOutlineWidth', coverageValues: toDecimalTenthsRange(MIN_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX, MAX_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX, 0), browserFamily: 'appearance', surfaces: ['poster'] },
    { key: 'ageRatingTileColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'releaseStatusTileColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'qualityBadgesTileAccentColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'networkTileColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'genreBadgeTileAccentColor', coverageValues: HEX_COLOR_CASES, browserFamily: 'genre-badge', surfaces: ['shared'] },
    { key: 'posterIconShape', coverageValues: iconShapeValues, browserFamily: 'appearance', surfaces: ['poster'] },
    { key: 'backdropIconShape', coverageValues: iconShapeValues, browserFamily: 'appearance', surfaces: ['backdrop'] },
    { key: 'thumbnailIconShape', coverageValues: iconShapeValues, browserFamily: 'appearance', surfaces: ['thumbnail'] },
    { key: 'logoIconShape', coverageValues: iconShapeValues, browserFamily: 'appearance', surfaces: ['logo'] },
    { key: 'iconShape', coverageValues: iconShapeValues, browserFamily: 'appearance', surfaces: ['shared'] },
    { key: 'communityBadgeTheme', coverageValues: communityBadgeThemeValues, requiredParams: { qualityBadgesStyle: 'community-badge' }, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'ageRatingBadgeStyle', coverageValues: qualityBadgeStyleValues, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'releaseStatusBadgeStyle', coverageValues: qualityBadgeStyleValues, browserFamily: 'quality-badge', surfaces: ['shared'] },
    { key: 'ratingXOffsetPillGlass', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'offset', surfaces: ['shared'] },
    { key: 'ratingYOffsetPillGlass', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'offset', surfaces: ['shared'] },
    { key: 'ratingXOffsetSquare', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'offset', surfaces: ['shared'] },
    { key: 'ratingYOffsetSquare', coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX), browserFamily: 'offset', surfaces: ['shared'] },
    { key: 'posterRatingsLayout', coverageValues: posterLayoutValues, browserFamily: 'layout', surfaces: ['poster'] },
    { key: 'posterRatingsMax', coverageValues: ['1', '5', '20'], browserFamily: 'limits', surfaces: ['poster'] },
    { key: 'posterRatingsMaxPerSide', coverageValues: toIntegerRange(POSTER_RATINGS_MAX_PER_SIDE_MIN, POSTER_RATINGS_MAX_PER_SIDE_MAX), requiredParams: { posterRatingsLayout: 'left-right' }, browserFamily: 'limits', surfaces: ['poster'] },
    { key: 'posterEdgeOffset', coverageValues: toIntegerRange(MIN_POSTER_EDGE_OFFSET, MAX_POSTER_EDGE_OFFSET, DEFAULT_POSTER_EDGE_OFFSET), browserFamily: 'position', surfaces: ['poster'] },
    { key: 'backdropRatingsLayout', coverageValues: backdropLayoutValues.filter((value) => value !== 'center'), browserFamily: 'layout', surfaces: ['backdrop'] },
    { key: 'backdropRatingsMax', coverageValues: ['1', '5', '20'], browserFamily: 'limits', surfaces: ['backdrop'] },
    { key: 'posterSideRatingsPosition', coverageValues: sideRatingPositionValues.filter((value) => value !== DEFAULT_SIDE_RATING_POSITION), requiredParams: { posterRatingsLayout: 'left' }, browserFamily: 'position', surfaces: ['poster'] },
    { key: 'posterSideRatingsOffset', coverageValues: toIntegerRange(0, 100, DEFAULT_SIDE_RATING_OFFSET), requiredParams: { posterRatingsLayout: 'left', posterSideRatingsPosition: 'custom' }, browserFamily: 'position', surfaces: ['poster'] },
    { key: 'backdropSideRatingsPosition', coverageValues: sideRatingPositionValues.filter((value) => value !== DEFAULT_SIDE_RATING_POSITION), requiredParams: { backdropRatingsLayout: 'right-vertical' }, browserFamily: 'position', surfaces: ['backdrop'] },
    { key: 'backdropSideRatingsOffset', coverageValues: toIntegerRange(0, 100, DEFAULT_SIDE_RATING_OFFSET), requiredParams: { backdropRatingsLayout: 'right-vertical', backdropSideRatingsPosition: 'custom' }, browserFamily: 'position', surfaces: ['backdrop'] },
    { key: 'sideRatingsPosition', coverageValues: sideRatingPositionValues, browserFamily: 'position', surfaces: ['legacy-alias'] },
    { key: 'sideRatingsOffset', coverageValues: toIntegerRange(0, 100), requiredParams: { sideRatingsPosition: 'custom' }, browserFamily: 'position', surfaces: ['legacy-alias'] },
  ];

  for (const key of ['posterRatings', 'backdropRatings', 'thumbnailRatings', 'logoRatings']) {
    entries.push({
      key,
      coverageValues: RATINGS_CASES,
      browserFamily: 'providers',
      surfaces: [key.replace('Ratings', '').toLowerCase()],
    });
  }

  for (const key of ['posterImageSize', 'backdropImageSize']) {
    entries.push({
      key,
      coverageValues: IMAGE_SIZE_VALUES,
      browserFamily: 'artwork',
      surfaces: [key.startsWith('poster') ? 'poster' : 'backdrop'],
    });
  }

  for (const key of ['randomPosterText', 'randomPosterLanguage', 'randomPosterFallback']) {
    const coverageValues = key === 'randomPosterText'
      ? RANDOM_POSTER_TEXT_VALUES
      : key === 'randomPosterLanguage'
        ? RANDOM_POSTER_LANGUAGE_VALUES
        : RANDOM_POSTER_FALLBACK_VALUES;
    entries.push({ key, coverageValues, browserFamily: 'artwork', surfaces: ['poster'] });
  }

  for (const key of [
    'randomPosterMinVoteCount',
    'randomPosterMinVoteAverage',
    'randomPosterMinWidth',
    'randomPosterMinHeight',
  ]) {
    entries.push({ key, coverageValues: ['1', '50', '100'], browserFamily: 'artwork', surfaces: ['poster'] });
  }

  for (const key of [
    'posterGenreBadgeBorderWidth',
    'backdropGenreBadgeBorderWidth',
    'thumbnailGenreBadgeBorderWidth',
    'logoGenreBadgeBorderWidth',
  ]) {
    entries.push({
      key,
      coverageValues: toDecimalTenthsRange(MIN_GENRE_BADGE_BORDER_WIDTH_PX, MAX_GENRE_BADGE_BORDER_WIDTH_PX),
      browserFamily: 'genre-badge',
      surfaces: [key.replace('GenreBadgeBorderWidth', '').toLowerCase()],
    });
  }

  for (const key of [
    'posterGenreBadgeBackgroundOpacity',
    'backdropGenreBadgeBackgroundOpacity',
    'thumbnailGenreBadgeBackgroundOpacity',
    'logoGenreBadgeBackgroundOpacity',
  ]) {
    entries.push({
      key,
      coverageValues: toIntegerRange(
        MIN_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
        MAX_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
      ),
      browserFamily: 'genre-badge',
      surfaces: [key.replace('GenreBadgeBackgroundOpacity', '').toLowerCase()],
    });
  }

  for (const type of ['poster', 'backdrop', 'thumbnail', 'logo']) {
    entries.push({ key: withType(type, 'RatingStyle'), coverageValues: ratingStyleValues, browserFamily: 'presentation', surfaces: [type] });
    entries.push({ key: withType(type, 'RatingPresentation'), coverageValues: ratingPresentationValues, browserFamily: 'presentation', surfaces: [type] });
    entries.push({ key: withType(type, 'AggregateRatingSource'), coverageValues: aggregateRatingSourceValues, browserFamily: 'presentation', surfaces: [type] });
    entries.push({ key: withType(type, 'AggregateProviderWeights'), coverageValues: ['imdb:50', 'imdb:50,tmdb:30'], browserFamily: 'presentation', surfaces: [type] });
    entries.push({ key: withType(type, 'RatingBadgeScale'), coverageValues: toIntegerRange(MIN_BADGE_SCALE_PERCENT, MAX_BADGE_SCALE_PERCENT, DEFAULT_BADGE_SCALE_PERCENT), browserFamily: 'appearance', surfaces: [type] });
    entries.push({ key: withType(type, 'QualityBadgeScale'), coverageValues: toIntegerRange(MIN_BADGE_SCALE_PERCENT, MAX_BADGE_SCALE_PERCENT, DEFAULT_BADGE_SCALE_PERCENT), browserFamily: 'appearance', surfaces: [type] });
    entries.push({ key: withType(type, 'QualityBadgesStyle'), coverageValues: qualityBadgeStyleValues, browserFamily: 'quality-badge', surfaces: [type] });
    entries.push({ key: withType(type, 'QualityBadgesMax'), coverageValues: ['1', '5', '20'], browserFamily: 'limits', surfaces: [type] });
    entries.push({ key: withType(type, 'RemuxDisplayMode'), coverageValues: REMUX_DISPLAY_VALUES, browserFamily: 'quality-badge', surfaces: [type] });
    entries.push({ key: withType(type, 'QualityBadges'), coverageValues: QUALITY_BADGE_CASES, browserFamily: 'quality-badge', surfaces: [type] });
  }

  for (const type of ['poster', 'backdrop', 'thumbnail']) {
    entries.push({ key: withType(type, 'ImageText'), coverageValues: IMAGE_TEXT_VALUES, browserFamily: 'artwork', surfaces: [type] });
  }

  for (const type of ['poster', 'backdrop', 'thumbnail', 'logo']) {
    entries.push({ key: withType(type, 'StreamBadges'), coverageValues: STREAM_BADGE_VALUES, browserFamily: 'quality-badge', surfaces: [type] });
  }

  for (const type of ['poster', 'backdrop', 'thumbnail', 'logo']) {
    const artworkValues = type === 'poster'
      ? POSTER_ARTWORK_SOURCE_VALUES
      : type === 'logo'
        ? LOGO_ARTWORK_SOURCE_VALUES
        : ARTWORK_SOURCE_VALUES;
    entries.push({ key: withType(type, 'ArtworkSource'), coverageValues: artworkValues, browserFamily: 'artwork', surfaces: [type] });
  }

  for (const type of ['poster', 'backdrop', 'logo']) {
    entries.push({ key: withType(type, 'GenreBadge'), coverageValues: genreBadgeModeValues, browserFamily: 'genre-badge', surfaces: [type] });
    entries.push({ key: withType(type, 'GenreBadgeStyle'), coverageValues: genreBadgeStyleValues, browserFamily: 'genre-badge', surfaces: [type] });
    entries.push({ key: withType(type, 'GenreBadgePosition'), coverageValues: genreBadgePositionValues, browserFamily: 'genre-badge', surfaces: [type] });
    entries.push({ key: withType(type, 'GenreBadgeScale'), coverageValues: toIntegerRange(MIN_BADGE_SCALE_PERCENT, MAX_BADGE_SCALE_PERCENT, DEFAULT_BADGE_SCALE_PERCENT), browserFamily: 'genre-badge', surfaces: [type] });
    entries.push({ key: withType(type, 'GenreBadgeAnimeGrouping'), coverageValues: genreBadgeAnimeGroupingValues, browserFamily: 'genre-badge', surfaces: [type] });
  }

  for (const key of ['thumbnailGenreBadge', 'thumbnailGenreBadgeStyle', 'thumbnailGenreBadgePosition', 'thumbnailGenreBadgeScale', 'thumbnailGenreBadgeAnimeGrouping']) {
    const coverageValues = key.endsWith('Style')
      ? genreBadgeStyleValues
      : key.endsWith('Position')
        ? genreBadgePositionValues
        : key.endsWith('Scale')
          ? toIntegerRange(MIN_BADGE_SCALE_PERCENT, MAX_BADGE_SCALE_PERCENT, DEFAULT_BADGE_SCALE_PERCENT)
          : key.endsWith('AnimeGrouping')
            ? genreBadgeAnimeGroupingValues
            : genreBadgeModeValues;
    entries.push({ key, coverageValues, browserFamily: 'genre-badge', surfaces: ['thumbnail'] });
  }

  for (const key of ['thumbnailEpisodeArtwork', 'backdropEpisodeArtwork']) {
    entries.push({ key, coverageValues: EPISODE_ARTWORK_VALUES, browserFamily: 'artwork', surfaces: [key.startsWith('thumbnail') ? 'thumbnail' : 'backdrop'] });
  }

  for (const key of ['posterRingValueSource', 'posterRingProgressSource']) {
    entries.push({ key, coverageValues: ringSourceValues, browserFamily: 'presentation', surfaces: ['poster'] });
  }

  entries.push({
    key: 'posterRingCenterOpacity',
    coverageValues: toIntegerRange(0, 100, DEFAULT_POSTER_COMPACT_RING_CENTER_OPACITY_PERCENT),
    browserFamily: 'presentation',
    surfaces: ['poster'],
  });

  for (const key of ['posterRingCriticsPriority', 'posterRingAudiencePriority']) {
    entries.push({ key, coverageValues: RING_PRIORITY_CASES, browserFamily: 'presentation', surfaces: ['poster'] });
  }

  for (const key of [
    'posterRatingXOffsetPillGlass',
    'posterRatingYOffsetPillGlass',
    'backdropRatingXOffsetPillGlass',
    'backdropRatingYOffsetPillGlass',
    'thumbnailRatingXOffsetPillGlass',
    'thumbnailRatingYOffsetPillGlass',
    'posterRatingXOffsetSquare',
    'posterRatingYOffsetSquare',
    'backdropRatingXOffsetSquare',
    'backdropRatingYOffsetSquare',
    'thumbnailRatingXOffsetSquare',
    'thumbnailRatingYOffsetSquare',
  ]) {
    entries.push({
      key,
      coverageValues: toIntegerRange(MIN_RATING_STACK_OFFSET_PX, MAX_RATING_STACK_OFFSET_PX, DEFAULT_RATING_STACK_OFFSET_PX),
      browserFamily: 'offset',
      surfaces: [key.startsWith('poster') ? 'poster' : key.startsWith('backdrop') ? 'backdrop' : 'thumbnail'],
    });
  }

  entries.push({ key: 'thumbnailRatingsLayout', coverageValues: backdropLayoutValues.filter((value) => value !== 'center'), browserFamily: 'layout', surfaces: ['thumbnail'] });
  entries.push({ key: 'thumbnailRatingsMax', coverageValues: ['1', '5', '20'], browserFamily: 'limits', surfaces: ['thumbnail'] });
  entries.push({ key: 'thumbnailBottomRatingsRow', coverageValues: ['true'], browserFamily: 'layout', surfaces: ['thumbnail'] });
  entries.push({ key: 'backdropBottomRatingsRow', coverageValues: ['true'], browserFamily: 'layout', surfaces: ['backdrop'] });
  entries.push({ key: 'thumbnailSideRatingsPosition', coverageValues: sideRatingPositionValues.filter((value) => value !== DEFAULT_SIDE_RATING_POSITION), requiredParams: { thumbnailRatingsLayout: 'right-vertical' }, browserFamily: 'position', surfaces: ['thumbnail'] });
  entries.push({ key: 'thumbnailSideRatingsOffset', coverageValues: toIntegerRange(0, 100, DEFAULT_SIDE_RATING_OFFSET), requiredParams: { thumbnailRatingsLayout: 'right-vertical', thumbnailSideRatingsPosition: 'custom' }, browserFamily: 'position', surfaces: ['thumbnail'] });
  entries.push({ key: 'logoRatingsMax', coverageValues: ['1', '5', '20'], browserFamily: 'limits', surfaces: ['logo'] });
  entries.push({ key: 'logoBackground', coverageValues: LOGO_BACKGROUND_VALUES, browserFamily: 'artwork', surfaces: ['logo'] });
  entries.push({ key: 'logoBottomRatingsRow', coverageValues: ['true'], browserFamily: 'layout', surfaces: ['logo'] });
  entries.push({ key: 'providerAppearance', coverageValues: PROVIDER_APPEARANCE_CASES, browserFamily: 'appearance', surfaces: ['shared'] });
  entries.push({ key: 'qualityBadgeAppearance', coverageValues: QUALITY_BADGE_APPEARANCE_CASES, browserFamily: 'appearance', surfaces: ['shared'] });

  return entries.sort((left, right) => left.key.localeCompare(right.key));
};

export const CONFIG_PROFILE_VERIFICATION_ENTRIES = buildEntries();

export const CONFIG_PROFILE_INTERACTION_CASES: ConfigProfileInteractionCase[] = [
  {
    id: 'poster-quality-badges-position-includes-for-supported-side-layouts',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', posterRatingsLayout: 'left', posterQualityBadgesPosition: 'right' },
    expectedIncludedKeys: ['posterRatingsLayout', 'posterQualityBadgesPosition'],
  },
  {
    id: 'poster-quality-badges-position-omits-for-top-bottom-layouts',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', posterRatingsLayout: 'top-bottom', posterQualityBadgesPosition: 'right' },
    expectedIncludedKeys: ['posterRatingsLayout'],
    expectedOmittedKeys: ['posterQualityBadgesPosition'],
  },
  {
    id: 'quality-badges-side-omits-unless-top-bottom',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', posterRatingsLayout: 'top', qualityBadgesSide: 'right' },
    expectedIncludedKeys: ['posterRatingsLayout'],
    expectedOmittedKeys: ['qualityBadgesSide'],
  },
  {
    id: 'poster-ratings-max-per-side-omits-unless-vertical',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', posterRatingsLayout: 'top-bottom', posterRatingsMaxPerSide: '7' },
    expectedIncludedKeys: ['posterRatingsLayout'],
    expectedOmittedKeys: ['posterRatingsMaxPerSide'],
  },
  {
    id: 'backdrop-layout-omits-when-bottom-row-enabled',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', backdropBottomRatingsRow: 'true', backdropRatingsLayout: 'right-vertical' },
    expectedIncludedKeys: ['backdropBottomRatingsRow'],
    expectedOmittedKeys: ['backdropRatingsLayout'],
  },
  {
    id: 'thumbnail-layout-omits-when-bottom-row-enabled',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', thumbnailBottomRatingsRow: 'true', thumbnailRatingsLayout: 'right-vertical' },
    expectedIncludedKeys: ['thumbnailBottomRatingsRow'],
    expectedOmittedKeys: ['thumbnailRatingsLayout'],
  },
  {
    id: 'thumbnail-side-offset-omits-unless-custom',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', thumbnailRatingsLayout: 'right-vertical', thumbnailSideRatingsPosition: 'top', thumbnailSideRatingsOffset: '72' },
    expectedIncludedKeys: ['thumbnailRatingsLayout'],
    expectedOmittedKeys: ['thumbnailSideRatingsOffset'],
  },
  {
    id: 'thumbnail-side-offset-persists-when-custom',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', thumbnailRatingsLayout: 'right-vertical', thumbnailSideRatingsPosition: 'custom', thumbnailSideRatingsOffset: '72' },
    expectedIncludedKeys: ['thumbnailRatingsLayout', 'thumbnailSideRatingsPosition', 'thumbnailSideRatingsOffset'],
  },
  {
    id: 'aggregate-accent-color-omits-unless-custom',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', aggregateAccentMode: 'source', aggregateAccentColor: '#a78bfa' },
    expectedIncludedKeys: [],
    expectedOmittedKeys: ['aggregateAccentColor'],
  },
  {
    id: 'aggregate-dynamic-stops-omits-unless-dynamic',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', aggregateAccentMode: 'source', aggregateDynamicStops: '0:#7f1d1d,40:#dc2626,60:#f59e0b,75:#84cc16,85:#16a34a' },
    expectedIncludedKeys: [],
    expectedOmittedKeys: ['aggregateDynamicStops'],
  },
  {
    id: 'bug-81-thumbnail-position-persists',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', thumbnailRatingsLayout: 'right-vertical', thumbnailSideRatingsPosition: 'custom', thumbnailSideRatingsOffset: '61' },
    expectedIncludedKeys: ['thumbnailRatingsLayout', 'thumbnailSideRatingsPosition', 'thumbnailSideRatingsOffset'],
  },
  {
    id: 'bug-81-poster-offset-persists',
    params: { tmdbKey: 'tmdb', mdblistKey: 'mdb', posterRatingStyle: 'glass', posterRatingXOffsetPillGlass: '24', posterRatingYOffsetPillGlass: '-16' },
    expectedIncludedKeys: ['posterRatingStyle', 'posterRatingXOffsetPillGlass', 'posterRatingYOffsetPillGlass'],
  },
];

export const CONFIG_PROFILE_BROWSER_CASES = [
  { id: 'poster-rating-offset', previewType: 'poster', browserFamily: 'offset' },
  { id: 'backdrop-layout', previewType: 'backdrop', browserFamily: 'layout' },
  { id: 'thumbnail-side-position', previewType: 'thumbnail', browserFamily: 'position' },
  { id: 'logo-background', previewType: 'logo', browserFamily: 'artwork' },
] as const;

export const getConfigProfileVerificationEntry = (key: string) =>
  CONFIG_PROFILE_VERIFICATION_ENTRIES.find((entry) => entry.key === key) ?? null;

export const getConfigProfileVerificationValues = (key: string) =>
  getConfigProfileVerificationEntry(key)?.coverageValues ?? [];
