import { useMemo, useState } from 'react';

import {
  DEFAULT_BADGE_SCALE_PERCENT,
  QUALITY_BADGE_OPTIONS,
  type RatingProviderAppearanceOverrides,
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
import { buildDefaultRatingRows, enabledOrderedToRows, rowsToEnabledOrdered, type RatingProviderRow } from '@/lib/ratingProviderRows';
import {
  AGGREGATE_RATING_SOURCE_ACCENTS,
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  DEFAULT_AGGREGATE_ACCENT_COLOR,
  DEFAULT_AGGREGATE_ACCENT_MODE,
  DEFAULT_AGGREGATE_RATING_SOURCE,
  DEFAULT_RATING_PRESENTATION,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from '@/lib/ratingPresentation';
import { DEFAULT_RATING_VALUE_MODE, type RatingValueMode } from '@/lib/ratingDisplay';
import { DEFAULT_POSTER_RATINGS_MAX_PER_SIDE, type PosterRatingLayout } from '@/lib/posterLayoutOptions';
import { type RatingPreference } from '@/lib/ratingProviderCatalog';
import { DEFAULT_QUALITY_BADGES_STYLE, DEFAULT_RATING_STYLE, type QualityBadgeStyle, type RatingStyle } from '@/lib/ratingAppearance';
import { DEFAULT_SIDE_RATING_OFFSET, type SideRatingPosition } from '@/lib/sideRatingPosition';
import {
  type ArtworkSource,
  type BackdropImageTextPreference,
  type LogoBackground,
  type PosterImageSize,
  type PosterImageTextPreference,
  type PosterQualityBadgesPosition,
  type QualityBadgesSide,
  type StreamBadgesSetting,
  type TmdbIdScopeMode,
} from '@/lib/uiConfig';
import { SAMPLE_GENRE_BADGE_MODE_DEFAULT } from '@/lib/configuratorPageOptions';

type ProxyType = 'poster' | 'backdrop' | 'logo';
type WorkspaceCenterView = 'showcase' | 'preview' | 'guide';

export function useConfiguratorWorkspaceState() {
  const [previewType, setPreviewType] = useState<ProxyType>('poster');
  const [mediaId, setMediaId] = useState('tt0133093');
  const [lang, setLang] = useState('en');
  const [posterImageSize, setPosterImageSize] = useState<PosterImageSize>('normal');
  const [posterImageText, setPosterImageText] = useState<PosterImageTextPreference>('clean');
  const [backdropImageText, setBackdropImageText] = useState<BackdropImageTextPreference>('clean');
  const [posterArtworkSource, setPosterArtworkSource] = useState<ArtworkSource>('tmdb');
  const [backdropArtworkSource, setBackdropArtworkSource] = useState<ArtworkSource>('tmdb');
  const [ratingValueMode, setRatingValueMode] = useState<RatingValueMode>(DEFAULT_RATING_VALUE_MODE);
  const [posterGenreBadgeMode, setPosterGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [backdropGenreBadgeMode, setBackdropGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [logoGenreBadgeMode, setLogoGenreBadgeMode] = useState<GenreBadgeMode>(DEFAULT_GENRE_BADGE_MODE);
  const [posterGenreBadgeStyle, setPosterGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [backdropGenreBadgeStyle, setBackdropGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [logoGenreBadgeStyle, setLogoGenreBadgeStyle] = useState<GenreBadgeStyle>(DEFAULT_GENRE_BADGE_STYLE);
  const [posterGenreBadgePosition, setPosterGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [backdropGenreBadgePosition, setBackdropGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [logoGenreBadgePosition, setLogoGenreBadgePosition] = useState<GenreBadgePosition>(DEFAULT_GENRE_BADGE_POSITION);
  const [posterGenreBadgeScale, setPosterGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [backdropGenreBadgeScale, setBackdropGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [logoGenreBadgeScale, setLogoGenreBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [posterGenreBadgeAnimeGrouping, setPosterGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [backdropGenreBadgeAnimeGrouping, setBackdropGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [logoGenreBadgeAnimeGrouping, setLogoGenreBadgeAnimeGrouping] = useState<GenreBadgeAnimeGrouping>(DEFAULT_GENRE_BADGE_ANIME_GROUPING);
  const [genrePreviewMode, setGenrePreviewMode] = useState<GenreBadgeMode>(SAMPLE_GENRE_BADGE_MODE_DEFAULT);
  const [posterRatingRows, setPosterRatingRows] = useState<RatingProviderRow[]>(buildDefaultRatingRows);
  const [backdropRatingRows, setBackdropRatingRows] = useState<RatingProviderRow[]>(buildDefaultRatingRows);
  const [thumbnailRatingRows, setThumbnailRatingRows] = useState<RatingProviderRow[]>(enabledOrderedToRows([...THUMBNAIL_RATING_PREFERENCES]));
  const [logoRatingRows, setLogoRatingRows] = useState<RatingProviderRow[]>(buildDefaultRatingRows);
  const [posterStreamBadges, setPosterStreamBadges] = useState<StreamBadgesSetting>('auto');
  const [backdropStreamBadges, setBackdropStreamBadges] = useState<StreamBadgesSetting>('auto');
  const [qualityBadgesSide, setQualityBadgesSide] = useState<QualityBadgesSide>('left');
  const [posterQualityBadgesPosition, setPosterQualityBadgesPosition] = useState<PosterQualityBadgesPosition>('auto');
  const [posterQualityBadgesStyle, setPosterQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [backdropQualityBadgesStyle, setBackdropQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [logoQualityBadgesStyle, setLogoQualityBadgesStyle] = useState<QualityBadgeStyle>(DEFAULT_QUALITY_BADGES_STYLE);
  const [posterQualityBadgePreferences, setPosterQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [backdropQualityBadgePreferences, setBackdropQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [logoQualityBadgePreferences, setLogoQualityBadgePreferences] = useState(QUALITY_BADGE_OPTIONS.map((option) => option.id));
  const [posterQualityBadgesMax, setPosterQualityBadgesMax] = useState<number | null>(null);
  const [backdropQualityBadgesMax, setBackdropQualityBadgesMax] = useState<number | null>(null);
  const [logoQualityBadgesMax, setLogoQualityBadgesMax] = useState<number | null>(null);
  const [posterRatingsLayout, setPosterRatingsLayout] = useState<PosterRatingLayout>('bottom');
  const [backdropRatingsLayout, setBackdropRatingsLayout] = useState<BackdropRatingLayout>(DEFAULT_BACKDROP_RATING_LAYOUT);
  const [posterRatingsMax, setPosterRatingsMax] = useState<number | null>(null);
  const [backdropRatingsMax, setBackdropRatingsMax] = useState<number | null>(null);
  const [backdropBottomRatingsRow, setBackdropBottomRatingsRow] = useState(false);
  const [posterEdgeOffset, setPosterEdgeOffset] = useState<number>(DEFAULT_POSTER_EDGE_OFFSET);
  const [posterSideRatingsPosition, setPosterSideRatingsPosition] = useState<SideRatingPosition>('top');
  const [posterSideRatingsOffset, setPosterSideRatingsOffset] = useState<number>(DEFAULT_SIDE_RATING_OFFSET);
  const [backdropSideRatingsPosition, setBackdropSideRatingsPosition] = useState<SideRatingPosition>('top');
  const [backdropSideRatingsOffset, setBackdropSideRatingsOffset] = useState<number>(DEFAULT_SIDE_RATING_OFFSET);
  const [posterRatingStyle, setPosterRatingStyle] = useState<RatingStyle>(DEFAULT_RATING_STYLE);
  const [backdropRatingStyle, setBackdropRatingStyle] = useState<RatingStyle>(DEFAULT_RATING_STYLE);
  const [logoRatingStyle, setLogoRatingStyle] = useState<RatingStyle>('plain');
  const [posterRatingBadgeScale, setPosterRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [backdropRatingBadgeScale, setBackdropRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [logoRatingBadgeScale, setLogoRatingBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [posterQualityBadgeScale, setPosterQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [backdropQualityBadgeScale, setBackdropQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [logoQualityBadgeScale, setLogoQualityBadgeScale] = useState<number>(DEFAULT_BADGE_SCALE_PERCENT);
  const [posterRatingPresentation, setPosterRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [backdropRatingPresentation, setBackdropRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [logoRatingPresentation, setLogoRatingPresentation] = useState<RatingPresentation>(DEFAULT_RATING_PRESENTATION);
  const [posterAggregateRatingSource, setPosterAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [backdropAggregateRatingSource, setBackdropAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [logoAggregateRatingSource, setLogoAggregateRatingSource] = useState<AggregateRatingSource>(DEFAULT_AGGREGATE_RATING_SOURCE);
  const [aggregateAccentMode, setAggregateAccentMode] = useState<AggregateAccentMode>(DEFAULT_AGGREGATE_ACCENT_MODE);
  const [aggregateAccentColor, setAggregateAccentColor] = useState<string>(DEFAULT_AGGREGATE_ACCENT_COLOR);
  const [aggregateCriticsAccentColor, setAggregateCriticsAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.critics);
  const [aggregateAudienceAccentColor, setAggregateAudienceAccentColor] = useState<string>(AGGREGATE_RATING_SOURCE_ACCENTS.audience);
  const [aggregateAccentBarOffset, setAggregateAccentBarOffset] = useState<number>(DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET);
  const [aggregateAccentBarVisible, setAggregateAccentBarVisible] = useState(true);
  const [posterRatingsMaxPerSide, setPosterRatingsMaxPerSide] = useState<number | null>(DEFAULT_POSTER_RATINGS_MAX_PER_SIDE);
  const [logoRatingsMax, setLogoRatingsMax] = useState<number | null>(null);
  const [logoBackground, setLogoBackground] = useState<LogoBackground>('transparent');
  const [logoBottomRatingsRow, setLogoBottomRatingsRow] = useState(false);
  const [logoArtworkSource, setLogoArtworkSource] = useState<ArtworkSource>('tmdb');
  const [ratingProviderAppearanceOverrides, setRatingProviderAppearanceOverrides] = useState<RatingProviderAppearanceOverrides>({});
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
  const [proxyCatalogRules, setProxyCatalogRules] = useState<ProxyCatalogRule[]>([]);
  const [showConfigString, setShowConfigString] = useState(false);
  const [showProxyUrl, setShowProxyUrl] = useState(false);
  const [hideAiometadataCredentials, setHideAiometadataCredentials] = useState(true);
  const [posterIdMode, setPosterIdMode] = useState<'auto' | 'tmdb' | 'imdb'>('auto');
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

  return {
    activeProviderEditorId,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateCriticsAccentColor,
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeStyle,
    backdropImageText,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesMax,
    backdropQualityBadgesStyle,
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
    episodeIdMode,
    xrdbKey,
    experienceMode,
    experienceModeDraft,
    fanartKey,
    genrePreviewMode,
    hideAiometadataCredentials,
    lang,
    logoAggregateRatingSource,
    logoArtworkSource,
    logoBackground,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgeMode,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesMax,
    logoQualityBadgesStyle,
    logoRatingBadgeScale,
    logoRatingPreferences,
    logoRatingPresentation,
    logoRatingRows,
    logoRatingStyle,
    logoRatingsMax,
    logoBottomRatingsRow,
    mdblistKey,
    mediaId,
    posterAggregateRatingSource,
    posterArtworkSource,
    posterEdgeOffset,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
    posterGenreBadgeStyle,
    posterIdMode,
    posterImageSize,
    posterImageText,
    posterQualityBadgePreferences,
    posterQualityBadgeScale,
    posterQualityBadgesMax,
    posterQualityBadgesPosition,
    posterQualityBadgesStyle,
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
    proxyTranslateMeta,
    proxyTranslateMetaMode,
    qualityBadgesSide,
    ratingProviderAppearanceOverrides,
    ratingValueMode,
    selectedPresetId,
    setActiveProviderEditorId,
    setAggregateAccentBarOffset,
    setAggregateAccentBarVisible,
    setAggregateAccentColor,
    setAggregateAccentMode,
    setAggregateAudienceAccentColor,
    setAggregateCriticsAccentColor,
    setBackdropAggregateRatingSource,
    setBackdropArtworkSource,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeStyle,
    setBackdropImageText,
    setBackdropQualityBadgePreferences,
    setBackdropQualityBadgeScale,
    setBackdropQualityBadgesMax,
    setBackdropQualityBadgesStyle,
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
    setEpisodeIdMode,
    setXrdbKey,
    setExperienceMode,
    setExperienceModeDraft,
    setFanartKey,
    setGenrePreviewMode,
    setHideAiometadataCredentials,
    setLang,
    setLogoAggregateRatingSource,
    setLogoArtworkSource,
    setLogoBackground,
    setLogoGenreBadgeAnimeGrouping,
    setLogoGenreBadgeMode,
    setLogoGenreBadgePosition,
    setLogoGenreBadgeScale,
    setLogoGenreBadgeStyle,
    setLogoQualityBadgePreferences,
    setLogoQualityBadgeScale,
    setLogoQualityBadgesMax,
    setLogoQualityBadgesStyle,
    setLogoRatingBadgeScale,
    setLogoRatingPresentation,
    setLogoRatingRows,
    setLogoRatingStyle,
    setLogoRatingsMax,
    setLogoBottomRatingsRow,
    setMdblistKey,
    setMediaId,
    setPosterAggregateRatingSource,
    setPosterArtworkSource,
    setPosterEdgeOffset,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeStyle,
    setPosterIdMode,
    setPosterImageSize,
    setPosterImageText,
    setPosterQualityBadgePreferences,
    setPosterQualityBadgeScale,
    setPosterQualityBadgesMax,
    setPosterQualityBadgesPosition,
    setPosterQualityBadgesStyle,
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
    setProxyTranslateMeta,
    setProxyTranslateMetaMode,
    setQualityBadgesSide,
    setRatingProviderAppearanceOverrides,
    setRatingValueMode,
    setSelectedPresetId,
    setShowConfigString,
    setShowExperienceModal,
    setShowProxyUrl,
    setSimklClientId,
    setStickyPreviewEnabled,
    setThumbnailRatingRows,
    setTmdbIdScope,
    setTmdbKey,
    setWorkspaceCenterView,
    showConfigString,
    showExperienceModal,
    showProxyUrl,
    simklClientId,
    stickyPreviewEnabled,
    thumbnailRatingPreferences,
    thumbnailRatingRows,
    tmdbIdScope,
    tmdbKey,
    workspaceCenterView,
  };
}
