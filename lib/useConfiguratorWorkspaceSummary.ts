import { useCallback } from 'react';

import {
  CONFIGURATOR_WIZARD_QUESTION_ORDER,
  CONFIGURATOR_WIZARD_QUESTIONS,
  getConfiguratorPreset,
  recommendConfiguratorPreset,
  type ConfiguratorPresetId,
  type ConfiguratorWizardAnswers,
} from '@/lib/configuratorPresets';
import {
  GENRE_BADGE_MODE_OPTIONS,
  type GenreBadgePreviewSample,
  type GenreBadgeMode,
} from '@/lib/genreBadge';
import {
  isVerticalPosterRatingLayout,
  type PosterRatingLayout,
} from '@/lib/posterLayoutOptions';
import {
  AGGREGATE_RATING_SOURCE_ACCENTS,
  preservesSelectedRatingLayout,
  RATING_PRESENTATION_OPTIONS,
  usesAggregateAccentBar,
  usesAggregateRatingPresentation,
  usesAggregateRatingSource,
  usesDualAggregateRatingPresentation,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from '@/lib/ratingPresentation';
import { RATING_STYLE_OPTIONS, type RatingStyle } from '@/lib/ratingAppearance';
import { type RatingProviderRow } from '@/lib/ratingProviderRows';
import { type RatingPreference } from '@/lib/ratingProviderCatalog';
import { type SideRatingPosition } from '@/lib/sideRatingPosition';
import {
  type ArtworkSource,
  type BackdropImageTextPreference,
  type LogoBackground,
  type PosterImageTextPreference,
} from '@/lib/uiConfig';

type ProxyType = 'poster' | 'backdrop' | 'logo';

const SIMPLE_PRESENTATION_IDS: RatingPresentation[] = [
  'standard',
  'minimal',
  'average',
  'blockbuster',
];

export function useConfiguratorWorkspaceSummary({
  activeProviderEditorId,
  backdropAggregateRatingSource,
  backdropArtworkSource,
  backdropArtworkSourceOptions,
  backdropImageText,
  backdropImageTextOptions,
  backdropRatingsLayout,
  backdropSideRatingsOffset,
  backdropSideRatingsPosition,
  genrePreviewCards,
  genrePreviewMode,
  logoAggregateRatingSource,
  logoArtworkSource,
  logoArtworkSourceOptions,
  posterAggregateRatingSource,
  posterArtworkSource,
  posterArtworkSourceOptions,
  posterImageSize,
  posterImageSizeOptions,
  posterImageText,
  posterImageTextOptions,
  posterRatingsLayout,
  posterSideRatingsOffset,
  posterSideRatingsPosition,
  previewType,
  configString,
  proxyUrl,
  posterRatingRows,
  backdropRatingRows,
  logoRatingRows,
  selectedPresetId,
  setBackdropAggregateRatingSource,
  setBackdropImageText,
  setBackdropRatingPresentation,
  setBackdropRatingStyle,
  setBackdropSideRatingsOffset,
  setBackdropSideRatingsPosition,
  setLogoAggregateRatingSource,
  setLogoRatingPresentation,
  setLogoRatingStyle,
  setPosterAggregateRatingSource,
  setPosterImageText,
  setPosterRatingPresentation,
  setPosterRatingStyle,
  setPosterSideRatingsOffset,
  setPosterSideRatingsPosition,
  wizardAnswers,
  wizardQuestionIndex,
  aggregateAccentColor,
  aggregateAccentMode,
  aggregateAudienceAccentColor,
  aggregateCriticsAccentColor,
  backdropRatingPresentation,
  backdropRatingStyle,
  logoRatingPresentation,
  logoRatingStyle,
  posterRatingPresentation,
  posterRatingStyle,
}: {
  activeProviderEditorId: RatingPreference;
  aggregateAccentColor: string;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAudienceAccentColor: string;
  aggregateCriticsAccentColor: string;
  backdropAggregateRatingSource: AggregateRatingSource;
  backdropArtworkSource: ArtworkSource;
  backdropArtworkSourceOptions: Array<{ id: ArtworkSource; label: string; description: string }>;
  backdropImageText: BackdropImageTextPreference;
  backdropImageTextOptions: Array<{ id: BackdropImageTextPreference; label: string; description: string }>;
  backdropRatingPresentation: RatingPresentation;
  backdropRatingStyle: RatingStyle;
  backdropRatingsLayout: string;
  backdropSideRatingsOffset: number;
  backdropSideRatingsPosition: SideRatingPosition;
  genrePreviewCards: Array<{ sample: GenreBadgePreviewSample; url: string }>;
  genrePreviewMode: GenreBadgeMode;
  logoAggregateRatingSource: AggregateRatingSource;
  logoArtworkSource: ArtworkSource;
  logoArtworkSourceOptions: Array<{ id: ArtworkSource; label: string; description: string }>;
  logoRatingPresentation: RatingPresentation;
  logoRatingStyle: RatingStyle;
  posterAggregateRatingSource: AggregateRatingSource;
  posterArtworkSource: ArtworkSource;
  posterArtworkSourceOptions: Array<{ id: ArtworkSource; label: string; description: string }>;
  posterImageSize: string;
  posterImageSizeOptions: Array<{ id: string; label: string; description: string }>;
  posterImageText: PosterImageTextPreference;
  posterImageTextOptions: Array<{ id: PosterImageTextPreference; label: string; description: string }>;
  posterRatingPresentation: RatingPresentation;
  posterRatingStyle: RatingStyle;
  posterRatingRows: RatingProviderRow[];
  posterRatingsLayout: PosterRatingLayout;
  posterSideRatingsOffset: number;
  posterSideRatingsPosition: SideRatingPosition;
  previewType: ProxyType;
  configString: string;
  proxyUrl: string;
  backdropRatingRows: RatingProviderRow[];
  logoRatingRows: RatingProviderRow[];
  selectedPresetId: ConfiguratorPresetId | null;
  setBackdropAggregateRatingSource: (value: AggregateRatingSource) => void;
  setBackdropImageText: (value: BackdropImageTextPreference) => void;
  setBackdropRatingPresentation: (value: RatingPresentation) => void;
  setBackdropRatingStyle: (value: RatingStyle) => void;
  setBackdropSideRatingsOffset: (value: number) => void;
  setBackdropSideRatingsPosition: (value: SideRatingPosition) => void;
  setLogoAggregateRatingSource: (value: AggregateRatingSource) => void;
  setLogoRatingPresentation: (value: RatingPresentation) => void;
  setLogoRatingStyle: (value: RatingStyle) => void;
  setPosterAggregateRatingSource: (value: AggregateRatingSource) => void;
  setPosterImageText: (value: PosterImageTextPreference) => void;
  setPosterRatingPresentation: (value: RatingPresentation) => void;
  setPosterRatingStyle: (value: RatingStyle) => void;
  setPosterSideRatingsOffset: (value: number) => void;
  setPosterSideRatingsPosition: (value: SideRatingPosition) => void;
  wizardAnswers: Partial<ConfiguratorWizardAnswers>;
  wizardQuestionIndex: number;
}) {
  const activeRatingStyle =
    previewType === 'poster'
      ? posterRatingStyle
      : previewType === 'backdrop'
        ? backdropRatingStyle
        : logoRatingStyle;
  const activeRatingPresentation =
    previewType === 'poster'
      ? posterRatingPresentation
      : previewType === 'backdrop'
        ? backdropRatingPresentation
        : logoRatingPresentation;
  const activeAggregateRatingSource =
    previewType === 'poster'
      ? posterAggregateRatingSource
      : previewType === 'backdrop'
        ? backdropAggregateRatingSource
        : logoAggregateRatingSource;
  const usesAggregatePresentation = usesAggregateRatingPresentation(activeRatingPresentation);
  const activeAggregateAccent =
    aggregateAccentMode === 'custom'
      ? usesDualAggregateRatingPresentation(activeRatingPresentation)
        ? aggregateCriticsAccentColor
        : aggregateAccentColor
      : usesDualAggregateRatingPresentation(activeRatingPresentation)
        ? AGGREGATE_RATING_SOURCE_ACCENTS.critics
        : AGGREGATE_RATING_SOURCE_ACCENTS[activeAggregateRatingSource];
  const activeImageText = previewType === 'backdrop' ? backdropImageText : posterImageText;
  const activeImageTextOptions =
    previewType === 'backdrop' ? backdropImageTextOptions : posterImageTextOptions;
  const activeImageTextOptionMeta =
    activeImageTextOptions.find((option) => option.id === activeImageText) || null;
  const activeArtworkSourceOptions =
    previewType === 'backdrop' ? backdropArtworkSourceOptions : posterArtworkSourceOptions;
  const activeArtworkSource = previewType === 'backdrop' ? backdropArtworkSource : posterArtworkSource;
  const activePosterImageSizeOptionMeta =
    posterImageSizeOptions.find((option) => option.id === posterImageSize) || posterImageSizeOptions[0];
  const activeArtworkSourceOptionMeta =
    activeArtworkSourceOptions.find((option) => option.id === activeArtworkSource) || null;
  const activeLogoSourceOptionMeta =
    logoArtworkSourceOptions.find((option) => option.id === logoArtworkSource) || null;
  const shouldShowSideRatingPlacement =
    previewType === 'poster'
      ? isVerticalPosterRatingLayout(posterRatingsLayout) || activeRatingPresentation === 'blockbuster'
      : previewType === 'backdrop'
        ? backdropRatingsLayout === 'right-vertical' || activeRatingPresentation === 'blockbuster'
        : false;
  const activeSideRatingsPosition =
    previewType === 'backdrop' ? backdropSideRatingsPosition : posterSideRatingsPosition;
  const activeSideRatingsOffset =
    previewType === 'backdrop' ? backdropSideRatingsOffset : posterSideRatingsOffset;
  const styleLabel =
    previewType === 'poster'
      ? 'Poster Ratings Style'
      : previewType === 'backdrop'
        ? 'Backdrop Ratings Style'
        : 'Logo Ratings Style';
  const textLabel = previewType === 'backdrop' ? 'Backdrop Text' : 'Poster Text';
  const providersLabel =
    previewType === 'poster'
      ? 'Poster Providers'
      : previewType === 'backdrop'
        ? 'Backdrop Providers'
        : 'Logo Providers';
  const ratingProviderRows =
    previewType === 'poster'
      ? posterRatingRows
      : previewType === 'backdrop'
        ? backdropRatingRows
        : logoRatingRows;
  const showsAggregateRatingSource = usesAggregateRatingSource(activeRatingPresentation);
  const showsAggregateAccentBarOffset = usesAggregateAccentBar(activeRatingPresentation);
  const activePresentationPreservesLayout = preservesSelectedRatingLayout(activeRatingPresentation);
  const isEditorialPresentation = activeRatingPresentation === 'editorial';
  const layoutPlacementHelp =
    previewType === 'poster'
      ? 'top, bottom, left, or right'
      : previewType === 'backdrop'
        ? 'center, right, or right vertical'
        : null;
  const selectedPresetMeta = selectedPresetId ? getConfiguratorPreset(selectedPresetId) : null;
  const wizardActiveQuestionId = CONFIGURATOR_WIZARD_QUESTION_ORDER[wizardQuestionIndex] || null;
  const wizardActiveQuestion = wizardActiveQuestionId
    ? CONFIGURATOR_WIZARD_QUESTIONS[wizardActiveQuestionId]
    : null;
  const wizardIsComplete = CONFIGURATOR_WIZARD_QUESTION_ORDER.every(
    (questionId) => questionId in wizardAnswers,
  );
  const wizardRecommendedPresetId = wizardIsComplete ? recommendConfiguratorPreset(wizardAnswers) : null;
  const wizardRecommendedPreset = wizardRecommendedPresetId
    ? getConfiguratorPreset(wizardRecommendedPresetId)
    : null;
  const quickPresentationOptions = SIMPLE_PRESENTATION_IDS.map((id) =>
    RATING_PRESENTATION_OPTIONS.find((option) => option.id === id),
  ).filter((option): option is (typeof RATING_PRESENTATION_OPTIONS)[number] => Boolean(option));
  const activePresentationOptionMeta =
    RATING_PRESENTATION_OPTIONS.find((option) => option.id === activeRatingPresentation) || null;
  const activeRatingStyleLabel =
    RATING_STYLE_OPTIONS.find((option) => option.id === activeRatingStyle)?.label || 'Default';
  const activeGenreBadgeModeLabel =
    GENRE_BADGE_MODE_OPTIONS.find((option) => option.id === genrePreviewMode)?.label || 'Both';
  const activeArtworkSourceSummary =
    previewType === 'logo' ? activeLogoSourceOptionMeta : activeArtworkSourceOptionMeta;
  const enabledProviderCount = ratingProviderRows.filter((row) => row.enabled).length;
  const showcaseGenreCards = genrePreviewCards.slice(0, 4);
  const activeTypeLabel =
    previewType === 'poster' ? 'Poster' : previewType === 'backdrop' ? 'Backdrop' : 'Logo';
  const currentSetupItems = [
    { label: 'Artwork', value: activeArtworkSourceSummary?.label || 'Default' },
    { label: 'Text', value: previewType === 'logo' ? 'Logo' : activeImageTextOptionMeta?.label || 'Clean' },
    { label: 'Badge mode', value: activeGenreBadgeModeLabel },
    { label: 'Output', value: activeTypeLabel },
    { label: 'Presentation', value: activePresentationOptionMeta?.label || 'Standard' },
    { label: 'Style', value: activeRatingStyleLabel },
  ];

  const resolvedActiveProviderEditorId =
    ratingProviderRows.some((row) => row.id === activeProviderEditorId)
      ? activeProviderEditorId
      : ratingProviderRows[0]?.id || 'tmdb';

  const setRatingStyleForType = useCallback(
    (value: RatingStyle) => {
      if (previewType === 'poster') {
        setPosterRatingStyle(value);
        return;
      }
      if (previewType === 'backdrop') {
        setBackdropRatingStyle(value);
        return;
      }
      setLogoRatingStyle(value);
    },
    [previewType, setBackdropRatingStyle, setLogoRatingStyle, setPosterRatingStyle],
  );

  const setRatingPresentationForType = useCallback(
    (value: RatingPresentation) => {
      if (previewType === 'poster') {
        setPosterRatingPresentation(value);
        return;
      }
      if (previewType === 'backdrop') {
        setBackdropRatingPresentation(value);
        return;
      }
      setLogoRatingPresentation(value);
    },
    [previewType, setBackdropRatingPresentation, setLogoRatingPresentation, setPosterRatingPresentation],
  );

  const setAggregateRatingSourceForType = useCallback(
    (value: AggregateRatingSource) => {
      if (previewType === 'poster') {
        setPosterAggregateRatingSource(value);
        return;
      }
      if (previewType === 'backdrop') {
        setBackdropAggregateRatingSource(value);
        return;
      }
      setLogoAggregateRatingSource(value);
    },
    [previewType, setBackdropAggregateRatingSource, setLogoAggregateRatingSource, setPosterAggregateRatingSource],
  );

  const setImageTextForType = useCallback(
    (value: PosterImageTextPreference) => {
      if (previewType === 'backdrop') {
        setBackdropImageText(value);
        return;
      }
      setPosterImageText(value);
    },
    [previewType, setBackdropImageText, setPosterImageText],
  );

  const setActiveSideRatingsPosition = previewType === 'backdrop'
    ? setBackdropSideRatingsPosition
    : setPosterSideRatingsPosition;
  const setActiveSideRatingsOffset = previewType === 'backdrop'
    ? setBackdropSideRatingsOffset
    : setPosterSideRatingsOffset;

  return {
    activeAggregateAccent,
    activeAggregateRatingSource,
    activeArtworkSource,
    activeArtworkSourceOptionMeta,
    activeArtworkSourceOptions,
    activeArtworkSourceSummary,
    activeGenreBadgeModeLabel,
    activeImageText,
    activeImageTextOptionMeta,
    activeImageTextOptions,
    activeLogoSourceOptionMeta,
    activePosterImageSizeOptionMeta,
    activePresentationOptionMeta,
    activePresentationPreservesLayout,
    activeRatingPresentation,
    activeRatingStyle,
    activeRatingStyleLabel,
    activeSideRatingsOffset,
    activeSideRatingsPosition,
    activeTypeLabel,
    canGenerateConfig: Boolean(configString),
    canGenerateProxy: Boolean(proxyUrl),
    currentSetupItems,
    enabledProviderCount,
    isEditorialPresentation,
    layoutPlacementHelp,
    providersLabel,
    quickPresentationOptions,
    ratingProviderRows,
    resolvedActiveProviderEditorId,
    selectedPresetMeta,
    setActiveSideRatingsOffset,
    setActiveSideRatingsPosition,
    setAggregateRatingSourceForType,
    setImageTextForType,
    setRatingPresentationForType,
    setRatingStyleForType,
    shouldShowSideRatingPlacement,
    showcaseGenreCards,
    showsAggregateAccentBarOffset,
    showsAggregateRatingSource,
    styleLabel,
    textLabel,
    usesAggregatePresentation,
    wizardActiveQuestion,
    wizardRecommendedPreset,
  };
}
