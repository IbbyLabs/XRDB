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
  pickShuffledMediaTarget,
  type MediaSearchItem,
} from '@/lib/configuratorMediaSearch';

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

const DOCS_CAPTURE_ENABLED = process.env.NEXT_PUBLIC_XRDB_ENABLE_DOCS_CAPTURE === 'true';
const DOCS_CAPTURE_RATING_ROWS = enabledOrderedToRows(['tmdb']);
const DOCS_CAPTURE_QUALITY_BADGE_PREFERENCES: MediaFeatureBadgeKey[] = [];
const MEDIA_SEARCH_DEBOUNCE_MS = 140;
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

export function useConfiguratorWorkspaceRuntime() {
  const baseUrl = normalizeBaseUrl(useClientOrigin());
  const docsCaptureConfig = useMemo(() => readDocsCaptureConfig(), []);
  const disableRemoteLookups = Boolean(docsCaptureConfig);
  const workspaceState = useConfiguratorWorkspaceState();
  const {
    activeProviderEditorId,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateCriticsAccentColor,
    aggregateDynamicStops,
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropEpisodeArtwork,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeStyle,
    backdropImageSize,
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
    thumbnailAggregateRatingSource,
    thumbnailArtworkSource,
    thumbnailBottomRatingsRow,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgeMode,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
    thumbnailGenreBadgeBorderWidth,
    thumbnailGenreBadgeStyle,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesMax,
    thumbnailQualityBadgesStyle,
    thumbnailRatingBadgeScale,
    thumbnailRatingRows,
    thumbnailRatingPresentation,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailRatingsMax,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    thumbnailStreamBadges,
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
    posterGenreBadgeBorderWidth,
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
    posterQualityBadgesStyle,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingPresentation,
    posterRingProgressSource,
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
    selectedPresetId,
    setActiveProviderEditorId,
    setAggregateAccentBarOffset,
    setAggregateAccentBarVisible,
    setAggregateAccentColor,
    setAggregateAccentMode,
    setAggregateAudienceAccentColor,
    setAggregateCriticsAccentColor,
    setAggregateDynamicStops,
    setBackdropAggregateRatingSource,
    setBackdropArtworkSource,
    setBackdropEpisodeArtwork,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeStyle,
    setBackdropImageSize,
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
    setThumbnailAggregateRatingSource,
    setThumbnailArtworkSource,
    setThumbnailBottomRatingsRow,
    setThumbnailGenreBadgeAnimeGrouping,
    setThumbnailGenreBadgeMode,
    setThumbnailGenreBadgePosition,
    setThumbnailGenreBadgeScale,
    setThumbnailGenreBadgeBorderWidth,
    setThumbnailGenreBadgeStyle,
    setThumbnailImageText,
    setThumbnailQualityBadgePreferences,
    setThumbnailQualityBadgeScale,
    setThumbnailQualityBadgesMax,
    setThumbnailQualityBadgesStyle,
    setThumbnailRatingBadgeScale,
    setThumbnailRatingPresentation,
    setThumbnailRatingStyle,
    setThumbnailRatingsLayout,
    setThumbnailRatingsMax,
    setThumbnailSideRatingsOffset,
    setThumbnailSideRatingsPosition,
    setThumbnailStreamBadges,
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
    setPosterRingProgressSource,
    setPosterRingValueSource,
    setPosterArtworkSource,
    setPosterEdgeOffset,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeBorderWidth,
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
    setProxyCatalogRules,
    setProxyDebugMetaTranslation,
    setProxyManifestUrl,
    setProxyTypes,
    setProxyTranslateMeta,
    setProxyTranslateMetaMode,
    setQualityBadgesSide,
    setPosterNoBackgroundBadgeOutlineColor,
    setPosterNoBackgroundBadgeOutlineWidth,
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

  const handleMediaIdChange = (value: string) => {
    mediaSearchAbortControllerRef.current?.abort();
    setMediaId(value);
    setActivePreviewTitle('');
    setMediaSearchError('');
    setMediaSearchLoading(false);
    setMediaSearchResults([]);
    setMediaSearchQuery('');
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
    if (!tmdbKey.trim()) {
      setMediaSearchError('Add a TMDB key to search by name.');
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
      target.searchParams.set('tmdbKey', tmdbKey.trim());
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
  }, [disableRemoteLookups, lang, previewType, tmdbKey]);

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
    });
    if (!nextSample) {
      return;
    }

    mediaSearchAbortControllerRef.current?.abort();
    setMediaSearchLoading(false);
    setMediaId(nextSample);
    setActivePreviewTitle('Sample target');
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
    backdropGenreBadgeStyle,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesMax,
    backdropQualityBadgesStyle,
    backdropRatingBadgeScale,
    backdropStreamBadges,
    thumbnailGenreBadgeAnimeGrouping,
    thumbnailGenreBadgeMode,
    thumbnailGenreBadgePosition,
    thumbnailGenreBadgeScale,
    thumbnailGenreBadgeBorderWidth,
    thumbnailGenreBadgeStyle,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesMax,
    thumbnailQualityBadgesStyle,
    thumbnailRatingBadgeScale,
    thumbnailStreamBadges,
    logoGenreBadgeAnimeGrouping,
    logoGenreBadgeMode,
    logoGenreBadgePosition,
    logoGenreBadgeScale,
    logoGenreBadgeBorderWidth,
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesMax,
    logoQualityBadgesStyle,
    logoRatingBadgeScale,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
    posterGenreBadgeBorderWidth,
    posterGenreBadgeStyle,
    posterQualityBadgePreferences,
    posterQualityBadgeScale,
    posterQualityBadgesMax,
    posterQualityBadgesStyle,
    posterRatingBadgeScale,
    posterRatingsLayout,
    posterStreamBadges,
    previewType,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeStyle,
    setBackdropQualityBadgePreferences,
    setBackdropQualityBadgeScale,
    setBackdropQualityBadgesMax,
    setBackdropQualityBadgesStyle,
    setBackdropRatingBadgeScale,
    setBackdropStreamBadges,
    setThumbnailGenreBadgeAnimeGrouping,
    setThumbnailGenreBadgeMode,
    setThumbnailGenreBadgePosition,
    setThumbnailGenreBadgeScale,
    setThumbnailGenreBadgeBorderWidth,
    setThumbnailGenreBadgeStyle,
    setThumbnailQualityBadgePreferences,
    setThumbnailQualityBadgeScale,
    setThumbnailQualityBadgesMax,
    setThumbnailQualityBadgesStyle,
    setThumbnailRatingBadgeScale,
    setThumbnailStreamBadges,
    setLogoGenreBadgeAnimeGrouping,
    setLogoGenreBadgeMode,
    setLogoGenreBadgePosition,
    setLogoGenreBadgeScale,
    setLogoGenreBadgeBorderWidth,
    setLogoGenreBadgeStyle,
    setLogoQualityBadgePreferences,
    setLogoQualityBadgeScale,
    setLogoQualityBadgesMax,
    setLogoQualityBadgesStyle,
    setLogoRatingBadgeScale,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeBorderWidth,
    setPosterGenreBadgeStyle,
    setPosterQualityBadgePreferences,
    setPosterQualityBadgeScale,
    setPosterQualityBadgesMax,
    setPosterQualityBadgesStyle,
    setPosterRatingBadgeScale,
    setPosterStreamBadges,
  });
  const {
    activeGenreBadgeAnimeGrouping,
    activeGenreBadgeMode,
    activeGenreBadgePosition,
    activeGenreBadgeScale,
    activeGenreBadgeBorderWidth,
    activeGenreBadgeStyle,
    activeQualityBadgesMax,
    setActiveQualityBadgePreferences,
  } = activeWorkspaceSettings;

  const pageChrome = useConfiguratorPageChrome({
    disableRemoteLookups,
    initialSupportedLanguages: SUPPORTED_LANGUAGES,
    tmdbKey,
  });

  const workspaceConfigIo = useConfiguratorWorkspaceConfigIo({
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateCriticsAccentColor,
    aggregateDynamicStops,
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropEpisodeArtwork,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgeMode,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeStyle,
    backdropImageSize,
    backdropImageText,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesStyle,
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
    thumbnailGenreBadgeStyle,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesStyle,
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
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesStyle,
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
    posterRingValueSource,
    posterArtworkSource,
    posterEdgeOffset,
    posterGenreBadgeAnimeGrouping,
    posterGenreBadgeMode,
    posterGenreBadgePosition,
    posterGenreBadgeScale,
    posterGenreBadgeBorderWidth,
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
    posterQualityBadgesStyle,
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
    setAggregateCriticsAccentColor,
    setAggregateDynamicStops,
    setBackdropAggregateRatingSource,
    setBackdropArtworkSource,
    setBackdropEpisodeArtwork,
    setBackdropGenreBadgeAnimeGrouping,
    setBackdropGenreBadgeMode,
    setBackdropGenreBadgePosition,
    setBackdropGenreBadgeScale,
    setBackdropGenreBadgeBorderWidth,
    setBackdropGenreBadgeStyle,
    setBackdropImageSize,
    setBackdropImageText,
    setBackdropQualityBadgePreferences,
    setBackdropQualityBadgeScale,
    setBackdropQualityBadgesStyle,
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
    setThumbnailGenreBadgeStyle,
    setThumbnailImageText,
    setThumbnailQualityBadgePreferences,
    setThumbnailQualityBadgeScale,
    setThumbnailQualityBadgesStyle,
    setThumbnailQualityBadgesMax,
    setThumbnailRatingBadgeScale,
    setThumbnailRatingPresentation,
    setThumbnailRatingStyle,
    setThumbnailRatingsLayout,
    setThumbnailRatingsMax,
    setThumbnailSideRatingsOffset,
    setThumbnailSideRatingsPosition,
    setThumbnailStreamBadges,
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
    setLogoGenreBadgeStyle,
    setLogoQualityBadgePreferences,
    setLogoQualityBadgeScale,
    setLogoQualityBadgesStyle,
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
    setPosterRingValueSource,
    setPosterArtworkSource,
    setPosterEdgeOffset,
    setPosterGenreBadgeAnimeGrouping,
    setPosterGenreBadgeMode,
    setPosterGenreBadgePosition,
    setPosterGenreBadgeScale,
    setPosterGenreBadgeBorderWidth,
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
    setPosterQualityBadgesStyle,
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
  });
  const { applyWorkspaceConfig } = workspaceStorage;

  const workspaceOutputs = useConfiguratorOutputs({
    activeGenreBadgeAnimeGrouping,
    activeGenreBadgeMode,
    activeGenreBadgePosition,
    activeGenreBadgeScale,
    activeGenreBadgeBorderWidth,
    activeGenreBadgeStyle,
    activeQualityBadgesMax,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    aggregateAccentColor,
    aggregateAccentMode,
    aggregateAudienceAccentColor,
    aggregateCriticsAccentColor,
    aggregateDynamicStops,
    backdropAggregateRatingSource,
    backdropArtworkSource,
    backdropGenreBadgeAnimeGrouping,
    backdropGenreBadgePosition,
    backdropGenreBadgeScale,
    backdropGenreBadgeBorderWidth,
    backdropGenreBadgeStyle,
    backdropImageSize,
    backdropImageText,
    backdropQualityBadgePreferences,
    backdropQualityBadgeScale,
    backdropQualityBadgesStyle,
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
    thumbnailGenreBadgeStyle,
    thumbnailImageText,
    thumbnailQualityBadgePreferences,
    thumbnailQualityBadgeScale,
    thumbnailQualityBadgesStyle,
    thumbnailRatingBadgeScale,
    thumbnailRatingPreferences,
    thumbnailRatingPresentation,
    thumbnailRatingStyle,
    thumbnailRatingsLayout,
    thumbnailRatingsMax,
    thumbnailSideRatingsOffset,
    thumbnailSideRatingsPosition,
    thumbnailStreamBadges,
    baseUrl,
    buildCurrentUiConfig,
    episodeIdMode,
    xrdbKey,
    fanartKey,
    genrePreviewMode,
    hideAiometadataCredentials,
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
    logoGenreBadgeStyle,
    logoQualityBadgePreferences,
    logoQualityBadgeScale,
    logoQualityBadgesStyle,
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
    posterQualityBadgesStyle,
    posterRatingBadgeScale,
    posterRatingPreferences,
    posterRatingPresentation,
    posterRingProgressSource,
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
    showConfigString,
    shouldShowQualityBadgesPosition: activeWorkspaceSettings.shouldShowQualityBadgesPosition,
    shouldShowQualityBadgesSide: activeWorkspaceSettings.shouldShowQualityBadgesSide,
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
    setActivePreviewTitle('');
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
    heroProps,
    inputsPanelProps,
    outroProps,
    topNavProps,
    workspaceColumnsProps,
  } = buildConfiguratorPageProps({
    activeWorkspaceSettings,
    baseUrl,
    feeds,
    mediaTargetSearch: {
      onMediaIdChange: handleMediaIdChange,
      mediaSearchQuery,
      mediaSearchLoading,
      mediaSearchError,
      mediaSearchResults,
      activePreviewTitle,
      onMediaSearchQueryChange: setMediaSearchQuery,
      onMediaSearchSubmit: handleMediaSearchSubmit,
      onSelectMediaSearchResult: handleSelectMediaSearchResult,
      onShuffleMediaTarget: handleShuffleMediaTarget,
    },
    outputs: workspaceOutputs,
    pageChrome,
    workspaceActions,
    workspaceState,
    workspaceStorage,
    workspaceSummary,
    workspaceUi,
  });

  return {
    docsCaptureReady,
    experienceModeDraft,
    handleContinueExperienceMode,
    heroProps,
    inputsPanelProps,
    outroProps,
    pageRef: pageChrome.pageRef,
    setExperienceModeDraft,
    showExperienceModal,
    topNavProps,
    workspaceColumnsProps,
  };
}
