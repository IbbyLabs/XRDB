import { useCallback, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_BACKDROP_GENRE_BADGE_BORDER_WIDTH_PX,
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_COLOR,
  DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  DEFAULT_LOGO_GENRE_BADGE_BORDER_WIDTH_PX,
  DEFAULT_POSTER_GENRE_BADGE_BORDER_WIDTH_PX,
  DEFAULT_THUMBNAIL_GENRE_BADGE_BORDER_WIDTH_PX,
  QUALITY_BADGE_OPTIONS,
  type RatingProviderAppearanceOverrides,
  type QualityBadgeAppearanceOverrides,
} from '@/lib/badgeCustomization';
import { DEFAULT_BACKDROP_RATING_LAYOUT, type BackdropRatingLayout } from '@/lib/backdropLayoutOptions';
import { DEFAULT_CONFIGURATOR_EXPERIENCE_MODE, type ConfiguratorExperienceMode, type ConfiguratorPresetId } from '@/lib/configuratorPresets';
import { DEFAULT_METADATA_TRANSLATION_MODE, type MetadataTranslationMode } from '@/lib/metadataTranslation';
import { type ProxyCatalogRule } from '@/lib/proxyCatalogRules';
import {
  DEFAULT_EPISODE_ID_MODE,
  THUMBNAIL_RATING_PREFERENCES,
  filterThumbnailRatingPreferences,
  type EpisodeIdMode,
} from '@/lib/episodeIdentity';
import {
  DEFAULT_GENRE_BADGE_ANIME_GROUPING,
  DEFAULT_GENRE_BADGE_MODE,
  DEFAULT_GENRE_BADGE_POSITION,
  DEFAULT_GENRE_BADGE_STYLE,
  type GenreBadgeAnimeGrouping,
  type GenreBadgeMode,
  type GenreBadgePosition,
  type GenreBadgeStyle,
} from '@/lib/genreBadge';
import { DEFAULT_POSTER_EDGE_OFFSET } from '@/lib/posterEdgeOffset';
import { DEFAULT_RATING_STACK_OFFSET_PX } from '@/lib/ratingStackOffset';
import { buildDefaultRatingRows, enabledOrderedToRows, rowsToEnabledOrdered, type RatingProviderRow } from '@/lib/ratingProviderRows';
import {
  AGGREGATE_RATING_SOURCE_ACCENTS,
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  DEFAULT_AGGREGATE_ACCENT_COLOR,
  DEFAULT_AGGREGATE_ACCENT_MODE,
  DEFAULT_AGGREGATE_DYNAMIC_STOPS,
  DEFAULT_AGGREGATE_RATING_SOURCE,
  DEFAULT_AGGREGATE_VALUE_COLOR,
  DEFAULT_RATING_PRESENTATION,
  DEFAULT_AGGREGATE_PROVIDER_WEIGHTS,
  type AggregateAccentMode,
  type AggregateProviderWeights,
  type AggregateRatingSource,
  type RatingPresentation,
} from '@/lib/ratingPresentation';
import {
  DEFAULT_POSTER_COMPACT_RING_AUDIENCE_PRIORITY,
  DEFAULT_POSTER_COMPACT_RING_CENTER_OPACITY_PERCENT,
  DEFAULT_POSTER_COMPACT_RING_CRITICS_PRIORITY,
  DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
  DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
  type PosterCompactRingSource,
} from '@/lib/posterCompactRing';
import { DEFAULT_RATING_VALUE_MODE, type RatingValueMode } from '@/lib/ratingDisplay';
import { DEFAULT_POSTER_RATINGS_MAX_PER_SIDE, type PosterRatingLayout } from '@/lib/posterLayoutOptions';
import { type RatingPreference } from '@/lib/ratingProviderCatalog';
import { type RemuxDisplayMode } from '@/lib/mediaFeatures';
import { DEFAULT_ICON_SHAPE, DEFAULT_QUALITY_BADGES_STYLE, DEFAULT_RATING_STYLE, type IconShape, type QualityBadgeStyle, type RatingStyle } from '@/lib/ratingAppearance';
import { DEFAULT_COMMUNITY_BADGE_THEME, type CommunityBadgeTheme } from '@/lib/communityBadgeTheme';
import { DEFAULT_SIDE_RATING_OFFSET, type SideRatingPosition } from '@/lib/sideRatingPosition';
import {
  DEFAULT_SCOREBAR_STYLE,
  DEFAULT_SCOREBAR_LOW_COLOR,
  DEFAULT_SCOREBAR_MID_COLOR,
  DEFAULT_SCOREBAR_HIGH_COLOR,
  DEFAULT_SCOREBAR_LOW_THRESHOLD,
  DEFAULT_SCOREBAR_HIGH_THRESHOLD,
  type ScorebarStyle,
} from '@/lib/scorebarConfig';
import {
  DEFAULT_AIOMETADATA_EPISODE_ID_MODE,
  type AiometadataEpisodeIdMode,
  type AgeRatingBadgePosition,
  type ArtworkSource,
  type BackdropImageSize,
  type BackdropImageTextPreference,
  type EpisodeArtworkMode,
  type LogoBackground,
  type PosterImageSize,
  type PosterImageTextPreference,
  type PosterQualityBadgesPosition,
  type RandomPosterFallbackMode,
  type RandomPosterLanguageMode,
  type RandomPosterTextMode,
  type ProxyMediaType,
  type QualityBadgesSide,
  type StreamBadgesSetting,
  type TmdbIdScopeMode,
} from '@/lib/uiConfig';
import { SAMPLE_GENRE_BADGE_MODE_DEFAULT } from '@/lib/configuratorPageOptions';

type ProxyType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type WorkspaceCenterView = 'showcase' | 'preview' | 'guide';

export function useConfiguratorWorkspaceState() {
  const [previewType, setPreviewTypeState] = useState<ProxyType>('poster');
  const previewTypeRef = useRef<ProxyType>('poster');
  const setPreviewType = useCallback((value: ProxyType | ((prev: ProxyType) => ProxyType)) => {
    if (typeof value === 'function') {
      setPreviewTypeState((prev) => {
        const next = value(prev);
        previewTypeRef.current = next;
        return next;
      });
      return;
    }
    previewTypeRef.current = value;
    setPreviewTypeState(value);
  }, []);
  const [mediaId, setMediaId] = useState('tt0133093');
  const [lang, setLang] = useState('en');
  const [posterImageSize, setPosterImageSize] = useState<PosterImageSize>('normal');
  const [backdropImageSize, setBackdropImageSize] = useState<BackdropImageSize>('normal');
  const [randomPosterText, setRandomPosterText] = useState<RandomPosterTextMode>('any');
  const [randomPosterLanguage, setRandomPosterLanguage] = useState<RandomPosterLanguageMode>('any');
  const [randomPosterMinVoteCount, setRandomPosterMinVoteCount] = useState<number | null>(null);
  const [randomPosterMinVoteAverage, setRandomPosterMinVoteAverage] = useState<number | null>(null);
  const [randomPosterMinWidth, setRandomPosterMinWidth] = useState<number | null>(null);
  const [randomPosterMinHeight, setRandomPosterMinHeight] = useState<number | null>(null);
  const [randomPosterFallback, setRandomPosterFallback] = useState<RandomPosterFallbackMode>('best');
  const [posterImageText, setPosterImageText] = useState<PosterImageTextPreference>('clean');
  const [backdropImageText, setBackdropImageText] = useState<BackdropImageTextPreference>('clean');
  const [thumbnailImageText, setThumbnailImageText] = useState<BackdropImageTextPreference>('clean');
  const [posterArtworkSource, setPosterArtworkSource] = useState<ArtworkSource>('tmdb');
  const [backdropArtworkSource, setBackdropArtworkSource] = useState<ArtworkSource>('tmdb');
  const [thumbnailArtworkSource, setThumbnailArtworkSource] = useState<ArtworkSource>('tmdb');
  const [posterRatingBlackStripEnabled, setPosterRatingBlackStripEnabled] = useState(false);
  const [backdropRatingBlackStripEnabled, setBackdropRatingBlackStripEnabled] = useState(false);
  const [thumbnailRatingBlackStripEnabled, setThumbnailRatingBlackStripEnabled] = useState(false);
  const [thumbnailEpisodeArtwork, setThumbnailEpisodeArtwork] = useState<EpisodeArtworkMode>('still');
  const [backdropEpisodeArtwork, setBackdropEpisodeArtwork] = useState<EpisodeArtworkMode>('series');
  const [posterRatingValueMode, setPosterRatingValueMode] = useState<RatingValueMode>(DEFAULT_RATING_VALUE_MODE);
  const [backdropRatingValueMode, setBackdropRatingValueMode] = useState<RatingValueMode>(DEFAULT_RATING_VALUE_MODE);
  const [thumbnailRatingValueMode, setThumbnailRatingValueMode] = useState<RatingValueMode>(DEFAULT_RATING_VALUE_MODE);
  const [logoRatingValueMode, setLogoRatingValueMode] = useState<RatingValueMode>(DEFAULT_RATING_VALUE_MODE);
  const [posterGenreBadgeMode, setPosterGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [backdropGenreBadgeMode, setBackdropGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [thumbnailGenreBadgeMode, setThumbnailGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [logoGenreBadgeMode, setLogoGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [posterGenreBadgeStyle, setPosterGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [backdropGenreBadgeStyle, setBackdropGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [thumbnailGenreBadgeStyle, setThumbnailGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [logoGenreBadgeStyle, setLogoGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [posterGenreBadgePosition, setPosterGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [backdropGenreBadgePosition, setBackdropGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [thumbnailGenreBadgePosition, setThumbnailGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [logoGenreBadgePosition, setLogoGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [posterGenreBadgeScale, setPosterGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [backdropGenreBadgeScale, setBackdropGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [thumbnailGenreBadgeScale, setThumbnailGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [logoGenreBadgeScale, setLogoGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [posterGenreBadgeOffsetX, setPosterGenreBadgeOffsetX] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterGenreBadgeOffsetY, setPosterGenreBadgeOffsetY] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [backdropGenreBadgeOffsetX, setBackdropGenreBadgeOffsetX] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [backdropGenreBadgeOffsetY, setBackdropGenreBadgeOffsetY] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [thumbnailGenreBadgeOffsetX, setThumbnailGenreBadgeOffsetX] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [thumbnailGenreBadgeOffsetY, setThumbnailGenreBadgeOffsetY] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [logoGenreBadgeOffsetX, setLogoGenreBadgeOffsetX] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [logoGenreBadgeOffsetY, setLogoGenreBadgeOffsetY] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterGenreBadgeBorderWidth, setPosterGenreBadgeBorderWidth] = useState<number>(
    DEFAULT_POSTER_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const [backdropGenreBadgeBorderWidth, setBackdropGenreBadgeBorderWidth] = useState<number>(
    DEFAULT_BACKDROP_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const [thumbnailGenreBadgeBorderWidth, setThumbnailGenreBadgeBorderWidth] = useState<number>(
    DEFAULT_THUMBNAIL_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const [logoGenreBadgeBorderWidth, setLogoGenreBadgeBorderWidth] = useState<number>(
    DEFAULT_LOGO_GENRE_BADGE_BORDER_WIDTH_PX,
  );
  const [posterGenreBadgeBackgroundOpacity, setPosterGenreBadgeBackgroundOpacity] = useState<number>(
    DEFAULT_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  );
  const [backdropGenreBadgeBackgroundOpacity, setBackdropGenreBadgeBackgroundOpacity] = useState<number>(
    DEFAULT_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  );
  const [thumbnailGenreBadgeBackgroundOpacity, setThumbnailGenreBadgeBackgroundOpacity] = useState<number>(
    DEFAULT_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  );
  const [logoGenreBadgeBackgroundOpacity, setLogoGenreBadgeBackgroundOpacity] = useState<number>(
    DEFAULT_GENRE_BADGE_BACKGROUND_OPACITY_PERCENT,
  );
  const [posterGenreBadgeAnimeGrouping, setPosterGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [backdropGenreBadgeAnimeGrouping, setBackdropGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [thumbnailGenreBadgeAnimeGrouping, setThumbnailGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [logoGenreBadgeAnimeGrouping, setLogoGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [genrePreviewMode, setGenrePreviewMode] = useState<GenreBadgeMode>(SAMPLE_GENRE_BADGE_MODE_DEFAULT);
  const [posterRatingRows, setPosterRatingRows] = useState<RatingProviderRow[]>(buildDefaultRatingRows);
  const [backdropRatingRows, setBackdropRatingRows] = useState<RatingProviderRow[]>(buildDefaultRatingRows);
  const [thumbnailRatingRows, setThumbnailRatingRows] = useState<RatingProviderRow[]>(enabledOrderedToRows([...THUMBNAIL_RATING_PREFERENCES]));
  const [logoRatingRows, setLogoRatingRows] = useState<RatingProviderRow[]>(buildDefaultRatingRows);
  const [posterStreamBadges, setPosterStreamBadges] = useState<StreamBadgesSetting>('auto');
  const [backdropStreamBadges, setBackdropStreamBadges] = useState<StreamBadgesSetting>('auto');
  const [thumbnailStreamBadges, setThumbnailStreamBadges] = useState<StreamBadgesSetting>('auto');
  const [logoStreamBadges, setLogoStreamBadges] = useState<StreamBadgesSetting>('auto');
  const [qualityBadgesSide, setQualityBadgesSide] = useState<QualityBadgesSide>('left');
  const [posterQualityBadgesPosition, setPosterQualityBadgesPosition] = useState<PosterQualityBadgesPosition>('auto');
  const [posterTrendingTagPosition, setPosterTrendingTagPosition] = useState<
    | 'auto'
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
  >('auto');
  const [posterTrendingTagStylePreset, setPosterTrendingTagStylePreset] = useState<'auto-minimal' | QualityBadgeStyle>('auto-minimal');
  const [posterTrendingCommunityBadgeTheme, setPosterTrendingCommunityBadgeTheme] = useState<CommunityBadgeTheme>(DEFAULT_COMMUNITY_BADGE_THEME);
  const [posterTrendingTagTextColor, setPosterTrendingTagTextColor] = useState<string>('');
  const [posterQualityBadgeOffsetX, setPosterQualityBadgeOffsetX] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterQualityBadgeOffsetY, setPosterQualityBadgeOffsetY] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [ageRatingBadgePosition, setAgeRatingBadgePosition] = useState<AgeRatingBadgePosition>('inherit');
  const [posterQualityBadgesStyle, setPosterQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [backdropQualityBadgesStyle, setBackdropQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [thumbnailQualityBadgesStyle, setThumbnailQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [logoQualityBadgesStyle, setLogoQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [posterQualityBadgePreferences, setPosterQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [backdropQualityBadgePreferences, setBackdropQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [thumbnailQualityBadgePreferences, setThumbnailQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [logoQualityBadgePreferences, setLogoQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [posterQualityBadgesMax, setPosterQualityBadgesMax] = useState<number | null>(null);
  const [backdropQualityBadgesMax, setBackdropQualityBadgesMax] = useState<number | null>(null);
  const [thumbnailQualityBadgesMax, setThumbnailQualityBadgesMax] = useState<number | null>(null);
  const [logoQualityBadgesMax, setLogoQualityBadgesMax] = useState<number | null>(null);
  const [posterRemuxDisplayMode, setPosterRemuxDisplayMode] = useState<RemuxDisplayMode>('composite');
  const [backdropRemuxDisplayMode, setBackdropRemuxDisplayMode] = useState<RemuxDisplayMode>('composite');
  const [thumbnailRemuxDisplayMode, setThumbnailRemuxDisplayMode] = useState<RemuxDisplayMode>('composite');
  const [logoRemuxDisplayMode, setLogoRemuxDisplayMode] = useState<RemuxDisplayMode>('composite');
  const [posterRatingsLayout, setPosterRatingsLayout] = useState<PosterRatingLayout>('bottom');
  const [backdropRatingsLayout, setBackdropRatingsLayout] = useState<BackdropRatingLayout>(DEFAULT_BACKDROP_RATING_LAYOUT);
  const [thumbnailRatingsLayout, setThumbnailRatingsLayout] = useState<BackdropRatingLayout>(DEFAULT_BACKDROP_RATING_LAYOUT);
  const [posterRatingsMax, setPosterRatingsMax] = useState<number | null>(null);
  const [backdropRatingsMax, setBackdropRatingsMax] = useState<number | null>(null);
  const [thumbnailRatingsMax, setThumbnailRatingsMax] = useState<number | null>(null);
  const [backdropBottomRatingsRow, setBackdropBottomRatingsRow] = useState(false);
  const [thumbnailBottomRatingsRow, setThumbnailBottomRatingsRow] = useState(false);
  const [posterEdgeOffset, setPosterEdgeOffset] = useState<number>(DEFAULT_POSTER_EDGE_OFFSET);
  const [posterSideRatingsPosition, setPosterSideRatingsPosition] = useState<SideRatingPosition>('top');
  const [posterSideRatingsOffset, setPosterSideRatingsOffset] = useState<number>(DEFAULT_SIDE_RATING_OFFSET);
  const [backdropSideRatingsPosition, setBackdropSideRatingsPosition] = useState<SideRatingPosition>('top');
  const [backdropSideRatingsOffset, setBackdropSideRatingsOffset] = useState<number>(DEFAULT_SIDE_RATING_OFFSET);
  const [thumbnailSideRatingsPosition, setThumbnailSideRatingsPosition] = useState<SideRatingPosition>('top');
  const [thumbnailSideRatingsOffset, setThumbnailSideRatingsOffset] = useState<number>(DEFAULT_SIDE_RATING_OFFSET);
  const [posterRatingStyle, setPosterRatingStyle] = useState<RatingStyle>(DEFAULT_RATING_STYLE);
  const [backdropRatingStyle, setBackdropRatingStyle] = useState<RatingStyle>(DEFAULT_RATING_STYLE);
  const [thumbnailRatingStyle, setThumbnailRatingStyle] = useState<RatingStyle>(DEFAULT_RATING_STYLE);
  const [logoRatingStyle, setLogoRatingStyle] = useState<RatingStyle>('plain');
  const [posterRatingBadgeScale, setPosterRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [backdropRatingBadgeScale, setBackdropRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [thumbnailRatingBadgeScale, setThumbnailRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [logoRatingBadgeScale, setLogoRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [posterQualityBadgeScale, setPosterQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [backdropQualityBadgeScale, setBackdropQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [thumbnailQualityBadgeScale, setThumbnailQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [logoQualityBadgeScale, setLogoQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [posterRatingPresentation, setPosterRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [backdropRatingPresentation, setBackdropRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [thumbnailRatingPresentation, setThumbnailRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [logoRatingPresentation, setLogoRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [posterAggregateRatingSource, setPosterAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [backdropAggregateRatingSource, setBackdropAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [thumbnailAggregateRatingSource, setThumbnailAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [logoAggregateRatingSource, setLogoAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [posterAggregateProviderWeights, setPosterAggregateProviderWeights] = useState<AggregateProviderWeights>(DEFAULT_AGGREGATE_PROVIDER_WEIGHTS);
  const [backdropAggregateProviderWeights, setBackdropAggregateProviderWeights] = useState<AggregateProviderWeights>(DEFAULT_AGGREGATE_PROVIDER_WEIGHTS);
  const [thumbnailAggregateProviderWeights, setThumbnailAggregateProviderWeights] = useState<AggregateProviderWeights>(DEFAULT_AGGREGATE_PROVIDER_WEIGHTS);
  const [logoAggregateProviderWeights, setLogoAggregateProviderWeights] = useState<AggregateProviderWeights>(DEFAULT_AGGREGATE_PROVIDER_WEIGHTS);
  const [posterRingValueSource, setPosterRingValueSource] = useState<PosterCompactRingSource>(
    DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
  );
  const [posterRingProgressSource, setPosterRingProgressSource] = useState<PosterCompactRingSource>(
    DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
  );
  const [posterRingCenterOpacity, setPosterRingCenterOpacity] = useState<number>(
    DEFAULT_POSTER_COMPACT_RING_CENTER_OPACITY_PERCENT,
  );
  const [posterRingCriticsPriority, setPosterRingCriticsPriority] = useState<RatingPreference[]>(
    [...DEFAULT_POSTER_COMPACT_RING_CRITICS_PRIORITY],
  );
  const [posterRingAudiencePriority, setPosterRingAudiencePriority] = useState<RatingPreference[]>(
    [...DEFAULT_POSTER_COMPACT_RING_AUDIENCE_PRIORITY],
  );
  const [posterAggregateAccentMode, setPosterAggregateAccentMode] = useState<AggregateAccentMode>(DEFAULT_AGGREGATE_ACCENT_MODE);
  const [backdropAggregateAccentMode, setBackdropAggregateAccentMode] = useState<AggregateAccentMode>(DEFAULT_AGGREGATE_ACCENT_MODE);
  const [thumbnailAggregateAccentMode, setThumbnailAggregateAccentMode] = useState<AggregateAccentMode>(DEFAULT_AGGREGATE_ACCENT_MODE);
  const [logoAggregateAccentMode, setLogoAggregateAccentMode] = useState<AggregateAccentMode>(DEFAULT_AGGREGATE_ACCENT_MODE);
  const [posterAggregateAccentColor, setPosterAggregateAccentColor] = useState<string>(DEFAULT_AGGREGATE_ACCENT_COLOR);
  const [backdropAggregateAccentColor, setBackdropAggregateAccentColor] = useState<string>(DEFAULT_AGGREGATE_ACCENT_COLOR);
  const [thumbnailAggregateAccentColor, setThumbnailAggregateAccentColor] = useState<string>(DEFAULT_AGGREGATE_ACCENT_COLOR);
  const [logoAggregateAccentColor, setLogoAggregateAccentColor] = useState<string>(DEFAULT_AGGREGATE_ACCENT_COLOR);
  const [posterAggregateCriticsAccentColor, setPosterAggregateCriticsAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.critics);
  const [backdropAggregateCriticsAccentColor, setBackdropAggregateCriticsAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.critics);
  const [thumbnailAggregateCriticsAccentColor, setThumbnailAggregateCriticsAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.critics);
  const [logoAggregateCriticsAccentColor, setLogoAggregateCriticsAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.critics);
  const [posterAggregateAudienceAccentColor, setPosterAggregateAudienceAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.audience);
  const [backdropAggregateAudienceAccentColor, setBackdropAggregateAudienceAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.audience);
  const [thumbnailAggregateAudienceAccentColor, setThumbnailAggregateAudienceAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.audience);
  const [logoAggregateAudienceAccentColor, setLogoAggregateAudienceAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.audience);
  const [posterAggregateValueColor, setPosterAggregateValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [backdropAggregateValueColor, setBackdropAggregateValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [thumbnailAggregateValueColor, setThumbnailAggregateValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [logoAggregateValueColor, setLogoAggregateValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [posterAggregateCriticsValueColor, setPosterAggregateCriticsValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [backdropAggregateCriticsValueColor, setBackdropAggregateCriticsValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [thumbnailAggregateCriticsValueColor, setThumbnailAggregateCriticsValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [logoAggregateCriticsValueColor, setLogoAggregateCriticsValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [posterAggregateAudienceValueColor, setPosterAggregateAudienceValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [backdropAggregateAudienceValueColor, setBackdropAggregateAudienceValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [thumbnailAggregateAudienceValueColor, setThumbnailAggregateAudienceValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [logoAggregateAudienceValueColor, setLogoAggregateAudienceValueColor] = useState<string>(DEFAULT_AGGREGATE_VALUE_COLOR);
  const [posterAggregateDynamicStops, setPosterAggregateDynamicStops] = useState<string>(DEFAULT_AGGREGATE_DYNAMIC_STOPS);
  const [backdropAggregateDynamicStops, setBackdropAggregateDynamicStops] = useState<string>(DEFAULT_AGGREGATE_DYNAMIC_STOPS);
  const [thumbnailAggregateDynamicStops, setThumbnailAggregateDynamicStops] = useState<string>(DEFAULT_AGGREGATE_DYNAMIC_STOPS);
  const [logoAggregateDynamicStops, setLogoAggregateDynamicStops] = useState<string>(DEFAULT_AGGREGATE_DYNAMIC_STOPS);
  const [posterAggregateAccentBarOffset, setPosterAggregateAccentBarOffset] = useState<number>(DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET);
  const [backdropAggregateAccentBarOffset, setBackdropAggregateAccentBarOffset] = useState<number>(DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET);
  const [thumbnailAggregateAccentBarOffset, setThumbnailAggregateAccentBarOffset] = useState<number>(DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET);
  const [logoAggregateAccentBarOffset, setLogoAggregateAccentBarOffset] = useState<number>(DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET);
  const [posterAggregateAccentBarVisible, setPosterAggregateAccentBarVisible] = useState(true);
  const [backdropAggregateAccentBarVisible, setBackdropAggregateAccentBarVisible] = useState(true);
  const [thumbnailAggregateAccentBarVisible, setThumbnailAggregateAccentBarVisible] = useState(true);
  const [logoAggregateAccentBarVisible, setLogoAggregateAccentBarVisible] = useState(true);
  const [posterNoBackgroundBadgeOutlineColor, setPosterNoBackgroundBadgeOutlineColor] = useState<string>(
    DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_COLOR,
  );
  const [posterNoBackgroundBadgeOutlineWidth, setPosterNoBackgroundBadgeOutlineWidth] = useState<number>(
    DEFAULT_NO_BACKGROUND_BADGE_OUTLINE_WIDTH_PX,
  );
  const [ageRatingTileColor, setAgeRatingTileColor] = useState<string>('');
  const [releaseStatusTileColor, setReleaseStatusTileColor] = useState<string>('');
  const [qualityBadgesTileAccentColor, setQualityBadgesTileAccentColor] = useState<string>('');
  const [networkTileColor, setNetworkTileColor] = useState<string>('');
  const [genreBadgeTileAccentColor, setGenreBadgeTileAccentColor] = useState<string>('');
  const [posterIconShape, setPosterIconShape] = useState<IconShape>(DEFAULT_ICON_SHAPE);
  const [backdropIconShape, setBackdropIconShape] = useState<IconShape>(DEFAULT_ICON_SHAPE);
  const [thumbnailIconShape, setThumbnailIconShape] = useState<IconShape>(DEFAULT_ICON_SHAPE);
  const [logoIconShape, setLogoIconShape] = useState<IconShape>(DEFAULT_ICON_SHAPE);
  const [communityBadgeTheme, setCommunityBadgeTheme] = useState<CommunityBadgeTheme>(DEFAULT_COMMUNITY_BADGE_THEME);
  const [ageRatingBadgeStyle, setAgeRatingBadgeStyle] = useState<QualityBadgeStyle | null>(null);
  const [releaseStatusBadgeStyle, setReleaseStatusBadgeStyle] = useState<QualityBadgeStyle | null>(null);
  const [posterRatingXOffsetPillGlass, setPosterRatingXOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterRatingYOffsetPillGlass, setPosterRatingYOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [backdropRatingXOffsetPillGlass, setBackdropRatingXOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [backdropRatingYOffsetPillGlass, setBackdropRatingYOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [thumbnailRatingXOffsetPillGlass, setThumbnailRatingXOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [thumbnailRatingYOffsetPillGlass, setThumbnailRatingYOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterRatingXOffsetSquare, setPosterRatingXOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterRatingYOffsetSquare, setPosterRatingYOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [backdropRatingXOffsetSquare, setBackdropRatingXOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [backdropRatingYOffsetSquare, setBackdropRatingYOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [thumbnailRatingXOffsetSquare, setThumbnailRatingXOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [thumbnailRatingYOffsetSquare, setThumbnailRatingYOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [ratingXOffsetPillGlass, setRatingXOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [ratingYOffsetPillGlass, setRatingYOffsetPillGlass] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [ratingXOffsetSquare, setRatingXOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [ratingYOffsetSquare, setRatingYOffsetSquare] = useState<number>(DEFAULT_RATING_STACK_OFFSET_PX);
  const [posterRatingsMaxPerSide, setPosterRatingsMaxPerSide] = useState<number | null>(DEFAULT_POSTER_RATINGS_MAX_PER_SIDE);
  const [logoRatingsMax, setLogoRatingsMax] = useState<number | null>(null);
  const [logoBackground, setLogoBackground] = useState<LogoBackground>('transparent');
  const [logoBottomRatingsRow, setLogoBottomRatingsRow] = useState(false);
  const [scorebarStyle, setScorebarStyle] = useState<ScorebarStyle>(DEFAULT_SCOREBAR_STYLE);
  const [scorebarLowColor, setScorebarLowColor] = useState(DEFAULT_SCOREBAR_LOW_COLOR);
  const [scorebarMidColor, setScorebarMidColor] = useState(DEFAULT_SCOREBAR_MID_COLOR);
  const [scorebarHighColor, setScorebarHighColor] = useState(DEFAULT_SCOREBAR_HIGH_COLOR);
  const [scorebarLowThreshold, setScorebarLowThreshold] = useState(DEFAULT_SCOREBAR_LOW_THRESHOLD);
  const [scorebarHighThreshold, setScorebarHighThreshold] = useState(DEFAULT_SCOREBAR_HIGH_THRESHOLD);
  const [logoArtworkSource, setLogoArtworkSource] = useState<ArtworkSource>('tmdb');
  const [ratingProviderAppearanceOverrides, setRatingProviderAppearanceOverrides] = useState<RatingProviderAppearanceOverrides>({});
    const [qualityBadgeAppearanceOverrides, setQualityBadgeAppearanceOverrides] = useState<QualityBadgeAppearanceOverrides>({});
  const [activeProviderEditorId, setActiveProviderEditorId] = useState<RatingPreference>('tmdb');
  const [xrdbKey, setXrdbKey] = useState('');
  const [mdblistKey, setMdblistKey] = useState('');
  const [tmdbKey, setTmdbKey] = useState('');
  const [tmdbIdScope, setTmdbIdScope] = useState<TmdbIdScopeMode>('soft');
  const [fanartKey, setFanartKey] = useState('');
  const [simklClientId, setSimklClientId] = useState('');
  const [proxyManifestUrl, setProxyManifestUrl] = useState('');
  const [proxyTranslateMeta, setProxyTranslateMeta] = useState(false);
  const [proxyTranslateMetaMode, setProxyTranslateMetaMode] = useState<MetadataTranslationMode>(DEFAULT_METADATA_TRANSLATION_MODE);
  const [proxyDebugMetaTranslation, setProxyDebugMetaTranslation] = useState(false);
  const [proxyTypes, setProxyTypes] = useState<ProxyMediaType[]>(['movie', 'series', 'anime']);
  const [proxyCatalogRules, setProxyCatalogRules] = useState<ProxyCatalogRule[]>([]);
  const [showConfigString, setShowConfigString] = useState(false);
  const [showProxyUrl, setShowProxyUrl] = useState(false);
  const [hideAiometadataCredentials, setHideAiometadataCredentials] = useState(true);
  const [posterIdMode, setPosterIdMode] = useState<'auto' | 'tmdb' | 'imdb'>('imdb');
  const [aiometadataEpisodeIdMode, setAiometadataEpisodeIdMode] = useState<AiometadataEpisodeIdMode>(DEFAULT_AIOMETADATA_EPISODE_ID_MODE);
  const [episodeIdMode, setEpisodeIdMode] = useState<EpisodeIdMode>(DEFAULT_EPISODE_ID_MODE);
  const [stickyPreviewEnabled, setStickyPreviewEnabled] = useState(true);
  const [workspaceCenterView, setWorkspaceCenterView] = useState<WorkspaceCenterView>('showcase');
  const [experienceMode, setExperienceMode] = useState<ConfiguratorExperienceMode>(DEFAULT_CONFIGURATOR_EXPERIENCE_MODE);
  const [experienceModeDraft, setExperienceModeDraft] = useState<ConfiguratorExperienceMode>(DEFAULT_CONFIGURATOR_EXPERIENCE_MODE);
  const [showExperienceModal, setShowExperienceModal] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<ConfiguratorPresetId | null>(null);

  const posterRatingPreferences = useMemo(() => rowsToEnabledOrdered(posterRatingRows), [posterRatingRows]);
  const backdropRatingPreferences = useMemo(() => rowsToEnabledOrdered(backdropRatingRows), [backdropRatingRows]);
  const thumbnailRatingPreferences = useMemo(
    () => filterThumbnailRatingPreferences(rowsToEnabledOrdered(thumbnailRatingRows)),
    [thumbnailRatingRows],
  );
  const logoRatingPreferences = useMemo(() => rowsToEnabledOrdered(logoRatingRows), [logoRatingRows]);
  const iconShape =
    previewType === 'poster'
      ? posterIconShape
      : previewType === 'backdrop'
        ? backdropIconShape
        : previewType === 'thumbnail'
          ? thumbnailIconShape
          : logoIconShape;
  const setIconShape = useCallback((value: IconShape | ((prev: IconShape) => IconShape)) => {
    if (previewTypeRef.current === 'poster') {
      setPosterIconShape(value);
      return;
    }
    if (previewTypeRef.current === 'backdrop') {
      setBackdropIconShape(value);
      return;
    }
    if (previewTypeRef.current === 'thumbnail') {
      setThumbnailIconShape(value);
      return;
    }
    setLogoIconShape(value);
  }, []);

  const ratingValueMode =
    previewType === 'poster'
      ? posterRatingValueMode
      : previewType === 'backdrop'
        ? backdropRatingValueMode
        : previewType === 'thumbnail'
          ? thumbnailRatingValueMode
          : logoRatingValueMode;
  const setRatingValueMode = useCallback((value: RatingValueMode | ((prev: RatingValueMode) => RatingValueMode)) => {
    if (previewType === 'poster') {
      setPosterRatingValueMode(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropRatingValueMode(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailRatingValueMode(value);
      return;
    }
    setLogoRatingValueMode(value);
  }, [previewType]);

  const aggregateAccentMode =
    previewType === 'poster'
      ? posterAggregateAccentMode
      : previewType === 'backdrop'
        ? backdropAggregateAccentMode
        : previewType === 'thumbnail'
          ? thumbnailAggregateAccentMode
          : logoAggregateAccentMode;
  const aggregateAccentColor =
    previewType === 'poster'
      ? posterAggregateAccentColor
      : previewType === 'backdrop'
        ? backdropAggregateAccentColor
        : previewType === 'thumbnail'
          ? thumbnailAggregateAccentColor
          : logoAggregateAccentColor;
  const aggregateCriticsAccentColor =
    previewType === 'poster'
      ? posterAggregateCriticsAccentColor
      : previewType === 'backdrop'
        ? backdropAggregateCriticsAccentColor
        : previewType === 'thumbnail'
          ? thumbnailAggregateCriticsAccentColor
          : logoAggregateCriticsAccentColor;
  const aggregateAudienceAccentColor =
    previewType === 'poster'
      ? posterAggregateAudienceAccentColor
      : previewType === 'backdrop'
        ? backdropAggregateAudienceAccentColor
        : previewType === 'thumbnail'
          ? thumbnailAggregateAudienceAccentColor
          : logoAggregateAudienceAccentColor;
  const aggregateValueColor =
    previewType === 'poster'
      ? posterAggregateValueColor
      : previewType === 'backdrop'
        ? backdropAggregateValueColor
        : previewType === 'thumbnail'
          ? thumbnailAggregateValueColor
          : logoAggregateValueColor;
  const aggregateCriticsValueColor =
    previewType === 'poster'
      ? posterAggregateCriticsValueColor
      : previewType === 'backdrop'
        ? backdropAggregateCriticsValueColor
        : previewType === 'thumbnail'
          ? thumbnailAggregateCriticsValueColor
          : logoAggregateCriticsValueColor;
  const aggregateAudienceValueColor =
    previewType === 'poster'
      ? posterAggregateAudienceValueColor
      : previewType === 'backdrop'
        ? backdropAggregateAudienceValueColor
        : previewType === 'thumbnail'
          ? thumbnailAggregateAudienceValueColor
          : logoAggregateAudienceValueColor;
  const aggregateDynamicStops =
    previewType === 'poster'
      ? posterAggregateDynamicStops
      : previewType === 'backdrop'
        ? backdropAggregateDynamicStops
        : previewType === 'thumbnail'
          ? thumbnailAggregateDynamicStops
          : logoAggregateDynamicStops;
  const aggregateAccentBarOffset =
    previewType === 'poster'
      ? posterAggregateAccentBarOffset
      : previewType === 'backdrop'
        ? backdropAggregateAccentBarOffset
        : previewType === 'thumbnail'
          ? thumbnailAggregateAccentBarOffset
          : logoAggregateAccentBarOffset;
  const aggregateAccentBarVisible =
    previewType === 'poster'
      ? posterAggregateAccentBarVisible
      : previewType === 'backdrop'
        ? backdropAggregateAccentBarVisible
        : previewType === 'thumbnail'
          ? thumbnailAggregateAccentBarVisible
          : logoAggregateAccentBarVisible;
  const setAggregateAccentMode = useCallback((value: AggregateAccentMode | ((prev: AggregateAccentMode) => AggregateAccentMode)) => {
    if (previewType === 'poster') {
      setPosterAggregateAccentMode(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateAccentMode(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateAccentMode(value);
      return;
    }
    setLogoAggregateAccentMode(value);
  }, [previewType]);
  const setAggregateAccentColor = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateAccentColor(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateAccentColor(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateAccentColor(value);
      return;
    }
    setLogoAggregateAccentColor(value);
  }, [previewType]);
  const setAggregateCriticsAccentColor = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateCriticsAccentColor(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateCriticsAccentColor(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateCriticsAccentColor(value);
      return;
    }
    setLogoAggregateCriticsAccentColor(value);
  }, [previewType]);
  const setAggregateAudienceAccentColor = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateAudienceAccentColor(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateAudienceAccentColor(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateAudienceAccentColor(value);
      return;
    }
    setLogoAggregateAudienceAccentColor(value);
  }, [previewType]);
  const setAggregateValueColor = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateValueColor(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateValueColor(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateValueColor(value);
      return;
    }
    setLogoAggregateValueColor(value);
  }, [previewType]);
  const setAggregateCriticsValueColor = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateCriticsValueColor(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateCriticsValueColor(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateCriticsValueColor(value);
      return;
    }
    setLogoAggregateCriticsValueColor(value);
  }, [previewType]);
  const setAggregateAudienceValueColor = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateAudienceValueColor(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateAudienceValueColor(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateAudienceValueColor(value);
      return;
    }
    setLogoAggregateAudienceValueColor(value);
  }, [previewType]);
  const setAggregateDynamicStops = useCallback((value: string | ((prev: string) => string)) => {
    if (previewType === 'poster') {
      setPosterAggregateDynamicStops(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateDynamicStops(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateDynamicStops(value);
      return;
    }
    setLogoAggregateDynamicStops(value);
  }, [previewType]);
  const setAggregateAccentBarOffset = useCallback((value: number | ((prev: number) => number)) => {
    if (previewType === 'poster') {
      setPosterAggregateAccentBarOffset(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateAccentBarOffset(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateAccentBarOffset(value);
      return;
    }
    setLogoAggregateAccentBarOffset(value);
  }, [previewType]);
  const setAggregateAccentBarVisible = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    if (previewType === 'poster') {
      setPosterAggregateAccentBarVisible(value);
      return;
    }
    if (previewType === 'backdrop') {
      setBackdropAggregateAccentBarVisible(value);
      return;
    }
    if (previewType === 'thumbnail') {
      setThumbnailAggregateAccentBarVisible(value);
      return;
    }
    setLogoAggregateAccentBarVisible(value);
  }, [previewType]);

  return {
    activeProviderEditorId,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateAudienceValueColor,
    aggregateCriticsAccentColor,
    aggregateCriticsValueColor,
    aggregateDynamicStops,
    aggregateValueColor,
    posterAggregateAccentMode,
    backdropAggregateAccentMode,
    thumbnailAggregateAccentMode,
    logoAggregateAccentMode,
    posterAggregateAccentColor,
    backdropAggregateAccentColor,
    thumbnailAggregateAccentColor,
    logoAggregateAccentColor,
    posterAggregateCriticsAccentColor,
    backdropAggregateCriticsAccentColor,
    thumbnailAggregateCriticsAccentColor,
    logoAggregateCriticsAccentColor,
    posterAggregateAudienceAccentColor,
    backdropAggregateAudienceAccentColor,
    thumbnailAggregateAudienceAccentColor,
    logoAggregateAudienceAccentColor,
    posterAggregateValueColor,
    backdropAggregateValueColor,
    thumbnailAggregateValueColor,
    logoAggregateValueColor,
    posterAggregateCriticsValueColor,
    backdropAggregateCriticsValueColor,
    thumbnailAggregateCriticsValueColor,
    logoAggregateCriticsValueColor,
    posterAggregateAudienceValueColor,
    backdropAggregateAudienceValueColor,
    thumbnailAggregateAudienceValueColor,
    logoAggregateAudienceValueColor,
    posterAggregateDynamicStops,
    backdropAggregateDynamicStops,
    thumbnailAggregateDynamicStops,
    logoAggregateDynamicStops,
    posterAggregateAccentBarOffset,
    backdropAggregateAccentBarOffset,
    thumbnailAggregateAccentBarOffset,
    logoAggregateAccentBarOffset,
    posterAggregateAccentBarVisible,
    backdropAggregateAccentBarVisible,
    thumbnailAggregateAccentBarVisible,
    logoAggregateAccentBarVisible,
    posterNoBackgroundBadgeOutlineColor,
    posterNoBackgroundBadgeOutlineWidth,
    ageRatingTileColor,
    releaseStatusTileColor,
    qualityBadgesTileAccentColor,
    networkTileColor,
    genreBadgeTileAccentColor,
    posterIconShape,
    backdropIconShape,
    thumbnailIconShape,
    logoIconShape,
    iconShape,
    communityBadgeTheme,
    ageRatingBadgeStyle,
    releaseStatusBadgeStyle,
    backdropAggregateRatingSource,
    backdropAggregateProviderWeights,
    backdropArtworkSource,
    backdropEpisodeArtwork,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeOffsetX,
    backdropGenreBadgeOffsetY,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeBackgroundOpacity,
    backdropGenreBadgeStyle,
    backdropImageText,
    backdropImageSize,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesMax,
    backdropQualityBadgesStyle,
    backdropRemuxDisplayMode,
    backdropRatingBadgeScale,
    backdropRatingPreferences,
    backdropRatingPresentation,
    backdropRatingRows,
    backdropRatingStyle,
    backdropRatingsLayout,
    backdropRatingsMax,
    backdropBottomRatingsRow,
    backdropSideRatingsOffset,
    backdropSideRatingsPosition,
    backdropStreamBadges,
    thumbnailAggregateRatingSource,
    thumbnailAggregateProviderWeights,
    thumbnailArtworkSource,
    thumbnailBottomRatingsRow,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgeMode,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
    thumbnailGenreBadgeOffsetX,
    thumbnailGenreBadgeOffsetY,
    thumbnailGenreBadgeBorderWidth,
    thumbnailGenreBadgeBackgroundOpacity,
    thumbnailGenreBadgeStyle,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesMax,
    thumbnailQualityBadgesStyle,
    thumbnailRemuxDisplayMode,
    thumbnailRatingBadgeScale,
    thumbnailRatingPresentation,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailRatingsMax,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    thumbnailStreamBadges,
    logoStreamBadges,
    aiometadataEpisodeIdMode,
    episodeIdMode,
    xrdbKey,
    experienceMode,
    experienceModeDraft,
    fanartKey,
    genrePreviewMode,
    hideAiometadataCredentials,
    lang,
    logoAggregateRatingSource,
    logoAggregateProviderWeights,
    logoArtworkSource,
    logoBackground,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgeMode,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
    logoGenreBadgeOffsetX,
    logoGenreBadgeOffsetY,
    logoGenreBadgeBorderWidth,
    logoGenreBadgeBackgroundOpacity,
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesMax,
    logoQualityBadgesStyle,
    logoRemuxDisplayMode,
    logoRatingBadgeScale,
    logoRatingPreferences,
    logoRatingPresentation,
    logoRatingRows,
    logoRatingStyle,
    logoRatingsMax,
    logoBottomRatingsRow,
    scorebarStyle,
    scorebarLowColor,
    scorebarMidColor,
    scorebarHighColor,
    scorebarLowThreshold,
    scorebarHighThreshold,
    mdblistKey,
    mediaId,
    posterAggregateRatingSource,
    posterAggregateProviderWeights,
    posterRingProgressSource,
    posterRingCenterOpacity,
    posterRingCriticsPriority,
    posterRingAudiencePriority,
    posterRingValueSource,
    posterArtworkSource,
    posterRatingBlackStripEnabled,
    backdropRatingBlackStripEnabled,
    thumbnailRatingBlackStripEnabled,
    posterEdgeOffset,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
    posterGenreBadgeOffsetX,
    posterGenreBadgeOffsetY,
    posterGenreBadgeBorderWidth,
    posterGenreBadgeBackgroundOpacity,
    posterGenreBadgeStyle,
    posterIdMode,
    posterImageSize,
    randomPosterText,
    randomPosterLanguage,
    randomPosterMinVoteCount,
    randomPosterMinVoteAverage,
    randomPosterMinWidth,
    randomPosterMinHeight,
    randomPosterFallback,
    posterImageText,
    posterQualityBadgePreferences,
    posterQualityBadgeScale,
    posterQualityBadgesMax,
    posterQualityBadgesPosition,
    posterTrendingTagPosition,
    posterTrendingTagStylePreset,
    posterTrendingCommunityBadgeTheme,
    posterTrendingTagTextColor,
    posterQualityBadgeOffsetX,
    posterQualityBadgeOffsetY,
    ageRatingBadgePosition,
    posterQualityBadgesStyle,
    posterRemuxDisplayMode,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingPresentation,
    posterRatingRows,
    posterRatingStyle,
    posterRatingsLayout,
    posterRatingsMax,
    posterRatingsMaxPerSide,
    posterSideRatingsOffset,
    posterSideRatingsPosition,
    posterStreamBadges,
    previewType,
    proxyDebugMetaTranslation,
    proxyCatalogRules,
    proxyManifestUrl,
    proxyTypes,
    proxyTranslateMeta,
    proxyTranslateMetaMode,
    qualityBadgesSide,
    posterRatingXOffsetPillGlass,
    posterRatingYOffsetPillGlass,
    backdropRatingXOffsetPillGlass,
    backdropRatingYOffsetPillGlass,
    thumbnailRatingXOffsetPillGlass,
    thumbnailRatingYOffsetPillGlass,
    posterRatingXOffsetSquare,
    posterRatingYOffsetSquare,
    backdropRatingXOffsetSquare,
    backdropRatingYOffsetSquare,
    thumbnailRatingXOffsetSquare,
    thumbnailRatingYOffsetSquare,
    ratingXOffsetPillGlass,
    ratingYOffsetPillGlass,
    ratingXOffsetSquare,
    ratingYOffsetSquare,
    ratingProviderAppearanceOverrides,
    ratingValueMode,
    posterRatingValueMode,
    backdropRatingValueMode,
    thumbnailRatingValueMode,
    logoRatingValueMode,
      qualityBadgeAppearanceOverrides,
    selectedPresetId,
    setActiveProviderEditorId,
    setAggregateAccentBarOffset,
    setAggregateAccentBarVisible,
    setAggregateAccentColor,
    setAggregateAccentMode,
    setAggregateAudienceAccentColor,
    setAggregateAudienceValueColor,
    setAggregateCriticsAccentColor,
    setAggregateCriticsValueColor,
    setAggregateDynamicStops,
    setAggregateValueColor,
    setPosterAggregateAccentMode,
    setBackdropAggregateAccentMode,
    setThumbnailAggregateAccentMode,
    setLogoAggregateAccentMode,
    setPosterAggregateAccentColor,
    setBackdropAggregateAccentColor,
    setThumbnailAggregateAccentColor,
    setLogoAggregateAccentColor,
    setPosterAggregateCriticsAccentColor,
    setBackdropAggregateCriticsAccentColor,
    setThumbnailAggregateCriticsAccentColor,
    setLogoAggregateCriticsAccentColor,
    setPosterAggregateAudienceAccentColor,
    setBackdropAggregateAudienceAccentColor,
    setThumbnailAggregateAudienceAccentColor,
    setLogoAggregateAudienceAccentColor,
    setPosterAggregateValueColor,
    setBackdropAggregateValueColor,
    setThumbnailAggregateValueColor,
    setLogoAggregateValueColor,
    setPosterAggregateCriticsValueColor,
    setBackdropAggregateCriticsValueColor,
    setThumbnailAggregateCriticsValueColor,
    setLogoAggregateCriticsValueColor,
    setPosterAggregateAudienceValueColor,
    setBackdropAggregateAudienceValueColor,
    setThumbnailAggregateAudienceValueColor,
    setLogoAggregateAudienceValueColor,
    setPosterAggregateDynamicStops,
    setBackdropAggregateDynamicStops,
    setThumbnailAggregateDynamicStops,
    setLogoAggregateDynamicStops,
    setPosterAggregateAccentBarOffset,
    setBackdropAggregateAccentBarOffset,
    setThumbnailAggregateAccentBarOffset,
    setLogoAggregateAccentBarOffset,
    setPosterAggregateAccentBarVisible,
    setBackdropAggregateAccentBarVisible,
    setThumbnailAggregateAccentBarVisible,
    setLogoAggregateAccentBarVisible,
    setPosterNoBackgroundBadgeOutlineColor,
    setPosterNoBackgroundBadgeOutlineWidth,
    setAgeRatingTileColor,
    setReleaseStatusTileColor,
    setQualityBadgesTileAccentColor,
    setNetworkTileColor,
    setGenreBadgeTileAccentColor,
    setPosterIconShape,
    setBackdropIconShape,
    setThumbnailIconShape,
    setLogoIconShape,
    setIconShape,
    setCommunityBadgeTheme,
    setAgeRatingBadgeStyle,
    setReleaseStatusBadgeStyle,
    setPosterRatingXOffsetPillGlass,
    setPosterRatingYOffsetPillGlass,
    setBackdropRatingXOffsetPillGlass,
    setBackdropRatingYOffsetPillGlass,
    setThumbnailRatingXOffsetPillGlass,
    setThumbnailRatingYOffsetPillGlass,
    setPosterRatingXOffsetSquare,
    setPosterRatingYOffsetSquare,
    setBackdropRatingXOffsetSquare,
    setBackdropRatingYOffsetSquare,
    setThumbnailRatingXOffsetSquare,
    setThumbnailRatingYOffsetSquare,
    setBackdropAggregateRatingSource,
    setBackdropAggregateProviderWeights,
    setBackdropArtworkSource,
    setBackdropEpisodeArtwork,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeOffsetX,
    setBackdropGenreBadgeOffsetY,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeBackgroundOpacity,
    setBackdropGenreBadgeStyle,
    setBackdropImageText,
    setBackdropImageSize,
    setBackdropQualityBadgePreferences,
    setBackdropQualityBadgeScale,
    setBackdropQualityBadgesMax,
    setBackdropQualityBadgesStyle,
    setBackdropRemuxDisplayMode,
    setBackdropRatingBadgeScale,
    setBackdropRatingPresentation,
    setBackdropRatingRows,
    setBackdropRatingStyle,
    setBackdropRatingsLayout,
    setBackdropRatingsMax,
    setBackdropBottomRatingsRow,
    setBackdropSideRatingsOffset,
    setBackdropSideRatingsPosition,
    setBackdropStreamBadges,
    setThumbnailAggregateRatingSource,
    setThumbnailAggregateProviderWeights,
    setThumbnailArtworkSource,
    setThumbnailBottomRatingsRow,
    setThumbnailGenreBadgeAnimeGrouping,
    setThumbnailGenreBadgeMode,
    setThumbnailGenreBadgePosition,
    setThumbnailGenreBadgeScale,
    setThumbnailGenreBadgeOffsetX,
    setThumbnailGenreBadgeOffsetY,
    setThumbnailGenreBadgeBorderWidth,
    setThumbnailGenreBadgeBackgroundOpacity,
    setThumbnailGenreBadgeStyle,
    setThumbnailImageText,
    setThumbnailQualityBadgePreferences,
    setThumbnailQualityBadgeScale,
    setThumbnailQualityBadgesMax,
    setThumbnailQualityBadgesStyle,
    setThumbnailRemuxDisplayMode,
    setThumbnailRatingBadgeScale,
    setThumbnailRatingPresentation,
    setThumbnailRatingStyle,
    setThumbnailRatingsLayout,
    setThumbnailRatingsMax,
    setThumbnailSideRatingsOffset,
    setThumbnailSideRatingsPosition,
    setThumbnailStreamBadges,
    setLogoStreamBadges,
    setAiometadataEpisodeIdMode,
    setEpisodeIdMode,
    setXrdbKey,
    setExperienceMode,
    setExperienceModeDraft,
    setFanartKey,
    setGenrePreviewMode,
    setHideAiometadataCredentials,
    setLang,
    setLogoAggregateRatingSource,
    setLogoAggregateProviderWeights,
    setLogoArtworkSource,
    setLogoBackground,
    setLogoGenreBadgeAnimeGrouping,
    setLogoGenreBadgeMode,
    setLogoGenreBadgePosition,
    setLogoGenreBadgeScale,
    setLogoGenreBadgeOffsetX,
    setLogoGenreBadgeOffsetY,
    setLogoGenreBadgeBorderWidth,
    setLogoGenreBadgeBackgroundOpacity,
    setLogoGenreBadgeStyle,
    setLogoQualityBadgePreferences,
    setLogoQualityBadgeScale,
    setLogoQualityBadgesMax,
    setLogoQualityBadgesStyle,
    setLogoRemuxDisplayMode,
    setLogoRatingBadgeScale,
    setLogoRatingPresentation,
    setLogoRatingRows,
    setLogoRatingStyle,
    setLogoRatingsMax,
    setLogoBottomRatingsRow,
    setScorebarStyle,
    setScorebarLowColor,
    setScorebarMidColor,
    setScorebarHighColor,
    setScorebarLowThreshold,
    setScorebarHighThreshold,
    setMdblistKey,
    setMediaId,
    setPosterAggregateRatingSource,
    setPosterAggregateProviderWeights,
    setPosterRingProgressSource,
    setPosterRingCenterOpacity,
    setPosterRingCriticsPriority,
    setPosterRingAudiencePriority,
    setPosterRingValueSource,
    setPosterArtworkSource,
    setPosterRatingBlackStripEnabled,
    setBackdropRatingBlackStripEnabled,
    setThumbnailRatingBlackStripEnabled,
    setPosterEdgeOffset,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeOffsetX,
    setPosterGenreBadgeOffsetY,
    setPosterGenreBadgeBorderWidth,
    setPosterGenreBadgeBackgroundOpacity,
    setPosterGenreBadgeStyle,
    setPosterIdMode,
    setPosterImageSize,
    setRandomPosterText,
    setRandomPosterLanguage,
    setRandomPosterMinVoteCount,
    setRandomPosterMinVoteAverage,
    setRandomPosterMinWidth,
    setRandomPosterMinHeight,
    setRandomPosterFallback,
    setPosterImageText,
    setPosterQualityBadgePreferences,
    setPosterQualityBadgeScale,
    setPosterQualityBadgesMax,
    setPosterQualityBadgesPosition,
    setPosterTrendingTagPosition,
    setPosterTrendingTagStylePreset,
    setPosterTrendingCommunityBadgeTheme,
    setPosterTrendingTagTextColor,
    setPosterQualityBadgeOffsetX,
    setPosterQualityBadgeOffsetY,
    setAgeRatingBadgePosition,
    setPosterQualityBadgesStyle,
    setPosterRemuxDisplayMode,
    setPosterRatingBadgeScale,
    setPosterRatingPresentation,
    setPosterRatingRows,
    setPosterRatingStyle,
    setPosterRatingsLayout,
    setPosterRatingsMax,
    setPosterRatingsMaxPerSide,
    setPosterSideRatingsOffset,
    setPosterSideRatingsPosition,
    setPosterStreamBadges,
    setPreviewType,
    setProxyDebugMetaTranslation,
    setProxyCatalogRules,
    setProxyManifestUrl,
    setProxyTypes,
    setProxyTranslateMeta,
    setProxyTranslateMetaMode,
    setQualityBadgesSide,
    setRatingXOffsetPillGlass,
    setRatingYOffsetPillGlass,
    setRatingXOffsetSquare,
    setRatingYOffsetSquare,
    setRatingProviderAppearanceOverrides,
    setRatingValueMode,
    setPosterRatingValueMode,
    setBackdropRatingValueMode,
    setThumbnailRatingValueMode,
    setLogoRatingValueMode,
      setQualityBadgeAppearanceOverrides,
    setSelectedPresetId,
    setShowConfigString,
    setShowExperienceModal,
    setShowProxyUrl,
    setSimklClientId,
    setStickyPreviewEnabled,
    setThumbnailEpisodeArtwork,
    setThumbnailRatingRows,
    setTmdbIdScope,
    setTmdbKey,
    setWorkspaceCenterView,
    showConfigString,
    showExperienceModal,
    showProxyUrl,
    simklClientId,
    stickyPreviewEnabled,
    thumbnailEpisodeArtwork,
    thumbnailRatingPreferences,
    thumbnailRatingRows,
    tmdbIdScope,
    tmdbKey,
    workspaceCenterView,
  };
}
