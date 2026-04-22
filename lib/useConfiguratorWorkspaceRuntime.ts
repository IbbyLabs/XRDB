import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_STACKED_ACCENT_MODE,
  DEFAULT_STACKED_ELEMENT_OFFSET_PX,
  DEFAULT_STACKED_LINE_GAP_PERCENT,
  DEFAULT_STACKED_LINE_HEIGHT_PERCENT,
  DEFAULT_STACKED_LINE_WIDTH_PERCENT,
  DEFAULT_STACKED_SURFACE_OPACITY_PERCENT,
  DEFAULT_STACKED_WIDTH_PERCENT,
  MAX_BADGE_SCALE_PERCENT,
  MAX_GENRE_BADGE_SCALE_PERCENT,
  MAX_PROVIDER_ICON_SCALE_PERCENT,
  MAX_STACKED_ELEMENT_OFFSET_PX,
  MAX_STACKED_SURFACE_OPACITY_PERCENT,
  MAX_STACKED_LINE_GAP_PERCENT,
  MAX_STACKED_LINE_HEIGHT_PERCENT,
  MAX_STACKED_LINE_WIDTH_PERCENT,
  MAX_STACKED_WIDTH_PERCENT,
  MIN_BADGE_SCALE_PERCENT,
  MIN_PROVIDER_ICON_SCALE_PERCENT,
  MIN_STACKED_ELEMENT_OFFSET_PX,
  MIN_STACKED_SURFACE_OPACITY_PERCENT,
  MIN_STACKED_LINE_GAP_PERCENT,
  MIN_STACKED_LINE_HEIGHT_PERCENT,
  MIN_STACKED_LINE_WIDTH_PERCENT,
  MIN_STACKED_WIDTH_PERCENT,
  QUALITY_BADGE_OPTIONS,
  normalizeBadgeScalePercent,
  normalizeGenreBadgeScalePercent,
  normalizeStackedAccentMode,
  normalizeStackedElementOffsetPx,
  normalizeStackedLineGapPercent,
  normalizeStackedLineHeightPercent,
  normalizeStackedLineWidthPercent,
  normalizeStackedSurfaceOpacityPercent,
  normalizeStackedWidthPercent,
} from '@/lib/badgeCustomization';
import { BACKDROP_RATING_LAYOUT_OPTIONS } from '@/lib/backdropLayoutOptions';
import {
  POSTER_RATINGS_MAX_PER_SIDE_MIN,
  POSTER_RATING_LAYOUT_OPTIONS,
} from '@/lib/posterLayoutOptions';
import {
  QUALITY_BADGE_STYLE_OPTIONS,
  RATING_STYLE_OPTIONS,
} from '@/lib/ratingAppearance';
import {
  AGGREGATE_ACCENT_MODE_OPTIONS,
  AGGREGATE_RATING_SOURCE_OPTIONS,
  MAX_AGGREGATE_ACCENT_BAR_OFFSET,
  MIN_AGGREGATE_ACCENT_BAR_OFFSET,
} from '@/lib/ratingPresentation';
import { type RatingPreference } from '@/lib/ratingProviderCatalog';
import {
  DEFAULT_METADATA_TRANSLATION_MODE,
  METADATA_TRANSLATION_MODE_OPTIONS,
  normalizeMetadataTranslationMode,
} from '@/lib/metadataTranslation';
import {
  GENRE_BADGE_MODE_OPTIONS,
  GENRE_BADGE_POSITION_OPTIONS,
  GENRE_BADGE_STYLE_OPTIONS,
} from '@/lib/genreBadge';
import { SIDE_RATING_POSITION_OPTIONS } from '@/lib/sideRatingPosition';
import {
  DEFAULT_POSTER_EDGE_OFFSET,
  MAX_POSTER_EDGE_OFFSET,
  normalizePosterEdgeOffset,
} from '@/lib/posterEdgeOffset';
import { RATING_VALUE_MODE_OPTIONS } from '@/lib/ratingDisplay';
import {
  BACKDROP_IMAGE_SIZE_OPTIONS,
  BACKDROP_ARTWORK_SOURCE_OPTIONS,
  BACKDROP_IMAGE_TEXT_OPTIONS,
  EPISODE_ID_MODE_OPTIONS,
  GENRE_BADGE_ANIME_GROUPING_OPTIONS,
  LOGO_ARTWORK_SOURCE_OPTIONS,
  POSTER_ARTWORK_SOURCE_OPTIONS,
  POSTER_IMAGE_SIZE_OPTIONS,
  POSTER_IMAGE_TEXT_OPTIONS,
  SAMPLE_GENRE_BADGE_MODE_DEFAULT,
  SUPPORTED_LANGUAGES,
} from '@/lib/configuratorPageOptions';
import {
  buildEpisodePreviewMediaTarget,
  parseEpisodePreviewMediaTarget,
} from '@/lib/episodeIdentity';
import {
  CONFIG_PROFILE_UNLOCK_SESSION_STORAGE_KEY,
  parseConfigProfileUnlockSession,
  serializeConfigProfileUnlockSession,
  type ConfigProfileUnlockSession,
} from '@/lib/configProfileClientState';
import { isConfiguratorExperienceMode } from '@/lib/configuratorPresets';
import { buildConfiguratorPageProps } from '@/lib/configuratorPageProps';
import type { MediaFeatureBadgeKey } from '@/lib/mediaFeatures';
import { normalizeBaseUrl } from '@/lib/uiConfig';
import { useClientOrigin } from '@/lib/useClientOrigin';
import { useConfiguratorActiveWorkspaceSettings } from '@/lib/useConfiguratorActiveWorkspaceSettings';
import { useConfiguratorFeeds } from '@/lib/useConfiguratorFeeds';
import { useConfiguratorOutputs } from '@/lib/useConfiguratorOutputs';
import { useConfiguratorPageChrome } from '@/lib/useConfiguratorPageChrome';
import { useConfiguratorWorkspaceActions } from '@/lib/useConfiguratorWorkspaceActions';
import { useConfiguratorWorkspaceConfigIo } from '@/lib/useConfiguratorWorkspaceConfigIo';
import { useConfiguratorWorkspaceState } from '@/lib/useConfiguratorWorkspaceState';
import { useConfiguratorWorkspaceStorage } from '@/lib/useConfiguratorWorkspaceStorage';
import { useConfiguratorWorkspaceSummary } from '@/lib/useConfiguratorWorkspaceSummary';
import { useConfiguratorWorkspaceUi } from '@/lib/useConfiguratorWorkspaceUi';
import { enabledOrderedToRows } from '@/lib/ratingProviderRows';
import {
  isBuiltInSample,
  MEDIA_TARGET_SAMPLE_IDS,
  PINNED_TARGETS_MAX_PER_TYPE,
  pickShuffledMediaTarget,
  readPinnedTargetsFromStorage,
  writePinnedTargetsToStorage,
  findSampleTitleByMediaId,
  type MediaSearchItem,
  type MediaSearchPreviewType,
  type PinnedTarget,
  type PinnedTargetsStore,
} from '@/lib/configuratorMediaSearch';
import {
  type ConfiguratorEnvAccessKeys,
} from '@/lib/configuratorEnvAccessKeys';

type WorkspacePanelId =
  | 'configurator'
  | 'center-view'
  | 'config-string'
  | 'aio-urls'
  | 'addon-proxy'
  | 'current-setup'
  | 'quick-actions';
type WorkspaceSectionId =
  | 'essentials'
  | 'presentation'
  | 'look'
  | 'quality'
  | 'providers'
  | 'quicktune'
  | 'presets';

type WorkspaceCenterView = 'showcase' | 'preview' | 'guide';
type PreviewType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';
type ProviderCredentialSessionStatus = {
  tmdb: boolean;
  mdblist: boolean;
  fanart: boolean;
  simkl: boolean;
};
type ProviderCredentialSessionMaskedPreview = {
  tmdb: string;
  mdblist: string;
  fanart: string;
  simkl: string;
};
type ProviderCredentialSessionPatch = Partial<{
  tmdbKey: string;
  mdblistKey: string;
  fanartKey: string;
  simklClientId: string;
}>;

const DOCS_CAPTURE_ENABLED = process.env.NEXT_PUBLIC_XRDB_ENABLE_DOCS_CAPTURE === 'true';
const DOCS_CAPTURE_RATING_ROWS = enabledOrderedToRows(['tmdb']);
const DOCS_CAPTURE_QUALITY_BADGE_PREFERENCES: MediaFeatureBadgeKey[] = [];
const MEDIA_SEARCH_DEBOUNCE_MS = 140;
const EMPTY_PROVIDER_CREDENTIAL_SESSION_STATUS: ProviderCredentialSessionStatus = {
  tmdb: false,
  mdblist: false,
  fanart: false,
  simkl: false,
};
const EMPTY_PROVIDER_CREDENTIAL_SESSION_MASKED_PREVIEW: ProviderCredentialSessionMaskedPreview = {
  tmdb: '',
  mdblist: '',
  fanart: '',
  simkl: '',
};
const WORKSPACE_PANEL_IDS = new Set<WorkspacePanelId>([
  'configurator',
  'center-view',
  'config-string',
  'aio-urls',
  'addon-proxy',
  'current-setup',
  'quick-actions',
]);
const WORKSPACE_CENTER_VIEWS = new Set<WorkspaceCenterView>(['showcase', 'preview', 'guide']);
const PREVIEW_TYPES = new Set<PreviewType>(['poster', 'backdrop', 'thumbnail', 'logo']);

const readBooleanSearchParam = (
  params: URLSearchParams,
  key: string,
  fallback: boolean,
) => {
  const normalized = String(params.get(key) || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const readListSearchParam = (params: URLSearchParams, key: string) =>
  String(params.get(key) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const isWorkspacePanelId = (value: string): value is WorkspacePanelId => WORKSPACE_PANEL_IDS.has(value as WorkspacePanelId);

const isWorkspaceCenterView = (value: string): value is WorkspaceCenterView =>
  WORKSPACE_CENTER_VIEWS.has(value as WorkspaceCenterView);

const isPreviewType = (value: string): value is PreviewType => PREVIEW_TYPES.has(value as PreviewType);

const readProviderCredentialSessionStatus = (value: unknown): ProviderCredentialSessionStatus => {
  if (!value || typeof value !== 'object') {
    return EMPTY_PROVIDER_CREDENTIAL_SESSION_STATUS;
  }

  const status = value as Partial<ProviderCredentialSessionStatus>;

  return {
    tmdb: Boolean(status.tmdb),
    mdblist: Boolean(status.mdblist),
    fanart: Boolean(status.fanart),
    simkl: Boolean(status.simkl),
  };
};

const readProviderCredentialSessionMaskedPreview = (value: unknown): ProviderCredentialSessionMaskedPreview => {
  if (!value || typeof value !== 'object') {
    return EMPTY_PROVIDER_CREDENTIAL_SESSION_MASKED_PREVIEW;
  }

  const maskedPreview = value as Partial<ProviderCredentialSessionMaskedPreview>;

  return {
    tmdb: String(maskedPreview.tmdb || ''),
    mdblist: String(maskedPreview.mdblist || ''),
    fanart: String(maskedPreview.fanart || ''),
    simkl: String(maskedPreview.simkl || ''),
  };
};

const hasProviderCredentialSessionStatus = (value: ProviderCredentialSessionStatus) =>
  Boolean(value.tmdb || value.mdblist || value.fanart || value.simkl);

const buildProviderCredentialSessionPatch = (value: ProviderCredentialSessionPatch) => {
  const patch: Record<string, string> = {};

  if ('tmdbKey' in value) {
    patch.tmdbKey = String(value.tmdbKey || '').trim();
  }
  if ('mdblistKey' in value) {
    patch.mdblistKey = String(value.mdblistKey || '').trim();
  }
  if ('fanartKey' in value) {
    patch.fanartKey = String(value.fanartKey || '').trim();
  }
  if ('simklClientId' in value) {
    patch.simklClientId = String(value.simklClientId || '').trim();
  }

  return patch;
};

const areSetsEqual = (left: Set<string>, right: Set<string>) => {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
};

const readDocsCaptureConfig = () => {
  if (!DOCS_CAPTURE_ENABLED || typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);
  if (!readBooleanSearchParam(url.searchParams, 'docsCapture', false)) {
    return null;
  }

  const requestedPanels = readListSearchParam(url.searchParams, 'capturePanels').filter(isWorkspacePanelId);
  const panels = new Set<WorkspacePanelId>(
    requestedPanels.length > 0
      ? requestedPanels
      : ['configurator', 'center-view', 'quick-actions'],
  );
  const requestedCenterView = String(url.searchParams.get('captureWorkspaceCenterView') || '').trim().toLowerCase();
  const requestedExperienceMode = String(url.searchParams.get('captureExperience') || '').trim().toLowerCase();
  const requestedPreviewType = String(url.searchParams.get('capturePreviewType') || '').trim().toLowerCase();

  return {
    experienceMode: isConfiguratorExperienceMode(requestedExperienceMode)
      ? requestedExperienceMode
      : 'advanced',
    workspaceCenterView: isWorkspaceCenterView(requestedCenterView)
      ? requestedCenterView
      : 'showcase',
    previewType: isPreviewType(requestedPreviewType) ? requestedPreviewType : 'poster',
    requirePreview: readBooleanSearchParam(url.searchParams, 'captureRequirePreview', false),
    panels,
    tmdbKey: String(url.searchParams.get('captureTmdbKey') || '').trim(),
    mdblistKey: String(url.searchParams.get('captureMdblistKey') || '').trim(),
    proxyManifestUrl: String(url.searchParams.get('captureProxyManifestUrl') || '').trim(),
    proxyTranslateMeta: readBooleanSearchParam(url.searchParams, 'captureProxyTranslateMeta', false),
    proxyTranslateMetaMode: normalizeMetadataTranslationMode(
      url.searchParams.get('captureProxyTranslateMetaMode'),
      DEFAULT_METADATA_TRANSLATION_MODE,
    ),
    proxyDebugMetaTranslation: readBooleanSearchParam(
      url.searchParams,
      'captureProxyDebugMetaTranslation',
      false,
    ),
  };
};

export function useConfiguratorWorkspaceRuntime({
  envAccessKeys,
}: {
  envAccessKeys: ConfiguratorEnvAccessKeys;
}) {
  const baseUrl = normalizeBaseUrl(useClientOrigin());
  const docsCaptureConfig = useMemo(() => readDocsCaptureConfig(), []);
  const disableRemoteLookups = Boolean(docsCaptureConfig);
  const [configProfileUnlockSession, setConfigProfileUnlockSession] =
    useState<ConfigProfileUnlockSession | null>(null);
  const workspaceState = useConfiguratorWorkspaceState();
  const {
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
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropEpisodeArtwork,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeBackgroundOpacity,
    backdropGenreBadgeStyle,
    backdropImageSize,
    backdropImageText,
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
    thumbnailArtworkSource,
    thumbnailBottomRatingsRow,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgeMode,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
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
    thumbnailRatingRows,
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
    logoArtworkSource,
    logoBackground,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgeMode,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
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
    mdblistKey,
    mediaId,
    posterAggregateRatingSource,
    posterArtworkSource,
    posterEdgeOffset,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
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
    ageRatingBadgePosition,
    posterQualityBadgesPosition,
    posterQualityBadgesStyle,
    posterRemuxDisplayMode,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingPresentation,
    posterRingProgressSource,
    posterRingCriticsPriority,
    posterRingAudiencePriority,
    posterRingValueSource,
    posterRatingRows,
    posterRatingStyle,
    posterRatingsLayout,
    posterRatingsMax,
    posterRatingsMaxPerSide,
    posterSideRatingsOffset,
    posterSideRatingsPosition,
    posterStreamBadges,
    previewType,
    proxyCatalogRules,
    proxyDebugMetaTranslation,
    proxyManifestUrl,
    proxyTypes,
    proxyTranslateMeta,
    proxyTranslateMetaMode,
    qualityBadgesSide,
    posterNoBackgroundBadgeOutlineColor,
    posterNoBackgroundBadgeOutlineWidth,
    ageRatingTileColor,
    releaseStatusTileColor,
    qualityBadgesTileAccentColor,
    networkTileColor,
    genreBadgeTileAccentColor,
    communityBadgeTheme,
    ageRatingBadgeStyle,
    releaseStatusBadgeStyle,
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
    ratingBlackStripEnabled,
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
    setBackdropAggregateRatingSource,
    setBackdropArtworkSource,
    setBackdropEpisodeArtwork,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeBackgroundOpacity,
    setBackdropGenreBadgeStyle,
    setBackdropImageSize,
    setBackdropImageText,
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
    setThumbnailArtworkSource,
    setThumbnailBottomRatingsRow,
    setThumbnailGenreBadgeAnimeGrouping,
    setThumbnailGenreBadgeMode,
    setThumbnailGenreBadgePosition,
    setThumbnailGenreBadgeScale,
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
    setMdblistKey,
    setMediaId,
    setPosterAggregateRatingSource,
    setPosterRingProgressSource,
    setPosterRingCriticsPriority,
    setPosterRingAudiencePriority,
    setPosterRingValueSource,
    setPosterArtworkSource,
    setPosterEdgeOffset,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
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
    setAgeRatingBadgePosition,
    setPosterQualityBadgesPosition,
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
    setProxyCatalogRules,
    setProxyDebugMetaTranslation,
    setProxyManifestUrl,
    setProxyTypes,
    setProxyTranslateMeta,
    setProxyTranslateMetaMode,
    setQualityBadgesSide,
    setPosterNoBackgroundBadgeOutlineColor,
    setPosterNoBackgroundBadgeOutlineWidth,
    setAgeRatingTileColor,
    setReleaseStatusTileColor,
    setQualityBadgesTileAccentColor,
    setNetworkTileColor,
    setGenreBadgeTileAccentColor,
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
    setRatingXOffsetPillGlass,
    setRatingYOffsetPillGlass,
    setRatingXOffsetSquare,
    setRatingYOffsetSquare,
    setRatingProviderAppearanceOverrides,
    setRatingValueMode,
    setRatingBlackStripEnabled,
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
    thumbnailEpisodeArtwork,
    stickyPreviewEnabled,
    thumbnailRatingPreferences,
    tmdbIdScope,
    tmdbKey,
    workspaceCenterView,
  } = workspaceState;

  const [mediaSearchQuery, setMediaSearchQuery] = useState('');
  const [mediaSearchLoading, setMediaSearchLoading] = useState(false);
  const [mediaSearchError, setMediaSearchError] = useState('');
  const [mediaSearchResults, setMediaSearchResults] = useState<MediaSearchItem[]>([]);
  const [activePreviewTitle, setActivePreviewTitle] = useState('');
  const mediaSearchRequestIdRef = useRef(0);
  const mediaSearchAbortControllerRef = useRef<AbortController | null>(null);
  const [runtimeEnvAccessKeys, setRuntimeEnvAccessKeys] = useState(envAccessKeys);
  const resolvedForRef = useRef<string | null>(null);
  const [providerCredentialSessionStatus, setProviderCredentialSessionStatus] =
    useState<ProviderCredentialSessionStatus>(EMPTY_PROVIDER_CREDENTIAL_SESSION_STATUS);
  const [providerCredentialSessionMaskedPreview, setProviderCredentialSessionMaskedPreview] =
    useState<ProviderCredentialSessionMaskedPreview>(EMPTY_PROVIDER_CREDENTIAL_SESSION_MASKED_PREVIEW);
  const allowClientProviderCredentials = Boolean(
    docsCaptureConfig || hasProviderCredentialSessionStatus(providerCredentialSessionStatus),
  );
  const hasTmdbCredential =
    runtimeEnvAccessKeys.hasServerTmdbKey
    || providerCredentialSessionStatus.tmdb
    || Boolean(docsCaptureConfig && tmdbKey.trim());
  const [providerCredentialSessionVersion, setProviderCredentialSessionVersion] = useState(0);
  const refreshProviderCredentialSessionStatus = useCallback(async () => {
    const response = await fetch('/api/configurator-provider-credentials', {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error('Unable to load personal provider keys.');
    }

    const payload = (await response.json().catch(() => null)) as
      | { status?: ProviderCredentialSessionStatus; maskedPreview?: ProviderCredentialSessionMaskedPreview }
      | null;
    setProviderCredentialSessionStatus(readProviderCredentialSessionStatus(payload?.status));
    setProviderCredentialSessionMaskedPreview(
      readProviderCredentialSessionMaskedPreview(payload?.maskedPreview),
    );
  }, []);

  const savePersonalProviderKeys = useCallback(async (updates: ProviderCredentialSessionPatch) => {
    const response = await fetch('/api/configurator-provider-credentials', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify(buildProviderCredentialSessionPatch(updates)),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          status?: ProviderCredentialSessionStatus;
          maskedPreview?: ProviderCredentialSessionMaskedPreview;
        }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || 'Unable to save personal provider keys.');
    }

    setProviderCredentialSessionStatus(readProviderCredentialSessionStatus(payload?.status));
    setProviderCredentialSessionMaskedPreview(
      readProviderCredentialSessionMaskedPreview(payload?.maskedPreview),
    );
    setProviderCredentialSessionVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    void refreshProviderCredentialSessionStatus().catch(() => null);
  }, [refreshProviderCredentialSessionStatus]);

  const [pinnedTargets, setPinnedTargets] = useState<PinnedTargetsStore>(() => readPinnedTargetsFromStorage());

  const pinnedTargetsForType = useMemo(() => pinnedTargets[previewType] || [], [pinnedTargets, previewType]);
  const isPinnedLimitReached = pinnedTargetsForType.length >= PINNED_TARGETS_MAX_PER_TYPE;

  const isPinned = useCallback(
    (targetMediaId: string) => {
      const normalized = String(targetMediaId || '').trim().toLowerCase();
      return pinnedTargetsForType.some((p) => p.mediaId.trim().toLowerCase() === normalized);
    },
    [pinnedTargetsForType],
  );

  const handleAddPinnedTarget = useCallback(
    (target: PinnedTarget) => {
      setPinnedTargets((prev) => {
        const list = prev[previewType] || [];
        const normalizedNew = target.mediaId.trim().toLowerCase();
        if (list.some((p) => p.mediaId.trim().toLowerCase() === normalizedNew)) return prev;
        if (list.length >= PINNED_TARGETS_MAX_PER_TYPE) return prev;
        const next: PinnedTargetsStore = { ...prev, [previewType]: [...list, target] };
        writePinnedTargetsToStorage(next);
        return next;
      });
    },
    [previewType],
  );

  const handleRemovePinnedTarget = useCallback(
    (targetMediaId: string) => {
      setPinnedTargets((prev) => {
        const list = prev[previewType] || [];
        const normalized = targetMediaId.trim().toLowerCase();
        const filtered = list.filter((p) => p.mediaId.trim().toLowerCase() !== normalized);
        if (filtered.length === list.length) return prev;
        const next: PinnedTargetsStore = { ...prev, [previewType]: filtered };
        writePinnedTargetsToStorage(next);
        return next;
      });
    },
    [previewType],
  );

  const handleTogglePin = useCallback(() => {
    if (!mediaId.trim()) return;
    if (isPinned(mediaId)) {
      handleRemovePinnedTarget(mediaId);
    } else {
      const title =
        activePreviewTitle ||
        (previewType === 'thumbnail'
          ? `Target ${mediaId}`
          : `Target ${mediaId}`);
      handleAddPinnedTarget({ mediaId, title });
    }
  }, [mediaId, isPinned, handleRemovePinnedTarget, handleAddPinnedTarget, activePreviewTitle, previewType]);

  const handlePinSearchResult = useCallback(
    (result: MediaSearchItem) => {
      let pinTitle = result.year ? `${result.title} (${result.year})` : result.title;
      if (previewType === 'thumbnail') {
        const parsed = parseEpisodePreviewMediaTarget(result.mediaId);
        if (parsed) {
          pinTitle = `${pinTitle} S${String(parsed.seasonNumber).padStart(2, '0')}E${String(parsed.episodeNumber).padStart(2, '0')}`;
        }
      }
      handleAddPinnedTarget({ mediaId: result.mediaId, title: pinTitle });
    },
    [previewType, handleAddPinnedTarget],
  );

  const handleSelectPinnedTarget = useCallback(
    (target: PinnedTarget) => {
      mediaSearchAbortControllerRef.current?.abort();
      setMediaSearchLoading(false);
      setMediaId(target.mediaId);
      setActivePreviewTitle(target.title);
      setMediaSearchError('');
      setMediaSearchResults([]);
      setMediaSearchQuery('');
    },
    [setMediaId],
  );

  const [typeSwitchPending, setTypeSwitchPending] = useState<MediaSearchPreviewType | null>(null);
  const typeSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTypeSwitchBanner = useCallback(() => {
    setTypeSwitchPending(null);
    if (typeSwitchTimerRef.current) {
      clearTimeout(typeSwitchTimerRef.current);
      typeSwitchTimerRef.current = null;
    }
  }, []);

  const applyTypeSwitch = useCallback(
    (nextType: MediaSearchPreviewType, keepMedia: boolean) => {
      clearTypeSwitchBanner();
      if (keepMedia) {
        if (nextType === 'thumbnail') {
          const base = previewType === 'thumbnail'
            ? mediaId
            : mediaId.trim();
          const alreadyEpisode = parseEpisodePreviewMediaTarget(base);
          if (!alreadyEpisode) {
            const episodeId = buildEpisodePreviewMediaTarget({
              mediaId: base,
              seasonNumber: 1,
              episodeNumber: 1,
            });
            setMediaId(episodeId || base);
          }
        } else if (previewType === 'thumbnail') {
          const parsed = parseEpisodePreviewMediaTarget(mediaId);
          if (parsed) {
            setMediaId(parsed.mediaId);
          }
        }
        setPreviewType(nextType);
      } else {
        setPreviewType(nextType);
        const firstSample = MEDIA_TARGET_SAMPLE_IDS[nextType][0];
        setMediaId(firstSample?.id || '');
        setActivePreviewTitle(firstSample?.title || `Target ${firstSample?.id || ''}`);
        setMediaSearchError('');
        setMediaSearchResults([]);
        setMediaSearchQuery('');
      }
    },
    [clearTypeSwitchBanner, mediaId, previewType, setMediaId, setPreviewType],
  );

  const handlePreviewTypeChange = useCallback(
    (nextType: MediaSearchPreviewType) => {
      if (nextType === previewType) return;
      clearTypeSwitchBanner();
      applyTypeSwitch(nextType, true);
    },
    [previewType, clearTypeSwitchBanner, applyTypeSwitch],
  );

  const handleTypeSwitchKeep = useCallback(() => {
    if (typeSwitchPending) applyTypeSwitch(typeSwitchPending, true);
  }, [typeSwitchPending, applyTypeSwitch]);

  const handleTypeSwitchFresh = useCallback(() => {
    if (typeSwitchPending) applyTypeSwitch(typeSwitchPending, false);
  }, [typeSwitchPending, applyTypeSwitch]);

  useEffect(() => () => {
    if (typeSwitchTimerRef.current) clearTimeout(typeSwitchTimerRef.current);
  }, []);


  const handleMediaIdChange = (value: string) => {
    mediaSearchAbortControllerRef.current?.abort();
    setMediaId(value);
    setActivePreviewTitle('');
    setMediaSearchError('');
    setMediaSearchLoading(false);
    setMediaSearchResults([]);
    setMediaSearchQuery('');
  };

  const handleThumbnailEpisodeChange = (value: string) => {
    setMediaId(value);
  };

  const runMediaSearch = useCallback(async (
    query: string,
    options?: { showValidationErrors?: boolean },
  ) => {
    const showValidationErrors = options?.showValidationErrors === true;
    if (disableRemoteLookups) {
      setMediaSearchError('Search is disabled in docs capture mode.');
      setMediaSearchResults([]);
      setMediaSearchLoading(false);
      return;
    }

    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
      setMediaSearchError(showValidationErrors ? 'Enter a title to search.' : '');
      setMediaSearchResults([]);
      setMediaSearchLoading(false);
      return;
    }
    if (!hasTmdbCredential) {
      setMediaSearchError('Configure a server TMDB key to search by name.');
      setMediaSearchResults([]);
      setMediaSearchLoading(false);
      return;
    }

    mediaSearchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    mediaSearchAbortControllerRef.current = controller;
    const requestId = mediaSearchRequestIdRef.current + 1;
    mediaSearchRequestIdRef.current = requestId;

    setMediaSearchLoading(true);
    setMediaSearchError('');
    try {
      const target = new URL('/api/media-search', window.location.origin);
      target.searchParams.set('q', normalizedQuery);
      target.searchParams.set('previewType', previewType);
      target.searchParams.set('lang', lang);

      const response = await fetch(target.toString(), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as { items?: MediaSearchItem[]; error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || 'Search failed.');
      }
      if (mediaSearchRequestIdRef.current !== requestId) {
        return;
      }

      const nextResults = Array.isArray(payload?.items) ? payload.items : [];
      setMediaSearchResults(nextResults);
      if (nextResults.length === 0) {
        setMediaSearchError('No matches found for that title.');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (mediaSearchRequestIdRef.current !== requestId) {
        return;
      }
      setMediaSearchResults([]);
      setMediaSearchError(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      if (mediaSearchRequestIdRef.current === requestId) {
        setMediaSearchLoading(false);
      }
    }
  }, [disableRemoteLookups, hasTmdbCredential, lang, previewType]);

  const handleMediaSearchSubmit = useCallback(() => {
    void runMediaSearch(mediaSearchQuery, { showValidationErrors: true });
  }, [mediaSearchQuery, runMediaSearch]);

  const handleSelectMediaSearchResult = (result: MediaSearchItem) => {
    mediaSearchAbortControllerRef.current?.abort();
    setMediaSearchLoading(false);

    if (previewType === 'thumbnail') {
      const currentTarget = parseEpisodePreviewMediaTarget(mediaId);
      const resultTarget = parseEpisodePreviewMediaTarget(result.mediaId);
      const nextTarget = buildEpisodePreviewMediaTarget({
        mediaId: resultTarget?.mediaId || result.mediaId,
        seasonNumber: currentTarget?.seasonNumber || resultTarget?.seasonNumber || 1,
        episodeNumber: currentTarget?.episodeNumber || resultTarget?.episodeNumber || 1,
      });
      setMediaId(nextTarget || result.mediaId);
    } else {
      setMediaId(result.mediaId);
    }
    setActivePreviewTitle(result.year ? `${result.title} (${result.year})` : result.title);
    setMediaSearchError('');
    setMediaSearchResults([]);
    setMediaSearchQuery('');
  };

  const handleShuffleMediaTarget = () => {
    const nextSample = pickShuffledMediaTarget({
      previewType,
      currentMediaId: mediaId,
      pinnedTargets: pinnedTargetsForType,
    });
    if (!nextSample) {
      return;
    }

    mediaSearchAbortControllerRef.current?.abort();
    setMediaSearchLoading(false);
    setMediaId(nextSample.mediaId);
    setActivePreviewTitle(nextSample.title || `Target ${nextSample.mediaId}`);
    setMediaSearchError('');
    setMediaSearchResults([]);
    setMediaSearchQuery('');
  };

  useEffect(() => {
    const normalizedQuery = mediaSearchQuery.trim();
    if (!normalizedQuery) {
      mediaSearchAbortControllerRef.current?.abort();
      setMediaSearchLoading(false);
      setMediaSearchResults([]);
      setMediaSearchError('');
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void runMediaSearch(normalizedQuery);
    }, MEDIA_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mediaSearchQuery, runMediaSearch]);

  useEffect(() => () => {
    mediaSearchAbortControllerRef.current?.abort();
  }, []);

  const feeds = useConfiguratorFeeds({
    disabled: disableRemoteLookups,
  });

  const activeWorkspaceSettings = useConfiguratorActiveWorkspaceSettings({
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeBackgroundOpacity,
    backdropGenreBadgeStyle,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesMax,
    backdropQualityBadgesStyle,
    backdropRemuxDisplayMode,
    backdropRatingBadgeScale,
    backdropStreamBadges,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgeMode,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
    thumbnailGenreBadgeBorderWidth,
    thumbnailGenreBadgeBackgroundOpacity,
    thumbnailGenreBadgeStyle,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesMax,
    thumbnailQualityBadgesStyle,
    thumbnailRemuxDisplayMode,
    thumbnailRatingBadgeScale,
    thumbnailStreamBadges,
    logoStreamBadges,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgeMode,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
    logoGenreBadgeBorderWidth,
    logoGenreBadgeBackgroundOpacity,
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesMax,
    logoQualityBadgesStyle,
    logoRemuxDisplayMode,
    logoRatingBadgeScale,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
    posterGenreBadgeBorderWidth,
    posterGenreBadgeBackgroundOpacity,
    posterGenreBadgeStyle,
    posterQualityBadgePreferences,
    posterQualityBadgeScale,
    posterQualityBadgesMax,
    ageRatingBadgePosition,
    posterQualityBadgesStyle,
    posterRemuxDisplayMode,
    posterRatingBadgeScale,
    posterRatingsLayout,
    posterStreamBadges,
    previewType,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeBackgroundOpacity,
    setBackdropGenreBadgeStyle,
    setBackdropQualityBadgePreferences,
    setBackdropQualityBadgeScale,
    setBackdropQualityBadgesMax,
    setBackdropQualityBadgesStyle,
    setBackdropRemuxDisplayMode,
    setBackdropRatingBadgeScale,
    setBackdropStreamBadges,
    setThumbnailGenreBadgeAnimeGrouping,
    setThumbnailGenreBadgeMode,
    setThumbnailGenreBadgePosition,
    setThumbnailGenreBadgeScale,
    setThumbnailGenreBadgeBorderWidth,
    setThumbnailGenreBadgeBackgroundOpacity,
    setThumbnailGenreBadgeStyle,
    setThumbnailQualityBadgePreferences,
    setThumbnailQualityBadgeScale,
    setThumbnailQualityBadgesMax,
    setThumbnailQualityBadgesStyle,
    setThumbnailRemuxDisplayMode,
    setThumbnailRatingBadgeScale,
    setThumbnailStreamBadges,
    setLogoStreamBadges,
    setLogoGenreBadgeAnimeGrouping,
    setLogoGenreBadgeMode,
    setLogoGenreBadgePosition,
    setLogoGenreBadgeScale,
    setLogoGenreBadgeBorderWidth,
    setLogoGenreBadgeBackgroundOpacity,
    setLogoGenreBadgeStyle,
    setLogoQualityBadgePreferences,
    setLogoQualityBadgeScale,
    setLogoQualityBadgesMax,
    setLogoQualityBadgesStyle,
    setLogoRemuxDisplayMode,
    setLogoRatingBadgeScale,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeBorderWidth,
    setPosterGenreBadgeBackgroundOpacity,
    setPosterGenreBadgeStyle,
    setPosterQualityBadgePreferences,
    setPosterQualityBadgeScale,
    setPosterQualityBadgesMax,
    setAgeRatingBadgePosition,
    setPosterQualityBadgesStyle,
    setPosterRemuxDisplayMode,
    setPosterRatingBadgeScale,
    setPosterStreamBadges,
  });
  const {
    activeGenreBadgeAnimeGrouping,
    activeGenreBadgeMode,
    activeGenreBadgePosition,
    activeGenreBadgeScale,
    activeGenreBadgeBorderWidth,
    activeGenreBadgeBackgroundOpacity,
    activeGenreBadgeStyle,
    activeQualityBadgesMax,
    setActiveQualityBadgePreferences,
  } = activeWorkspaceSettings;

  const pageChrome = useConfiguratorPageChrome({
    disableRemoteLookups,
    initialSupportedLanguages: SUPPORTED_LANGUAGES,
    providerCredentialSessionVersion,
  });

  const workspaceConfigIo = useConfiguratorWorkspaceConfigIo({
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
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropEpisodeArtwork,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeBackgroundOpacity,
    backdropGenreBadgeStyle,
    backdropImageSize,
    backdropImageText,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesStyle,
    backdropRemuxDisplayMode,
    backdropQualityBadgesMax,
    backdropRatingBadgeScale,
    backdropRatingPreferences,
    backdropRatingRows,
    backdropRatingPresentation,
    backdropRatingStyle,
    backdropRatingsLayout,
    backdropRatingsMax,
    backdropBottomRatingsRow,
    backdropSideRatingsOffset,
    backdropSideRatingsPosition,
    backdropStreamBadges,
    thumbnailAggregateRatingSource,
    thumbnailArtworkSource,
    thumbnailBottomRatingsRow,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgeMode,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
    thumbnailGenreBadgeBorderWidth,
    thumbnailGenreBadgeBackgroundOpacity,
    thumbnailGenreBadgeStyle,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesStyle,
    thumbnailRemuxDisplayMode,
    thumbnailQualityBadgesMax,
    thumbnailRatingBadgeScale,
    thumbnailRatingPreferences,
    thumbnailRatingPresentation,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailRatingsMax,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    thumbnailStreamBadges,
    logoStreamBadges,
    episodeIdMode,
    xrdbKey,
    fanartKey,
    lang,
    logoAggregateRatingSource,
    logoArtworkSource,
    logoBackground,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgeMode,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
    logoGenreBadgeBorderWidth,
    logoGenreBadgeBackgroundOpacity,
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesStyle,
    logoRemuxDisplayMode,
    logoQualityBadgesMax,
    logoRatingBadgeScale,
    logoRatingPreferences,
    logoRatingRows,
    logoRatingPresentation,
    logoRatingStyle,
    logoRatingsMax,
    logoBottomRatingsRow,
    mdblistKey,
    posterAggregateRatingSource,
    posterRingProgressSource,
    posterRingCriticsPriority,
    posterRingAudiencePriority,
    posterRingValueSource,
    posterArtworkSource,
    posterEdgeOffset,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
    posterGenreBadgeBorderWidth,
    posterGenreBadgeBackgroundOpacity,
    posterGenreBadgeStyle,
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
    posterQualityBadgesPosition,
    ageRatingBadgePosition,
    posterQualityBadgesStyle,
    posterRemuxDisplayMode,
    posterQualityBadgesMax,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingRows,
    posterRatingPresentation,
    posterRatingStyle,
    posterRatingsLayout,
    posterRatingsMax,
    posterRatingsMaxPerSide,
    posterSideRatingsOffset,
    posterSideRatingsPosition,
    posterStreamBadges,
    proxyCatalogRules,
    proxyDebugMetaTranslation,
    proxyManifestUrl,
    proxyTypes,
    proxyTranslateMeta,
    proxyTranslateMetaMode,
    qualityBadgesSide,
    posterNoBackgroundBadgeOutlineColor,
    posterNoBackgroundBadgeOutlineWidth,
    ageRatingTileColor,
    releaseStatusTileColor,
    qualityBadgesTileAccentColor,
    networkTileColor,
    genreBadgeTileAccentColor,
    communityBadgeTheme,
    ageRatingBadgeStyle,
    releaseStatusBadgeStyle,
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
    setBackdropAggregateRatingSource,
    setBackdropArtworkSource,
    setBackdropEpisodeArtwork,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeBackgroundOpacity,
    setBackdropGenreBadgeStyle,
    setBackdropImageSize,
    setBackdropImageText,
    setBackdropQualityBadgePreferences,
    setBackdropQualityBadgeScale,
    setBackdropQualityBadgesStyle,
    setBackdropRemuxDisplayMode,
    setBackdropQualityBadgesMax,
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
    setThumbnailArtworkSource,
    setThumbnailBottomRatingsRow,
    setThumbnailGenreBadgeAnimeGrouping,
    setThumbnailGenreBadgeMode,
    setThumbnailGenreBadgePosition,
    setThumbnailGenreBadgeScale,
    setThumbnailGenreBadgeBorderWidth,
    setThumbnailGenreBadgeBackgroundOpacity,
    setThumbnailGenreBadgeStyle,
    setThumbnailImageText,
    setThumbnailQualityBadgePreferences,
    setThumbnailQualityBadgeScale,
    setThumbnailQualityBadgesStyle,
    setThumbnailRemuxDisplayMode,
    setThumbnailQualityBadgesMax,
    setThumbnailRatingBadgeScale,
    setThumbnailRatingPresentation,
    setThumbnailRatingStyle,
    setThumbnailRatingsLayout,
    setThumbnailRatingsMax,
    setThumbnailSideRatingsOffset,
    setThumbnailSideRatingsPosition,
    setThumbnailStreamBadges,
    setLogoStreamBadges,
    setEpisodeIdMode,
    setXrdbKey,
    setFanartKey,
    setLang,
    setLogoAggregateRatingSource,
    setLogoArtworkSource,
    setLogoBackground,
    setLogoGenreBadgeAnimeGrouping,
    setLogoGenreBadgeMode,
    setLogoGenreBadgePosition,
    setLogoGenreBadgeScale,
    setLogoGenreBadgeBorderWidth,
    setLogoGenreBadgeBackgroundOpacity,
    setLogoGenreBadgeStyle,
    setLogoQualityBadgePreferences,
    setLogoQualityBadgeScale,
    setLogoQualityBadgesStyle,
    setLogoRemuxDisplayMode,
    setLogoQualityBadgesMax,
    setLogoRatingBadgeScale,
    setLogoRatingPresentation,
    setLogoRatingRows,
    setLogoRatingStyle,
    setLogoRatingsMax,
    setLogoBottomRatingsRow,
    setMdblistKey,
    setPosterAggregateRatingSource,
    setPosterRingProgressSource,
    setPosterRingCriticsPriority,
    setPosterRingAudiencePriority,
    setPosterRingValueSource,
    setPosterArtworkSource,
    setPosterEdgeOffset,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeBorderWidth,
    setPosterGenreBadgeBackgroundOpacity,
    setPosterGenreBadgeStyle,
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
    setPosterQualityBadgesPosition,
    setAgeRatingBadgePosition,
    setPosterQualityBadgesStyle,
    setPosterRemuxDisplayMode,
    setPosterQualityBadgesMax,
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
    setProxyCatalogRules,
    setProxyDebugMetaTranslation,
    setProxyManifestUrl,
    setProxyTypes,
    setProxyTranslateMeta,
    setProxyTranslateMetaMode,
    setQualityBadgesSide,
    setPosterNoBackgroundBadgeOutlineColor,
    setPosterNoBackgroundBadgeOutlineWidth,
    setAgeRatingTileColor,
    setReleaseStatusTileColor,
    setQualityBadgesTileAccentColor,
    setNetworkTileColor,
    setGenreBadgeTileAccentColor,
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
    setRatingXOffsetPillGlass,
    setRatingYOffsetPillGlass,
    setRatingXOffsetSquare,
    setRatingYOffsetSquare,
    setRatingProviderAppearanceOverrides,
    setRatingValueMode,
    setRatingBlackStripEnabled,
    setSimklClientId,
    setThumbnailRatingRows,
    setThumbnailEpisodeArtwork,
    setTmdbIdScope,
    setTmdbKey,
    simklClientId,
    thumbnailEpisodeArtwork,
    tmdbIdScope,
    tmdbKey,
  });
  const { applySavedUiConfig, buildCurrentUiConfig } = workspaceConfigIo;

  const workspaceStorage = useConfiguratorWorkspaceStorage({
    applySavedUiConfig,
    buildCurrentUiConfig,
    previewType,
    setPreviewType,
    setMediaId,
    stickyPreviewEnabled,
    experienceMode,
    selectedPresetId,
    setStickyPreviewEnabled,
    setExperienceMode,
    setExperienceModeDraft,
    setShowExperienceModal,
    setSelectedPresetId,
    activePreviewTitle,
    setActivePreviewTitle,
    mediaId,
  });

  useEffect(() => {
    const restoredSession = parseConfigProfileUnlockSession(
      window.sessionStorage.getItem(CONFIG_PROFILE_UNLOCK_SESSION_STORAGE_KEY),
    );

    if (restoredSession) {
      setConfigProfileUnlockSession(restoredSession);
      return;
    }

    window.sessionStorage.removeItem(CONFIG_PROFILE_UNLOCK_SESSION_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const serializedSession = serializeConfigProfileUnlockSession(configProfileUnlockSession);

    if (serializedSession) {
      window.sessionStorage.setItem(CONFIG_PROFILE_UNLOCK_SESSION_STORAGE_KEY, serializedSession);
      return;
    }

    window.sessionStorage.removeItem(CONFIG_PROFILE_UNLOCK_SESSION_STORAGE_KEY);
  }, [configProfileUnlockSession]);

  const clearConfigProfileUnlockSession = useCallback(() => {
    setConfigProfileUnlockSession(null);
  }, []);

  useEffect(() => {
    if (!configProfileUnlockSession) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setConfigProfileUnlockSession((current) =>
        current && current.profileId === configProfileUnlockSession.profileId
          ? null
          : current,
      );
    }, Math.max(configProfileUnlockSession.expiresAt - Date.now(), 0));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [configProfileUnlockSession]);

  const { applyWorkspaceConfig, uiSettingsLoaded } = workspaceStorage;

  useEffect(() => {
    const stateBackedProviderKeys = buildProviderCredentialSessionPatch({
      tmdbKey,
      mdblistKey,
      fanartKey,
      simklClientId,
    });
    const hasStateBackedProviderKeys = Object.values(stateBackedProviderKeys).some(Boolean);

    if (!hasStateBackedProviderKeys) {
      return;
    }

    if (docsCaptureConfig) {
      void savePersonalProviderKeys(stateBackedProviderKeys).catch(() => null);
      return;
    }

    if (!uiSettingsLoaded) {
      return;
    }

    let cancelled = false;

    void savePersonalProviderKeys(stateBackedProviderKeys)
      .then(() => {
        if (cancelled) {
          return;
        }

        if (tmdbKey.trim()) {
          setTmdbKey('');
        }
        if (mdblistKey.trim()) {
          setMdblistKey('');
        }
        if (fanartKey.trim()) {
          setFanartKey('');
        }
        if (simklClientId.trim()) {
          setSimklClientId('');
        }
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [
    docsCaptureConfig,
    fanartKey,
    mdblistKey,
    savePersonalProviderKeys,
    setFanartKey,
    setMdblistKey,
    setSimklClientId,
    setTmdbKey,
    simklClientId,
    tmdbKey,
    uiSettingsLoaded,
  ]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch('/api/configurator-env-access-keys', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Unable to load configurator env access keys.');
      }
      const keys = (await response.json()) as ConfiguratorEnvAccessKeys;
      if (!active) {
        return;
      }
      setRuntimeEnvAccessKeys(keys);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!uiSettingsLoaded) return;
    if (activePreviewTitle) {
      resolvedForRef.current = mediaId;
      return;
    }
    if (resolvedForRef.current === mediaId) return;
    resolvedForRef.current = mediaId;
    const sample = findSampleTitleByMediaId(mediaId);
    if (sample) {
      setActivePreviewTitle(sample);
      return;
    }
    if (!hasTmdbCredential || disableRemoteLookups) return;
    const episodeTarget = parseEpisodePreviewMediaTarget(mediaId);
    const baseId = episodeTarget ? episodeTarget.mediaId : mediaId;
    const resolveId = baseId.startsWith('tmdb:') ? baseId : baseId.split(':')[0];
    const target = new URL('/api/media-resolve', window.location.origin);
    target.searchParams.set('id', resolveId);
    void fetch(target.toString(), { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json().catch(() => null) as { title: string | null } | null;
        if (data?.title) setActivePreviewTitle(data.title);
      })
      .catch(() => null);
  }, [
    uiSettingsLoaded,
    activePreviewTitle,
    mediaId,
    providerCredentialSessionVersion,
    hasTmdbCredential,
    disableRemoteLookups,
  ]);


  const workspaceOutputs = useConfiguratorOutputs({
    allowClientProviderCredentials,
    activeGenreBadgeAnimeGrouping,
    activeGenreBadgeMode,
    activeGenreBadgePosition,
    activeGenreBadgeScale,
    activeGenreBadgeBorderWidth,
    activeGenreBadgeBackgroundOpacity,
    activeGenreBadgeStyle,
    activeQualityBadgesMax,
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
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeBackgroundOpacity,
    backdropGenreBadgeStyle,
    backdropImageSize,
    backdropImageText,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesStyle,
    backdropRemuxDisplayMode,
    backdropRatingBadgeScale,
    backdropRatingPreferences,
    backdropRatingPresentation,
    backdropRatingStyle,
    backdropRatingsLayout,
    backdropRatingsMax,
    backdropBottomRatingsRow,
    backdropSideRatingsOffset,
    backdropSideRatingsPosition,
    backdropStreamBadges,
    thumbnailAggregateRatingSource,
    thumbnailArtworkSource,
    thumbnailBottomRatingsRow,
    thumbnailEpisodeArtwork,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
    thumbnailGenreBadgeBorderWidth,
    thumbnailGenreBadgeBackgroundOpacity,
    thumbnailGenreBadgeStyle,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesStyle,
    thumbnailRemuxDisplayMode,
    thumbnailRatingBadgeScale,
    thumbnailRatingPreferences,
    thumbnailRatingPresentation,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailRatingsMax,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    thumbnailStreamBadges,
    logoStreamBadges,
    baseUrl,
    buildCurrentUiConfig,
    aiometadataEpisodeIdMode,
    xrdbKey,
    fanartKey,
    genrePreviewMode,
    hideAiometadataCredentials,
    hasServerMdblistKey: runtimeEnvAccessKeys.hasServerMdblistKey,
    hasServerTmdbKey: runtimeEnvAccessKeys.hasServerTmdbKey,
    isLatestReleaseLoading: feeds.isLatestReleaseLoading,
    lang,
    latestReleaseTag: feeds.latestReleaseTag,
    logoAggregateRatingSource,
    logoArtworkSource,
    logoBackground,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
    logoGenreBadgeBorderWidth,
    logoGenreBadgeBackgroundOpacity,
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesStyle,
    logoRemuxDisplayMode,
    logoRatingBadgeScale,
    logoRatingPreferences,
    logoRatingPresentation,
    logoRatingStyle,
    logoRatingsMax,
    logoBottomRatingsRow,
    mdblistKey,
    mediaId,
    pendingReleaseTag: feeds.pendingReleaseTag,
    posterAggregateRatingSource,
    posterArtworkSource,
    posterEdgeOffset,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
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
    posterQualityBadgesPosition,
    ageRatingBadgePosition,
    posterQualityBadgesStyle,
    posterRemuxDisplayMode,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingPresentation,
    posterRingProgressSource,
    posterRingCriticsPriority,
    posterRingAudiencePriority,
    posterRingValueSource,
    posterRatingStyle,
    posterRatingsLayout,
    posterRatingsMax,
    posterRatingsMaxPerSide,
    posterSideRatingsOffset,
    posterSideRatingsPosition,
    posterStreamBadges,
    previewType,
    proxyUrlVisible: showProxyUrl,
    qualityBadgesSide,
    posterNoBackgroundBadgeOutlineColor,
    posterNoBackgroundBadgeOutlineWidth,
    ageRatingTileColor,
    releaseStatusTileColor,
    qualityBadgesTileAccentColor,
    networkTileColor,
    genreBadgeTileAccentColor,
    communityBadgeTheme,
    ageRatingBadgeStyle,
    releaseStatusBadgeStyle,
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
    ratingBlackStripEnabled,
    showConfigString,
    shouldShowQualityBadgesPosition: activeWorkspaceSettings.shouldShowQualityBadgesPosition,
    shouldShowQualityBadgesSide: activeWorkspaceSettings.shouldShowQualityBadgesSide,
    providerCredentialSessionVersion,
    simklClientId,
    tmdbIdScope,
    tmdbKey,
  });
  const { aiometadataCopyBlock, configString, genrePreviewCards, previewLoaded, proxyUrl } = workspaceOutputs;

  const workspaceUi = useConfiguratorWorkspaceUi<WorkspacePanelId, WorkspaceSectionId>({
    aiometadataCopyBlock,
    configString,
    experienceModeDraft,
    initialOpenPanels: ['configurator', 'center-view', 'quick-actions'],
    proxyUrl,
    setShowConfigString,
    setShowProxyUrl,
    setExperienceMode,
    setExperienceModeDraft,
    setShowExperienceModal,
    showConfigString,
    showExperienceModal,
    showProxyUrl,
  });
  const {
    handleContinueExperienceMode,
    handleExitWizard,
    openWorkspacePanels,
    setOpenWorkspacePanels,
  } = workspaceUi;

  useEffect(() => {
    mediaSearchAbortControllerRef.current?.abort();
    setMediaSearchLoading(false);
    setMediaSearchResults([]);
    setMediaSearchError('');
  }, [previewType]);

  useEffect(() => {
    if (!docsCaptureConfig) {
      return;
    }

    if (experienceMode !== docsCaptureConfig.experienceMode) {
      setExperienceMode(docsCaptureConfig.experienceMode);
    }

    if (experienceModeDraft !== docsCaptureConfig.experienceMode) {
      setExperienceModeDraft(docsCaptureConfig.experienceMode);
    }

    if (showExperienceModal) {
      setShowExperienceModal(false);
    }

    if (workspaceCenterView !== docsCaptureConfig.workspaceCenterView) {
      setWorkspaceCenterView(docsCaptureConfig.workspaceCenterView);
    }

    if (previewType !== docsCaptureConfig.previewType) {
      setPreviewType(docsCaptureConfig.previewType);
    }

    if (tmdbKey.trim() !== docsCaptureConfig.tmdbKey) {
      setTmdbKey(docsCaptureConfig.tmdbKey);
    }

    if (mdblistKey.trim() !== docsCaptureConfig.mdblistKey) {
      setMdblistKey(docsCaptureConfig.mdblistKey);
    }

    if (proxyManifestUrl.trim() !== docsCaptureConfig.proxyManifestUrl) {
      setProxyManifestUrl(docsCaptureConfig.proxyManifestUrl);
    }

    if (proxyTranslateMeta !== docsCaptureConfig.proxyTranslateMeta) {
      setProxyTranslateMeta(docsCaptureConfig.proxyTranslateMeta);
    }

    if (proxyTranslateMetaMode !== docsCaptureConfig.proxyTranslateMetaMode) {
      setProxyTranslateMetaMode(docsCaptureConfig.proxyTranslateMetaMode);
    }

    if (proxyDebugMetaTranslation !== docsCaptureConfig.proxyDebugMetaTranslation) {
      setProxyDebugMetaTranslation(docsCaptureConfig.proxyDebugMetaTranslation);
    }

    setPosterRatingRows(DOCS_CAPTURE_RATING_ROWS);
    setBackdropRatingRows(DOCS_CAPTURE_RATING_ROWS);
    setThumbnailRatingRows(DOCS_CAPTURE_RATING_ROWS);
    setLogoRatingRows(DOCS_CAPTURE_RATING_ROWS);
    setPosterQualityBadgePreferences(DOCS_CAPTURE_QUALITY_BADGE_PREFERENCES);
    setBackdropQualityBadgePreferences(DOCS_CAPTURE_QUALITY_BADGE_PREFERENCES);
    setThumbnailQualityBadgePreferences(DOCS_CAPTURE_QUALITY_BADGE_PREFERENCES);
    setLogoQualityBadgePreferences(DOCS_CAPTURE_QUALITY_BADGE_PREFERENCES);
    setPosterStreamBadges('off');
    setBackdropStreamBadges('off');
    setThumbnailStreamBadges('off');
    setLogoStreamBadges('off');
    setPosterRatingsMax(1);
    setBackdropRatingsMax(1);
    setThumbnailRatingsMax(1);
    setLogoRatingsMax(1);

    if (!areSetsEqual(openWorkspacePanels, docsCaptureConfig.panels)) {
      setOpenWorkspacePanels(new Set(docsCaptureConfig.panels));
    }
  }, [
    setBackdropQualityBadgePreferences,
    setBackdropRatingRows,
    setBackdropRatingsMax,
    setBackdropStreamBadges,
    docsCaptureConfig,
    experienceMode,
    experienceModeDraft,
    mdblistKey,
    previewType,
    proxyDebugMetaTranslation,
    proxyManifestUrl,
    proxyTranslateMeta,
    proxyTranslateMetaMode,
    setExperienceMode,
    setExperienceModeDraft,
    setLogoQualityBadgePreferences,
    setLogoRatingRows,
    setLogoRatingsMax,
    setMdblistKey,
    setPosterQualityBadgePreferences,
    setPosterRatingRows,
    setPosterRatingsMax,
    setPosterStreamBadges,
    setPreviewType,
    setProxyDebugMetaTranslation,
    setProxyManifestUrl,
    setProxyTranslateMeta,
    setProxyTranslateMetaMode,
    setShowExperienceModal,
    setOpenWorkspacePanels,
    setThumbnailQualityBadgePreferences,
    setThumbnailRatingRows,
    setThumbnailRatingsMax,
    setThumbnailStreamBadges,
    setLogoStreamBadges,
    setTmdbKey,
    setWorkspaceCenterView,
    showExperienceModal,
    tmdbKey,
    workspaceCenterView,
    openWorkspacePanels,
  ]);

  const docsCaptureReady = Boolean(
    docsCaptureConfig
    && !showExperienceModal
    && experienceMode === docsCaptureConfig.experienceMode
    && experienceModeDraft === docsCaptureConfig.experienceMode
    && workspaceCenterView === docsCaptureConfig.workspaceCenterView
    && previewType === docsCaptureConfig.previewType
    && tmdbKey.trim() === docsCaptureConfig.tmdbKey
    && mdblistKey.trim() === docsCaptureConfig.mdblistKey
    && proxyManifestUrl.trim() === docsCaptureConfig.proxyManifestUrl
    && proxyTranslateMeta === docsCaptureConfig.proxyTranslateMeta
    && proxyTranslateMetaMode === docsCaptureConfig.proxyTranslateMetaMode
    && proxyDebugMetaTranslation === docsCaptureConfig.proxyDebugMetaTranslation
    && (!docsCaptureConfig.requirePreview || previewLoaded)
    && areSetsEqual(openWorkspacePanels, docsCaptureConfig.panels),
  );

  const workspaceActions = useConfiguratorWorkspaceActions({
    applyWorkspaceConfig,
    buildCurrentUiConfig,
    handleExitWizard,
    previewType,
    setActiveQualityBadgePreferences,
    setBackdropRatingRows,
    setLogoRatingRows,
    setPosterRatingRows,
    setRatingProviderAppearanceOverrides,
    setSelectedPresetId,
    setThumbnailRatingRows,
  });

  const workspaceSummary = useConfiguratorWorkspaceSummary({
    activeProviderEditorId,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateCriticsAccentColor,
    aggregateDynamicStops,
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropArtworkSourceOptions: BACKDROP_ARTWORK_SOURCE_OPTIONS,
    thumbnailBottomRatingsRow,
    backdropImageSize,
    backdropImageText,
    backdropImageSizeOptions: BACKDROP_IMAGE_SIZE_OPTIONS,
    backdropImageTextOptions: BACKDROP_IMAGE_TEXT_OPTIONS,
    backdropRatingPresentation,
    backdropRatingRows,
    backdropRatingStyle,
    backdropRatingsLayout,
    backdropBottomRatingsRow,
    backdropSideRatingsOffset,
    backdropSideRatingsPosition,
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
    thumbnailAggregateRatingSource,
    thumbnailArtworkSource,
    thumbnailImageText,
    thumbnailRatingPresentation,
    thumbnailRatingRows,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    configString,
    genrePreviewCards,
    genrePreviewMode,
    logoAggregateRatingSource,
    logoArtworkSource,
    logoArtworkSourceOptions: LOGO_ARTWORK_SOURCE_OPTIONS,
    logoRatingPresentation,
    logoRatingRows,
    logoRatingStyle,
    posterAggregateRatingSource,
    posterArtworkSource,
    posterArtworkSourceOptions: POSTER_ARTWORK_SOURCE_OPTIONS,
    posterImageSize,
    posterImageSizeOptions: POSTER_IMAGE_SIZE_OPTIONS,
    posterImageText,
    posterImageTextOptions: POSTER_IMAGE_TEXT_OPTIONS,
    posterRatingPresentation,
    posterRatingRows,
    posterRatingStyle,
    posterRatingsLayout,
    posterSideRatingsOffset,
    posterSideRatingsPosition,
    previewType,
    proxyUrl,
    selectedPresetId,
    setBackdropAggregateRatingSource,
    setBackdropImageText,
    setBackdropRatingPresentation,
    setBackdropRatingStyle,
    setBackdropSideRatingsOffset,
    setBackdropSideRatingsPosition,
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
    setRatingXOffsetPillGlass,
    setRatingYOffsetPillGlass,
    setRatingXOffsetSquare,
    setRatingYOffsetSquare,
    setThumbnailAggregateRatingSource,
    setThumbnailImageText,
    setThumbnailRatingPresentation,
    setThumbnailRatingStyle,
    setThumbnailSideRatingsOffset,
    setThumbnailSideRatingsPosition,
    setLogoAggregateRatingSource,
    setLogoRatingPresentation,
    setLogoRatingStyle,
    setPosterAggregateRatingSource,
    setPosterImageText,
    setPosterRatingPresentation,
    setPosterRatingStyle,
    setPosterSideRatingsOffset,
    setPosterSideRatingsPosition,
    wizardAnswers: workspaceUi.wizardAnswers,
    wizardQuestionIndex: workspaceUi.wizardQuestionIndex,
  });

  const {
    inputsPanelProps,
    workspaceColumnsProps,
  } = buildConfiguratorPageProps({
    activeWorkspaceSettings,
    baseUrl,
    hasServerFanartKey: runtimeEnvAccessKeys.hasServerFanartKey,
    hasServerMdblistKey: runtimeEnvAccessKeys.hasServerMdblistKey,
    hasServerSimklClientId: runtimeEnvAccessKeys.hasServerSimklClientId,
    hasServerTmdbKey: runtimeEnvAccessKeys.hasServerTmdbKey,
    mediaTargetSearch: {
      onMediaIdChange: handleMediaIdChange,
      onThumbnailEpisodeChange: handleThumbnailEpisodeChange,
      mediaSearchQuery,
      mediaSearchLoading,
      mediaSearchError,
      mediaSearchResults,
      activePreviewTitle,
      onMediaSearchQueryChange: setMediaSearchQuery,
      onMediaSearchSubmit: handleMediaSearchSubmit,
      onSelectMediaSearchResult: handleSelectMediaSearchResult,
      onShuffleMediaTarget: handleShuffleMediaTarget,
      pinnedTargets: pinnedTargetsForType,
      isPinnedLimitReached,
      isPinned,
      onTogglePin: handleTogglePin,
      onPinSearchResult: handlePinSearchResult,
      onRemovePinnedTarget: handleRemovePinnedTarget,
      onSelectPinnedTarget: handleSelectPinnedTarget,
      onPreviewTypeChange: handlePreviewTypeChange,
    },
    outputs: workspaceOutputs,
    pageChrome,
    workspaceActions,
    workspaceState: {
      ...workspaceState,
      personalProviderKeyStatus: providerCredentialSessionStatus,
      personalProviderKeyMaskedPreview: providerCredentialSessionMaskedPreview,
      savePersonalProviderKeys,
    },
    workspaceStorage,
    workspaceSummary,
    workspaceUi,
  });

  return {
    applySavedUiConfig,
    buildCurrentUiConfig,
    clearConfigProfileUnlockSession,
    configProfileUnlockSession,
    docsCaptureReady,
    experienceModeDraft,
    handleContinueExperienceMode,
    inputsPanelProps,
    isDocsCapture: Boolean(docsCaptureConfig),
    pageRef: pageChrome.pageRef,
    setConfigProfileUnlockSession,
    setExperienceModeDraft,
    showExperienceModal,
    uiSettingsLoaded,
    workspaceColumnsProps,
  };
}
