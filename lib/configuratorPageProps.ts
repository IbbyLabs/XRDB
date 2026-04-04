import type { ComponentProps, Dispatch, MouseEvent, SetStateAction } from 'react';

import type { ConfiguratorHero, ConfiguratorTopNav } from '@/components/configurator-page-chrome';
import type { ConfiguratorInputsPanel } from '@/components/configurator-inputs-panel';
import type { ConfiguratorWorkspaceColumns } from '@/components/configurator-workspace-columns';
import type { SitePageOutro } from '@/components/site-page-outro';
import type { useConfiguratorActiveWorkspaceSettings } from '@/lib/useConfiguratorActiveWorkspaceSettings';
import type { useConfiguratorFeeds } from '@/lib/useConfiguratorFeeds';
import type { useConfiguratorOutputs } from '@/lib/useConfiguratorOutputs';
import type { useConfiguratorPageChrome } from '@/lib/useConfiguratorPageChrome';
import type { useConfiguratorWorkspaceActions } from '@/lib/useConfiguratorWorkspaceActions';
import type { useConfiguratorWorkspaceState } from '@/lib/useConfiguratorWorkspaceState';
import type { useConfiguratorWorkspaceStorage } from '@/lib/useConfiguratorWorkspaceStorage';
import type { useConfiguratorWorkspaceSummary } from '@/lib/useConfiguratorWorkspaceSummary';
import type { ConfiguratorWizardAnswers } from '@/lib/configuratorPresets';
import type { MediaSearchItem } from '@/lib/configuratorMediaSearch';
import {
  BACKDROP_IMAGE_SIZE_OPTIONS,
  XRDB_REQUEST_KEY_HELP_COPY,
  FANART_KEY_HELP_COPY,
  LOGO_ARTWORK_SOURCE_OPTIONS,
  POSTER_IMAGE_SIZE_OPTIONS,
  PRESENTATION_SECTION_ORDER,
  QUALITY_BADGE_POSITION_OPTIONS,
  QUALITY_BADGE_SIDE_OPTIONS,
  STREAM_BADGE_OPTIONS,
  TMDB_ID_SCOPE_MODE_OPTIONS,
  WORKSPACE_CENTER_VIEW_OPTIONS,
} from '@/lib/configuratorPageOptions';
import { DEFAULT_POSTER_EDGE_OFFSET } from '@/lib/posterEdgeOffset';
import { POSTER_COMPACT_RING_SOURCE_OPTIONS } from '@/lib/posterCompactRing';
import { normalizeManifestUrl } from '@/lib/uiConfig';

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

type WorkspaceUiState = {
  aiometadataCopied: boolean;
  configCopied: boolean;
  handleBeginWizard: () => void;
  handleContinueExperienceMode: () => void;
  handleCopyAiometadata: () => void;
  handleCopyConfig: () => void;
  handleCopyProxy: () => void;
  handleExitWizard: () => void;
  handleSelectExperienceMode: (mode: ReturnType<typeof useConfiguratorWorkspaceState>['experienceMode']) => void;
  handleToggleWorkspacePanel: (panelId: WorkspacePanelId) => void;
  handleToggleWorkspaceSection: (sectionId: WorkspaceSectionId) => void;
  handleWizardAnswer: (
    questionId: keyof ConfiguratorWizardAnswers,
    value: ConfiguratorWizardAnswers[keyof ConfiguratorWizardAnswers],
  ) => void;
  handleWizardBack: () => void;
  isWizardActive: boolean;
  openWorkspacePanels: Set<WorkspacePanelId>;
  openWorkspaceSection: WorkspaceSectionId | null;
  proxyCopied: boolean;
  setOpenWorkspacePanels: Dispatch<SetStateAction<Set<WorkspacePanelId>>>;
  wizardAnswers: Partial<ConfiguratorWizardAnswers>;
  wizardQuestionIndex: number;
};

type MediaTargetSearchState = {
  onMediaIdChange: (value: string) => void;
  mediaSearchQuery: string;
  mediaSearchLoading: boolean;
  mediaSearchError: string;
  mediaSearchResults: MediaSearchItem[];
  activePreviewTitle: string;
  onMediaSearchQueryChange: (value: string) => void;
  onMediaSearchSubmit: () => void;
  onSelectMediaSearchResult: (result: MediaSearchItem) => void;
  onShuffleMediaTarget: () => void;
};

export function buildConfiguratorPageProps({
  activeWorkspaceSettings,
  baseUrl,
  feeds,
  outputs,
  pageChrome,
  workspaceActions,
  workspaceState,
  workspaceStorage,
  workspaceSummary,
  workspaceUi,
  mediaTargetSearch,
}: {
  activeWorkspaceSettings: ReturnType<typeof useConfiguratorActiveWorkspaceSettings>;
  baseUrl: string;
  feeds: ReturnType<typeof useConfiguratorFeeds>;
  outputs: ReturnType<typeof useConfiguratorOutputs>;
  pageChrome: ReturnType<typeof useConfiguratorPageChrome>;
  workspaceActions: ReturnType<typeof useConfiguratorWorkspaceActions>;
  workspaceState: ReturnType<typeof useConfiguratorWorkspaceState>;
  workspaceStorage: ReturnType<typeof useConfiguratorWorkspaceStorage>;
  workspaceSummary: ReturnType<typeof useConfiguratorWorkspaceSummary>;
  workspaceUi: WorkspaceUiState;
  mediaTargetSearch: MediaTargetSearchState;
}): {
  heroProps: ComponentProps<typeof ConfiguratorHero>;
  inputsPanelProps: ComponentProps<typeof ConfiguratorInputsPanel>;
  outroProps: ComponentProps<typeof SitePageOutro>;
  topNavProps: ComponentProps<typeof ConfiguratorTopNav>;
  workspaceColumnsProps: ComponentProps<typeof ConfiguratorWorkspaceColumns>;
} {
  return {
    topNavProps: {
      navRef: pageChrome.navRef,
      latestReleaseTag: feeds.latestReleaseTag,
      latestReleaseUrl: feeds.latestReleaseUrl,
      isLatestReleaseLoading: feeds.isLatestReleaseLoading,
      pendingReleaseTag: feeds.pendingReleaseTag,
      isMobileNavOpen: pageChrome.isMobileNavOpen,
      onToggleMobileNav: pageChrome.toggleMobileNav,
      onCloseMobileNav: pageChrome.closeMobileNav,
      onAnchorClick: pageChrome.handleAnchorClick,
    },
    heroProps: {
      heroRef: pageChrome.heroRef,
      versionStatusNote: outputs.versionStatusNote,
      onAnchorClick: pageChrome.handleAnchorClick,
      recentCommits: feeds.recentCommits,
      visibleRecentCommitCount: feeds.visibleRecentCommitCount,
      onLoadMoreRecentCommits: feeds.setVisibleRecentCommitCount,
      isRecentCommitsLoading: feeds.isRecentCommitsLoading,
      recentCommitsError: feeds.recentCommitsError,
      nowMs: feeds.nowMs,
    },
    inputsPanelProps: {
      isOpen: workspaceUi.openWorkspacePanels.has('configurator'),
      onToggle: () => workspaceUi.handleToggleWorkspacePanel('configurator'),
      onAnchorClick: pageChrome.handleAnchorClick,
      experienceMode: workspaceState.experienceMode,
      openWorkspaceSection: workspaceUi.openWorkspaceSection,
      onToggleWorkspaceSection: workspaceUi.handleToggleWorkspaceSection,
      setupModeProps: {
        experienceMode: workspaceState.experienceMode,
        onOpenIntro: () => {
          workspaceState.setExperienceModeDraft(workspaceState.experienceMode);
          workspaceState.setShowExperienceModal(true);
        },
        onSelectExperienceMode: workspaceUi.handleSelectExperienceMode,
      },
      presetStudioProps: {
        isOpen: workspaceUi.openWorkspaceSection === 'presets',
        onToggle: () => workspaceUi.handleToggleWorkspaceSection('presets'),
        isWizardActive: workspaceUi.isWizardActive,
        selectedPresetId: workspaceState.selectedPresetId,
        selectedPresetMeta: workspaceSummary.selectedPresetMeta,
        wizardQuestionIndex: workspaceUi.wizardQuestionIndex,
        wizardAnswers: workspaceUi.wizardAnswers,
        wizardRecommendedPreset: workspaceSummary.wizardRecommendedPreset,
        wizardActiveQuestion: workspaceSummary.wizardActiveQuestion,
        onBeginWizard: workspaceUi.handleBeginWizard,
        onExitWizard: workspaceUi.handleExitWizard,
        onWizardBack: workspaceUi.handleWizardBack,
        onWizardAnswer: workspaceUi.handleWizardAnswer,
        onApplyPreset: workspaceActions.handleApplyPreset,
      },
      workspaceManagementProps: {
        workspaceImportInputRef: workspaceStorage.workspaceImportInputRef,
        onImportWorkspace: workspaceStorage.handleImportWorkspace,
        onImportWorkspaceLink: workspaceStorage.handleImportWorkspaceLink,
        onSaveWorkspace: workspaceStorage.handleSaveWorkspaceConfig,
        onDownloadWorkspace: workspaceStorage.handleDownloadWorkspace,
        onPromptWorkspaceImport: workspaceStorage.handlePromptWorkspaceImport,
        onClearSavedWorkspace: workspaceStorage.handleClearSavedWorkspace,
        configAutoSave: workspaceStorage.configAutoSave,
        onToggleConfigAutoSave: workspaceStorage.handleToggleConfigAutoSave,
        savedConfigStatus: workspaceStorage.savedConfigStatus,
      },
      accessKeysProps: {
        xrdbKey: workspaceState.xrdbKey,
        tmdbKey: workspaceState.tmdbKey,
        mdblistKey: workspaceState.mdblistKey,
        fanartKey: workspaceState.fanartKey,
        simklClientId: workspaceState.simklClientId,
        tmdbIdScope: workspaceState.tmdbIdScope,
        onXrdbKeyChange: workspaceState.setXrdbKey,
        onTmdbKeyChange: workspaceState.setTmdbKey,
        onMdblistKeyChange: workspaceState.setMdblistKey,
        onFanartKeyChange: workspaceState.setFanartKey,
        onSimklClientIdChange: workspaceState.setSimklClientId,
        onTmdbIdScopeChange: workspaceState.setTmdbIdScope,
        tmdbIdScopeOptions: TMDB_ID_SCOPE_MODE_OPTIONS,
        xrdbRequestKeyHelpCopy: XRDB_REQUEST_KEY_HELP_COPY,
        fanartKeyHelpCopy: FANART_KEY_HELP_COPY,
      },
      mediaTargetProps: {
        previewType: workspaceState.previewType,
        mediaId: workspaceState.mediaId,
        tmdbKey: workspaceState.tmdbKey,
        lang: workspaceState.lang,
        supportedLanguages: pageChrome.supportedLanguages,
        onPreviewTypeChange: workspaceState.setPreviewType,
        onMediaIdChange: mediaTargetSearch.onMediaIdChange,
        onLangChange: workspaceState.setLang,
        mediaSearchQuery: mediaTargetSearch.mediaSearchQuery,
        mediaSearchLoading: mediaTargetSearch.mediaSearchLoading,
        mediaSearchError: mediaTargetSearch.mediaSearchError,
        mediaSearchResults: mediaTargetSearch.mediaSearchResults,
        activePreviewTitle: mediaTargetSearch.activePreviewTitle,
        onMediaSearchQueryChange: mediaTargetSearch.onMediaSearchQueryChange,
        onMediaSearchSubmit: mediaTargetSearch.onMediaSearchSubmit,
        onSelectMediaSearchResult: mediaTargetSearch.onSelectMediaSearchResult,
        onShuffleMediaTarget: mediaTargetSearch.onShuffleMediaTarget,
      },
      presentationProps: {
        presentationOrder: PRESENTATION_SECTION_ORDER,
        previewType: workspaceState.previewType,
        activeRatingPresentation: workspaceSummary.activeRatingPresentation,
        layoutPlacementHelp: workspaceSummary.layoutPlacementHelp,
        isEditorialPresentation: workspaceSummary.isEditorialPresentation,
        isCompactRingPresentation: workspaceSummary.isCompactRingPresentation,
        activePresentationPreservesLayout: workspaceSummary.activePresentationPreservesLayout,
        usesAggregatePresentation: workspaceSummary.usesAggregatePresentation,
        showsAggregateRatingSource: workspaceSummary.showsAggregateRatingSource,
        showsAggregateAccentBarOffset: workspaceSummary.showsAggregateAccentBarOffset,
        activeAggregateAccent: workspaceSummary.activeAggregateAccent,
        activeAggregateRatingSource: workspaceSummary.activeAggregateRatingSource,
        posterRingValueSource: workspaceState.posterRingValueSource,
        posterRingProgressSource: workspaceState.posterRingProgressSource,
        posterCompactRingSourceOptions: POSTER_COMPACT_RING_SOURCE_OPTIONS,
        aggregateAccentMode: workspaceState.aggregateAccentMode,
        aggregateAccentColor: workspaceState.aggregateAccentColor,
        aggregateCriticsAccentColor: workspaceState.aggregateCriticsAccentColor,
        aggregateAudienceAccentColor: workspaceState.aggregateAudienceAccentColor,
        aggregateDynamicStops: workspaceState.aggregateDynamicStops,
        aggregateAccentBarVisible: workspaceState.aggregateAccentBarVisible,
        aggregateAccentBarOffset: workspaceState.aggregateAccentBarOffset,
        onSelectRatingPresentation: workspaceSummary.setRatingPresentationForType,
        onSelectAggregateRatingSource: workspaceSummary.setAggregateRatingSourceForType,
        onSelectPosterRingValueSource: workspaceState.setPosterRingValueSource,
        onSelectPosterRingProgressSource: workspaceState.setPosterRingProgressSource,
        onSelectAggregateAccentMode: workspaceState.setAggregateAccentMode,
        onSelectAggregateAccentColor: workspaceState.setAggregateAccentColor,
        onSelectAggregateCriticsAccentColor: workspaceState.setAggregateCriticsAccentColor,
        onSelectAggregateAudienceAccentColor: workspaceState.setAggregateAudienceAccentColor,
        onSelectAggregateDynamicStops: workspaceState.setAggregateDynamicStops,
        onToggleAggregateAccentBarVisible: () =>
          workspaceState.setAggregateAccentBarVisible((current) => !current),
        onSelectAggregateAccentBarOffset: workspaceState.setAggregateAccentBarOffset,
      },
      lookProps: {
        previewType: workspaceState.previewType,
        styleLabel: workspaceSummary.styleLabel,
        textLabel: workspaceSummary.textLabel,
        activeRatingStyle: workspaceSummary.activeRatingStyle,
        activeImageTextOptions: workspaceSummary.activeImageTextOptions,
        activeImageText: workspaceSummary.activeImageText,
        activeImageTextDescription: workspaceSummary.activeImageTextOptionMeta?.description || null,
        ratingValueMode: workspaceState.ratingValueMode,
        ratingXOffsetPillGlass: workspaceSummary.activeRatingXOffsetPillGlass,
        ratingYOffsetPillGlass: workspaceSummary.activeRatingYOffsetPillGlass,
        ratingXOffsetSquare: workspaceSummary.activeRatingXOffsetSquare,
        ratingYOffsetSquare: workspaceSummary.activeRatingYOffsetSquare,
        activeGenreBadgeMode: activeWorkspaceSettings.activeGenreBadgeMode,
        activeGenreBadgeStyle: activeWorkspaceSettings.activeGenreBadgeStyle,
        activeGenreBadgePosition: activeWorkspaceSettings.activeGenreBadgePosition,
        activeGenreBadgeAnimeGrouping: activeWorkspaceSettings.activeGenreBadgeAnimeGrouping,
        activeArtworkSourceOptions: workspaceSummary.activeArtworkSourceOptions,
        activeArtworkSource: workspaceSummary.activeArtworkSource,
        activeArtworkSourceDescription:
          workspaceSummary.activeArtworkSourceOptionMeta?.description || null,
        posterImageSizeOptions: POSTER_IMAGE_SIZE_OPTIONS,
        posterImageSize: workspaceState.posterImageSize,
        randomPosterText: workspaceState.randomPosterText,
        randomPosterLanguage: workspaceState.randomPosterLanguage,
        randomPosterMinVoteCount: workspaceState.randomPosterMinVoteCount,
        randomPosterMinVoteAverage: workspaceState.randomPosterMinVoteAverage,
        randomPosterMinWidth: workspaceState.randomPosterMinWidth,
        randomPosterMinHeight: workspaceState.randomPosterMinHeight,
        randomPosterFallback: workspaceState.randomPosterFallback,
        backdropImageSizeOptions: BACKDROP_IMAGE_SIZE_OPTIONS,
        backdropImageSize: workspaceState.backdropImageSize,
        activePosterImageSizeDescription:
          workspaceSummary.activePosterImageSizeOptionMeta.description,
        activeBackdropImageSizeDescription:
          workspaceSummary.activeBackdropImageSizeOptionMeta.description,
        posterRatingsLayout: workspaceState.posterRatingsLayout,
        posterRatingsMaxPerSide: workspaceState.posterRatingsMaxPerSide,
        posterRatingsMax: workspaceState.posterRatingsMax,
        backdropRatingsLayout: workspaceState.backdropRatingsLayout,
        backdropRatingsMax: workspaceState.backdropRatingsMax,
        backdropBottomRatingsRow: workspaceState.backdropBottomRatingsRow,
        thumbnailRatingsLayout: workspaceState.thumbnailRatingsLayout,
        thumbnailRatingsMax: workspaceState.thumbnailRatingsMax,
        thumbnailBottomRatingsRow: workspaceState.thumbnailBottomRatingsRow,
        thumbnailEpisodeArtwork: workspaceState.thumbnailEpisodeArtwork,
        posterEdgeOffset: workspaceState.posterEdgeOffset,
        shouldShowSideRatingPlacement: workspaceSummary.shouldShowSideRatingPlacement,
        activeSideRatingsPosition: workspaceSummary.activeSideRatingsPosition,
        activeSideRatingsOffset: workspaceSummary.activeSideRatingsOffset,
        logoArtworkSourceOptions: LOGO_ARTWORK_SOURCE_OPTIONS,
        logoArtworkSource: workspaceState.logoArtworkSource,
        activeLogoSourceDescription: workspaceSummary.activeLogoSourceOptionMeta?.description || null,
        logoBackground: workspaceState.logoBackground,
        logoRatingsMax: workspaceState.logoRatingsMax,
        logoBottomRatingsRow: workspaceState.logoBottomRatingsRow,
        logoQualityBadgesStyle: workspaceState.logoQualityBadgesStyle,
        logoQualityBadgesMax: workspaceState.logoQualityBadgesMax,
        logoQualityBadgePreferences: workspaceState.logoQualityBadgePreferences,
        activeRatingBadgeScale: activeWorkspaceSettings.activeRatingBadgeScale,
        activeGenreBadgeScale: activeWorkspaceSettings.activeGenreBadgeScale,
        activeGenreBadgeBorderWidth: activeWorkspaceSettings.activeGenreBadgeBorderWidth,
        activeQualityBadgeScale: activeWorkspaceSettings.activeQualityBadgeScale,
        posterNoBackgroundBadgeOutlineColor: workspaceState.posterNoBackgroundBadgeOutlineColor,
        posterNoBackgroundBadgeOutlineWidth: workspaceState.posterNoBackgroundBadgeOutlineWidth,
        onSelectRatingStyle: workspaceSummary.setRatingStyleForType,
        onSelectImageText: workspaceSummary.setImageTextForType,
        onSelectRatingValueMode: workspaceState.setRatingValueMode,
        onSelectRatingXOffsetPillGlass: workspaceSummary.setActiveRatingXOffsetPillGlass,
        onSelectRatingYOffsetPillGlass: workspaceSummary.setActiveRatingYOffsetPillGlass,
        onSelectRatingXOffsetSquare: workspaceSummary.setActiveRatingXOffsetSquare,
        onSelectRatingYOffsetSquare: workspaceSummary.setActiveRatingYOffsetSquare,
        onSelectGenreBadgeMode: activeWorkspaceSettings.setActiveGenreBadgeMode,
        onSelectGenreBadgeStyle: activeWorkspaceSettings.setActiveGenreBadgeStyle,
        onSelectGenreBadgePosition: activeWorkspaceSettings.setActiveGenreBadgePosition,
        onSelectGenreBadgeAnimeGrouping: activeWorkspaceSettings.setActiveGenreBadgeAnimeGrouping,
        onSelectBackdropArtworkSource: workspaceState.setBackdropArtworkSource,
        onSelectThumbnailArtworkSource: workspaceState.setThumbnailArtworkSource,
        onSelectPosterArtworkSource: workspaceState.setPosterArtworkSource,
        onSelectPosterImageSize: workspaceState.setPosterImageSize,
        onSelectRandomPosterText: workspaceState.setRandomPosterText,
        onSelectRandomPosterLanguage: workspaceState.setRandomPosterLanguage,
        onSelectRandomPosterMinVoteCount: workspaceState.setRandomPosterMinVoteCount,
        onSelectRandomPosterMinVoteAverage: workspaceState.setRandomPosterMinVoteAverage,
        onSelectRandomPosterMinWidth: workspaceState.setRandomPosterMinWidth,
        onSelectRandomPosterMinHeight: workspaceState.setRandomPosterMinHeight,
        onSelectRandomPosterFallback: workspaceState.setRandomPosterFallback,
        onSelectBackdropImageSize: workspaceState.setBackdropImageSize,
        onSelectPosterRatingsLayout: workspaceState.setPosterRatingsLayout,
        onSelectPosterRatingsMaxPerSide: workspaceState.setPosterRatingsMaxPerSide,
        onSelectPosterRatingsMax: workspaceState.setPosterRatingsMax,
        onSelectBackdropRatingsLayout: workspaceState.setBackdropRatingsLayout,
        onSelectBackdropRatingsMax: workspaceState.setBackdropRatingsMax,
        onToggleBackdropBottomRatingsRow: () =>
          workspaceState.setBackdropBottomRatingsRow((current) => !current),
        onSelectThumbnailRatingsLayout: workspaceState.setThumbnailRatingsLayout,
        onSelectThumbnailRatingsMax: workspaceState.setThumbnailRatingsMax,
        onToggleThumbnailBottomRatingsRow: () =>
          workspaceState.setThumbnailBottomRatingsRow((current) => !current),
        onSelectThumbnailEpisodeArtwork: workspaceState.setThumbnailEpisodeArtwork,
        onSelectPosterEdgeOffset: workspaceState.setPosterEdgeOffset,
        onResetPosterEdgeOffset: () =>
          workspaceState.setPosterEdgeOffset(DEFAULT_POSTER_EDGE_OFFSET),
        onSelectSideRatingsPosition: workspaceSummary.setActiveSideRatingsPosition,
        onSelectSideRatingsOffset: workspaceSummary.setActiveSideRatingsOffset,
        onSelectLogoArtworkSource: workspaceState.setLogoArtworkSource,
        onSelectLogoBackground: workspaceState.setLogoBackground,
        onSelectLogoRatingsMax: workspaceState.setLogoRatingsMax,
        onToggleLogoBottomRatingsRow: () =>
          workspaceState.setLogoBottomRatingsRow((current) => !current),
        onSelectLogoQualityBadgesStyle: workspaceState.setLogoQualityBadgesStyle,
        onSelectLogoQualityBadgesMax: workspaceState.setLogoQualityBadgesMax,
        onToggleQualityBadgePreference: workspaceActions.toggleQualityBadgePreference,
        onSelectRatingBadgeScale: activeWorkspaceSettings.setActiveRatingBadgeScale,
        onSelectGenreBadgeScale: activeWorkspaceSettings.setActiveGenreBadgeScale,
        onSelectGenreBadgeBorderWidth: activeWorkspaceSettings.setActiveGenreBadgeBorderWidth,
        onSelectQualityBadgeScale: activeWorkspaceSettings.setActiveQualityBadgeScale,
        onSelectPosterNoBackgroundBadgeOutlineColor: workspaceState.setPosterNoBackgroundBadgeOutlineColor,
        onSelectPosterNoBackgroundBadgeOutlineWidth: workspaceState.setPosterNoBackgroundBadgeOutlineWidth,
      },
      qualityProps: {
        previewType: workspaceState.previewType,
        qualityBadgeTypeLabel: activeWorkspaceSettings.qualityBadgeTypeLabel,
        activeStreamBadges: activeWorkspaceSettings.activeStreamBadges,
        activeQualityBadgesStyle: activeWorkspaceSettings.activeQualityBadgesStyle,
        activeQualityBadgesMax: activeWorkspaceSettings.activeQualityBadgesMax,
        qualityBadgesSide: workspaceState.qualityBadgesSide,
        posterQualityBadgesPosition: workspaceState.posterQualityBadgesPosition,
        shouldShowQualityBadgesSide: activeWorkspaceSettings.shouldShowQualityBadgesSide,
        shouldShowQualityBadgesPosition: activeWorkspaceSettings.shouldShowQualityBadgesPosition,
        activeQualityBadgePreferences: activeWorkspaceSettings.activeQualityBadgePreferences,
        streamBadgeOptions: STREAM_BADGE_OPTIONS,
        qualityBadgeSideOptions: QUALITY_BADGE_SIDE_OPTIONS,
        qualityBadgePositionOptions: QUALITY_BADGE_POSITION_OPTIONS,
        onSelectStreamBadges: activeWorkspaceSettings.setActiveStreamBadges,
        onSelectQualityBadgeStyle: activeWorkspaceSettings.setActiveQualityBadgesStyle,
        onSelectQualityBadgesMax: activeWorkspaceSettings.setActiveQualityBadgesMax,
        onSelectQualityBadgesSide: workspaceState.setQualityBadgesSide,
        onSelectPosterQualityBadgePosition: workspaceState.setPosterQualityBadgesPosition,
        onToggleQualityBadgePreference: workspaceActions.toggleQualityBadgePreference,
        activeRemuxDisplayMode: activeWorkspaceSettings.activeRemuxDisplayMode,
        onSelectRemuxDisplayMode: activeWorkspaceSettings.setActiveRemuxDisplayMode,
      },
      providersProps: {
        providersLabel: workspaceSummary.providersLabel,
        ratingProviderRows: workspaceSummary.ratingProviderRows,
        ratingProviderAppearanceOverrides: workspaceState.ratingProviderAppearanceOverrides,
        activeProviderEditorId: workspaceSummary.resolvedActiveProviderEditorId,
        activeRatingStyle: workspaceSummary.activeRatingStyle,
        onSelectAllRatingPreferencesEnabled: workspaceActions.setAllRatingPreferencesEnabled,
        onReorderRatingPreference: workspaceActions.reorderRatingPreference,
        onToggleRatingPreference: workspaceActions.toggleRatingPreference,
        onSelectActiveProviderEditorId: workspaceState.setActiveProviderEditorId,
        onUpdateProviderAppearanceOverride: workspaceActions.updateProviderAppearanceOverride,
      },
      simpleQuickTuneProps: {
        previewType: workspaceState.previewType,
        quickPresentationOptions: workspaceSummary.quickPresentationOptions,
        activeRatingPresentation: workspaceSummary.activeRatingPresentation,
        activeRatingStyle: workspaceSummary.activeRatingStyle,
        activeImageTextOptions: workspaceSummary.activeImageTextOptions,
        activeImageText: workspaceSummary.activeImageText,
        logoBackground: workspaceState.logoBackground,
        posterImageSizeOptions: POSTER_IMAGE_SIZE_OPTIONS,
        posterImageSize: workspaceState.posterImageSize,
        backdropImageSizeOptions: BACKDROP_IMAGE_SIZE_OPTIONS,
        backdropImageSize: workspaceState.backdropImageSize,
        logoArtworkSourceOptions: LOGO_ARTWORK_SOURCE_OPTIONS,
        activeArtworkSourceOptions: workspaceSummary.activeArtworkSourceOptions,
        logoArtworkSource: workspaceState.logoArtworkSource,
        activeArtworkSource: workspaceSummary.activeArtworkSource,
        activeGenreBadgeMode: activeWorkspaceSettings.activeGenreBadgeMode,
        activeStreamBadges: activeWorkspaceSettings.activeStreamBadges,
        streamBadgeOptions: STREAM_BADGE_OPTIONS,
        onSelectRatingPresentation: workspaceSummary.setRatingPresentationForType,
        onSelectRatingStyle: workspaceSummary.setRatingStyleForType,
        onSelectImageText: workspaceSummary.setImageTextForType,
        onSelectLogoBackground: workspaceState.setLogoBackground,
        onSelectPosterImageSize: workspaceState.setPosterImageSize,
        onSelectBackdropImageSize: workspaceState.setBackdropImageSize,
        onSelectLogoArtworkSource: workspaceState.setLogoArtworkSource,
        onSelectBackdropArtworkSource: workspaceState.setBackdropArtworkSource,
        onSelectThumbnailArtworkSource: workspaceState.setThumbnailArtworkSource,
        onSelectPosterArtworkSource: workspaceState.setPosterArtworkSource,
        onSelectGenreBadgeMode: activeWorkspaceSettings.setActiveGenreBadgeMode,
        onSelectStreamBadges: activeWorkspaceSettings.setActiveStreamBadges,
      },
    },
    workspaceColumnsProps: {
      centerStageProps: {
        isOpen: workspaceUi.openWorkspacePanels.has('center-view'),
        onToggle: () => workspaceUi.handleToggleWorkspacePanel('center-view'),
        workspaceCenterView: workspaceState.workspaceCenterView,
        workspaceCenterViewOptions: WORKSPACE_CENTER_VIEW_OPTIONS,
        onSelectWorkspaceCenterView: workspaceState.setWorkspaceCenterView,
        previewType: workspaceState.previewType,
        onSelectPreviewType: workspaceState.setPreviewType,
        previewUrl: outputs.previewUrl,
        previewErrored: outputs.previewErrored,
        previewErrorDetails: outputs.visiblePreviewErrorDetails,
        tmdbKeyPresent: Boolean(workspaceState.tmdbKey.trim()),
        onPreviewImageError: outputs.handlePreviewImageError,
        onPreviewImageLoad: outputs.handlePreviewImageLoad,
        activeTypeLabel: workspaceSummary.activeTypeLabel,
        activePresentationLabel: workspaceSummary.activePresentationOptionMeta?.label || 'Standard',
        activeRatingStyleLabel: workspaceSummary.activeRatingStyleLabel,
        enabledProviderCount: workspaceSummary.enabledProviderCount,
        currentSetupItems: workspaceSummary.currentSetupItems,
        selectedPresetLabel: workspaceSummary.selectedPresetMeta?.label || 'Custom',
        genrePreviewMode: workspaceState.genrePreviewMode,
        onSelectGenrePreviewMode: workspaceState.setGenrePreviewMode,
        showcaseGenreCards: workspaceSummary.showcaseGenreCards,
        genrePreviewCards: outputs.genrePreviewCards,
        onAnchorClick: pageChrome.handleAnchorClick,
        onOpenPreview: () => workspaceState.setWorkspaceCenterView('preview'),
      },
      exportPanelsProps: {
        isConfigStringOpen: workspaceUi.openWorkspacePanels.has('config-string'),
        isAiometadataOpen: workspaceUi.openWorkspacePanels.has('aio-urls'),
        onToggleConfigString: () => workspaceUi.handleToggleWorkspacePanel('config-string'),
        onToggleAiometadata: () => workspaceUi.handleToggleWorkspacePanel('aio-urls'),
        displayedConfigString: outputs.displayedConfigString,
        canGenerateConfig: workspaceSummary.canGenerateConfig,
        configCopied: workspaceUi.configCopied,
        showConfigString: outputs.isConfigStringVisible,
        onCopyConfig: workspaceUi.handleCopyConfig,
        onToggleShowConfigString: () =>
          workspaceState.setShowConfigString((prev) => !prev),
        aiometadataPatternRows: outputs.aiometadataPatternRows,
        aiometadataCopied: workspaceUi.aiometadataCopied,
        onCopyAiometadata: workspaceUi.handleCopyAiometadata,
        posterIdMode: workspaceState.posterIdMode,
        onSelectPosterIdMode: workspaceState.setPosterIdMode,
        episodeIdMode: workspaceState.episodeIdMode,
        onSelectEpisodeIdMode: workspaceState.setEpisodeIdMode,
        thumbnailEpisodeArtwork: workspaceState.thumbnailEpisodeArtwork,
        onSelectThumbnailEpisodeArtwork: workspaceState.setThumbnailEpisodeArtwork,
        backdropEpisodeArtwork: workspaceState.backdropEpisodeArtwork,
        onSelectBackdropEpisodeArtwork: workspaceState.setBackdropEpisodeArtwork,
        thumbnailRatingPreferences: workspaceState.thumbnailRatingPreferences,
        onToggleThumbnailRatingPreference: workspaceActions.toggleThumbnailRatingPreference,
        hideAiometadataCredentials: workspaceState.hideAiometadataCredentials,
        onToggleHideAiometadataCredentials: workspaceState.setHideAiometadataCredentials,
      },
      supportPanelsProps: {
        isAddonProxyOpen: workspaceUi.openWorkspacePanels.has('addon-proxy'),
        isCurrentSetupOpen: workspaceUi.openWorkspacePanels.has('current-setup'),
        isQuickActionsOpen: workspaceUi.openWorkspacePanels.has('quick-actions'),
        onToggleAddonProxy: () => workspaceUi.handleToggleWorkspacePanel('addon-proxy'),
        onToggleCurrentSetup: () => workspaceUi.handleToggleWorkspacePanel('current-setup'),
        onToggleQuickActions: () => workspaceUi.handleToggleWorkspacePanel('quick-actions'),
        proxyManifestUrl: workspaceState.proxyManifestUrl,
        onChangeProxyManifestUrl: (value) =>
          workspaceState.setProxyManifestUrl(normalizeManifestUrl(value, true)),
        proxyTranslateMeta: workspaceState.proxyTranslateMeta,
        onToggleProxyTranslateMeta: workspaceState.setProxyTranslateMeta,
        experienceMode: workspaceState.experienceMode,
        proxyTranslateMetaMode: workspaceState.proxyTranslateMetaMode,
        onSelectProxyTranslateMetaMode: workspaceState.setProxyTranslateMetaMode,
        proxyDebugMetaTranslation: workspaceState.proxyDebugMetaTranslation,
        onToggleProxyDebugMetaTranslation: workspaceState.setProxyDebugMetaTranslation,
        proxyTypes: workspaceState.proxyTypes,
        onChangeProxyTypes: workspaceState.setProxyTypes,
        proxyCatalogRules: workspaceState.proxyCatalogRules,
        onChangeProxyCatalogRules: workspaceState.setProxyCatalogRules,
        tmdbKey: workspaceState.tmdbKey,
        mdblistKey: workspaceState.mdblistKey,
        displayedProxyUrl: outputs.displayedProxyUrl,
        proxyUrl: outputs.proxyUrl,
        baseUrl,
        canGenerateProxy: workspaceSummary.canGenerateProxy,
        proxyCopied: workspaceUi.proxyCopied,
        onCopyProxy: workspaceUi.handleCopyProxy,
        showProxyUrl: outputs.isProxyUrlVisible,
        onToggleShowProxyUrl: () => workspaceState.setShowProxyUrl((prev) => !prev),
        currentSetupItems: workspaceSummary.currentSetupItems,
        onJumpToCenter: () => {
          workspaceUi.setOpenWorkspacePanels((current) => new Set([...current, 'center-view']));
          pageChrome.scrollToHash('#workspace-preview');
        },
        onJumpToExport: () => {
          workspaceUi.setOpenWorkspacePanels(
            (current) => new Set([...current, 'config-string', 'aio-urls']),
          );
          pageChrome.scrollToHash('#workspace-export');
        },
        onFocusPreview: () => {
          workspaceUi.setOpenWorkspacePanels((current) => new Set([...current, 'center-view']));
          workspaceState.setWorkspaceCenterView('preview');
          pageChrome.scrollToHash('#workspace-preview');
        },
      },
    },
    outroProps: {
      onAnchorClick: pageChrome.handleAnchorClick as
        | ((event: MouseEvent<HTMLAnchorElement>) => void)
        | undefined,
      configuratorHref: '#preview',
      proxyHref: '#proxy',
      docsHref: '/docs',
    },
  };
}
