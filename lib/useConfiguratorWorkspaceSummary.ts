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
  parseAggregateDynamicStops,
  preservesSelectedRatingLayout,
  RATING_PRESENTATION_OPTIONS,
  usesCompactRingPresentation,
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
  type BackdropImageSize,
  type BackdropImageTextPreference,
  type LogoBackground,
  type PosterImageTextPreference,
} from '@/lib/uiConfig';

type ProxyType = 'poster' | 'backdrop' | 'thumbnail' | 'logo';

const SIMPLE_PRESENTATION_IDS: RatingPresentation[] = [
  'standard',
  'minimal',
  'average',
  'ring',
  'blockbuster',
];

export function useConfiguratorWorkspaceSummary({
  activeProviderEditorId,
  backdropAggregateRatingSource,
  backdropArtworkSource,
  backdropArtworkSourceOptions,
  thumbnailBottomRatingsRow,
  backdropImageSize,
  backdropImageText,
  backdropImageSizeOptions,
  backdropImageTextOptions,
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
  wizardAnswers,
  wizardQuestionIndex,
  aggregateAccentColor,
  aggregateAccentMode,
  aggregateAudienceAccentColor,
  aggregateCriticsAccentColor,
  aggregateDynamicStops,
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
  aggregateDynamicStops: string;
  backdropAggregateRatingSource: AggregateRatingSource;
  backdropArtworkSource: ArtworkSource;
  backdropArtworkSourceOptions: Array<{ id: ArtworkSource; label: string; description: string }>;
  thumbnailBottomRatingsRow: boolean;
  backdropImageSize: BackdropImageSize;
  backdropImageText: BackdropImageTextPreference;
  backdropImageSizeOptions: Array<{ id: BackdropImageSize; label: string; description: string }>;
  backdropImageTextOptions: Array<{ id: BackdropImageTextPreference; label: string; description: string }>;
  backdropRatingPresentation: RatingPresentation;
  backdropRatingStyle: RatingStyle;
  backdropRatingsLayout: string;
  backdropBottomRatingsRow: boolean;
  backdropSideRatingsOffset: number;
  backdropSideRatingsPosition: SideRatingPosition;
  posterRatingXOffsetPillGlass: number;
  posterRatingYOffsetPillGlass: number;
  backdropRatingXOffsetPillGlass: number;
  backdropRatingYOffsetPillGlass: number;
  thumbnailRatingXOffsetPillGlass: number;
  thumbnailRatingYOffsetPillGlass: number;
  posterRatingXOffsetSquare: number;
  posterRatingYOffsetSquare: number;
  backdropRatingXOffsetSquare: number;
  backdropRatingYOffsetSquare: number;
  thumbnailRatingXOffsetSquare: number;
  thumbnailRatingYOffsetSquare: number;
  ratingXOffsetPillGlass: number;
  ratingYOffsetPillGlass: number;
  ratingXOffsetSquare: number;
  ratingYOffsetSquare: number;
  thumbnailAggregateRatingSource: AggregateRatingSource;
  thumbnailArtworkSource: ArtworkSource;
  thumbnailImageText: BackdropImageTextPreference;
  thumbnailRatingPresentation: RatingPresentation;
  thumbnailRatingRows: RatingProviderRow[];
  thumbnailRatingStyle: RatingStyle;
  thumbnailRatingsLayout: string;
  thumbnailSideRatingsOffset: number;
  thumbnailSideRatingsPosition: SideRatingPosition;
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
  setPosterRatingXOffsetPillGlass: (value: number) => void;
  setPosterRatingYOffsetPillGlass: (value: number) => void;
  setBackdropRatingXOffsetPillGlass: (value: number) => void;
  setBackdropRatingYOffsetPillGlass: (value: number) => void;
  setThumbnailRatingXOffsetPillGlass: (value: number) => void;
  setThumbnailRatingYOffsetPillGlass: (value: number) => void;
  setPosterRatingXOffsetSquare: (value: number) => void;
  setPosterRatingYOffsetSquare: (value: number) => void;
  setBackdropRatingXOffsetSquare: (value: number) => void;
  setBackdropRatingYOffsetSquare: (value: number) => void;
  setThumbnailRatingXOffsetSquare: (value: number) => void;
  setThumbnailRatingYOffsetSquare: (value: number) => void;
  setRatingXOffsetPillGlass: (value: number) => void;
  setRatingYOffsetPillGlass: (value: number) => void;
  setRatingXOffsetSquare: (value: number) => void;
  setRatingYOffsetSquare: (value: number) => void;
  setThumbnailAggregateRatingSource: (value: AggregateRatingSource) => void;
  setThumbnailImageText: (value: BackdropImageTextPreference) => void;
  setThumbnailRatingPresentation: (value: RatingPresentation) => void;
  setThumbnailRatingStyle: (value: RatingStyle) => void;
  setThumbnailSideRatingsOffset: (value: number) => void;
  setThumbnailSideRatingsPosition: (value: SideRatingPosition) => void;
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
        : previewType === 'thumbnail'
          ? thumbnailRatingStyle
          : logoRatingStyle;
  const activeRatingPresentation =
    previewType === 'poster'
      ? posterRatingPresentation
      : previewType === 'backdrop'
        ? backdropRatingPresentation
        : previewType === 'thumbnail'
          ? thumbnailRatingPresentation
          : logoRatingPresentation;
  const activeAggregateRatingSource =
    previewType === 'poster'
      ? posterAggregateRatingSource
      : previewType === 'backdrop'
        ? backdropAggregateRatingSource
        : previewType === 'thumbnail'
          ? thumbnailAggregateRatingSource
        : logoAggregateRatingSource;
  const usesAggregatePresentation = usesAggregateRatingPresentation(activeRatingPresentation);
  const isCompactRingPresentation = usesCompactRingPresentation(activeRatingPresentation);
  const dynamicAccentPreviewColor =
    parseAggregateDynamicStops(aggregateDynamicStops).at(-1)?.color ||
    AGGREGATE_RATING_SOURCE_ACCENTS[activeAggregateRatingSource];
  const activeAggregateAccent =
    aggregateAccentMode === 'dynamic'
      ? dynamicAccentPreviewColor
      : aggregateAccentMode === 'custom'
      ? usesDualAggregateRatingPresentation(activeRatingPresentation)
        ? aggregateCriticsAccentColor
        : aggregateAccentColor
      : usesDualAggregateRatingPresentation(activeRatingPresentation)
        ? AGGREGATE_RATING_SOURCE_ACCENTS.critics
        : AGGREGATE_RATING_SOURCE_ACCENTS[activeAggregateRatingSource];
  const activeImageText =
    previewType === 'backdrop'
      ? backdropImageText
      : previewType === 'thumbnail'
        ? thumbnailImageText
        : posterImageText;
  const activeImageTextOptions =
    previewType === 'backdrop' || previewType === 'thumbnail'
      ? backdropImageTextOptions
      : posterImageTextOptions;
  const activeImageTextOptionMeta =
    activeImageTextOptions.find((option) => option.id === activeImageText) || null;
  const activeArtworkSourceOptions =
    previewType === 'backdrop' || previewType === 'thumbnail'
      ? backdropArtworkSourceOptions
      : posterArtworkSourceOptions;
  const activeArtworkSource =
    previewType === 'backdrop'
      ? backdropArtworkSource
      : previewType === 'thumbnail'
        ? thumbnailArtworkSource
        : posterArtworkSource;
  const activePosterImageSizeOptionMeta =
    posterImageSizeOptions.find((option) => option.id === posterImageSize) || posterImageSizeOptions[0];
  const activeBackdropImageSizeOptionMeta =
    backdropImageSizeOptions.find((option) => option.id === backdropImageSize) || backdropImageSizeOptions[0];
  const activeArtworkSourceOptionMeta =
    activeArtworkSourceOptions.find((option) => option.id === activeArtworkSource) || null;
  const activeLogoSourceOptionMeta =
    logoArtworkSourceOptions.find((option) => option.id === logoArtworkSource) || null;
  const shouldShowSideRatingPlacement =
    previewType === 'poster'
      ? isVerticalPosterRatingLayout(posterRatingsLayout) || activeRatingPresentation === 'blockbuster'
      : previewType === 'backdrop'
        ? !backdropBottomRatingsRow &&
          (backdropRatingsLayout === 'right-vertical' || activeRatingPresentation === 'blockbuster')
        : previewType === 'thumbnail'
          ? !thumbnailBottomRatingsRow &&
            (thumbnailRatingsLayout === 'right-vertical' || activeRatingPresentation === 'blockbuster')
        : false;
  const activeSideRatingsPosition =
    previewType === 'backdrop'
      ? backdropSideRatingsPosition
      : previewType === 'thumbnail'
        ? thumbnailSideRatingsPosition
        : posterSideRatingsPosition;
  const activeSideRatingsOffset =
    previewType === 'backdrop'
      ? backdropSideRatingsOffset
      : previewType === 'thumbnail'
        ? thumbnailSideRatingsOffset
        : posterSideRatingsOffset;
  const activeRatingXOffsetPillGlass =
    previewType === 'poster'
      ? posterRatingXOffsetPillGlass
      : previewType === 'backdrop'
        ? backdropRatingXOffsetPillGlass
        : previewType === 'thumbnail'
          ? thumbnailRatingXOffsetPillGlass
          : ratingXOffsetPillGlass;
  const activeRatingYOffsetPillGlass =
    previewType === 'poster'
      ? posterRatingYOffsetPillGlass
      : previewType === 'backdrop'
        ? backdropRatingYOffsetPillGlass
        : previewType === 'thumbnail'
          ? thumbnailRatingYOffsetPillGlass
          : ratingYOffsetPillGlass;
  const activeRatingXOffsetSquare =
    previewType === 'poster'
      ? posterRatingXOffsetSquare
      : previewType === 'backdrop'
        ? backdropRatingXOffsetSquare
        : previewType === 'thumbnail'
          ? thumbnailRatingXOffsetSquare
          : ratingXOffsetSquare;
  const activeRatingYOffsetSquare =
    previewType === 'poster'
      ? posterRatingYOffsetSquare
      : previewType === 'backdrop'
        ? backdropRatingYOffsetSquare
        : previewType === 'thumbnail'
          ? thumbnailRatingYOffsetSquare
          : ratingYOffsetSquare;
  const styleLabel =
    previewType === 'poster'
      ? 'Poster Ratings Style'
      : previewType === 'backdrop'
        ? 'Backdrop Ratings Style'
        : previewType === 'thumbnail'
          ? 'Thumbnail Ratings Style'
        : 'Logo Ratings Style';
  const textLabel =
    previewType === 'backdrop'
      ? 'Backdrop Text'
      : previewType === 'thumbnail'
        ? 'Thumbnail Text'
        : 'Poster Text';
  const providersLabel =
    previewType === 'poster'
      ? 'Poster Providers'
      : previewType === 'backdrop'
        ? 'Backdrop Providers'
        : previewType === 'thumbnail'
          ? 'Thumbnail Providers'
        : 'Logo Providers';
  const ratingProviderRows =
    previewType === 'poster'
      ? posterRatingRows
      : previewType === 'backdrop'
        ? backdropRatingRows
        : previewType === 'thumbnail'
          ? thumbnailRatingRows
        : logoRatingRows;
  const showsAggregateRatingSource = usesAggregateRatingSource(activeRatingPresentation);
  const showsAggregateAccentBarOffset =
    usesAggregateAccentBar(activeRatingPresentation) && !isCompactRingPresentation;
  const activePresentationPreservesLayout = preservesSelectedRatingLayout(activeRatingPresentation);
  const isEditorialPresentation = activeRatingPresentation === 'editorial';
  const layoutPlacementHelp =
    previewType === 'poster'
      ? 'top, bottom, left, or right'
      : previewType === 'backdrop'
        ? backdropBottomRatingsRow
          ? 'the Bottom Row'
          : 'center, right, or right vertical'
        : previewType === 'thumbnail'
          ? thumbnailBottomRatingsRow
            ? 'the Bottom Row'
            : 'center, right, or right vertical'
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
    previewType === 'poster'
      ? 'Poster'
      : previewType === 'backdrop'
        ? 'Backdrop'
        : previewType === 'thumbnail'
          ? 'Thumbnail'
          : 'Logo';
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
      if (previewType === 'thumbnail') {
        setThumbnailRatingStyle(value);
        return;
      }
      setLogoRatingStyle(value);
    },
    [previewType, setBackdropRatingStyle, setLogoRatingStyle, setPosterRatingStyle, setThumbnailRatingStyle],
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
      if (previewType === 'thumbnail') {
        setThumbnailRatingPresentation(value);
        return;
      }
      setLogoRatingPresentation(value);
    },
    [previewType, setBackdropRatingPresentation, setLogoRatingPresentation, setPosterRatingPresentation, setThumbnailRatingPresentation],
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
      if (previewType === 'thumbnail') {
        setThumbnailAggregateRatingSource(value);
        return;
      }
      setLogoAggregateRatingSource(value);
    },
    [previewType, setBackdropAggregateRatingSource, setLogoAggregateRatingSource, setPosterAggregateRatingSource, setThumbnailAggregateRatingSource],
  );

  const setImageTextForType = useCallback(
    (value: PosterImageTextPreference) => {
      if (previewType === 'backdrop') {
        setBackdropImageText(value);
        return;
      }
      if (previewType === 'thumbnail') {
        setThumbnailImageText(value);
        return;
      }
      setPosterImageText(value);
    },
    [previewType, setBackdropImageText, setPosterImageText, setThumbnailImageText],
  );

  const setActiveSideRatingsPosition =
    previewType === 'backdrop'
      ? setBackdropSideRatingsPosition
      : previewType === 'thumbnail'
        ? setThumbnailSideRatingsPosition
        : setPosterSideRatingsPosition;
  const setActiveSideRatingsOffset =
    previewType === 'backdrop'
      ? setBackdropSideRatingsOffset
      : previewType === 'thumbnail'
        ? setThumbnailSideRatingsOffset
        : setPosterSideRatingsOffset;
  const setActiveRatingXOffsetPillGlass =
    previewType === 'poster'
      ? setPosterRatingXOffsetPillGlass
      : previewType === 'backdrop'
        ? setBackdropRatingXOffsetPillGlass
        : previewType === 'thumbnail'
          ? setThumbnailRatingXOffsetPillGlass
          : setRatingXOffsetPillGlass;
  const setActiveRatingYOffsetPillGlass =
    previewType === 'poster'
      ? setPosterRatingYOffsetPillGlass
      : previewType === 'backdrop'
        ? setBackdropRatingYOffsetPillGlass
        : previewType === 'thumbnail'
          ? setThumbnailRatingYOffsetPillGlass
          : setRatingYOffsetPillGlass;
  const setActiveRatingXOffsetSquare =
    previewType === 'poster'
      ? setPosterRatingXOffsetSquare
      : previewType === 'backdrop'
        ? setBackdropRatingXOffsetSquare
        : previewType === 'thumbnail'
          ? setThumbnailRatingXOffsetSquare
          : setRatingXOffsetSquare;
  const setActiveRatingYOffsetSquare =
    previewType === 'poster'
      ? setPosterRatingYOffsetSquare
      : previewType === 'backdrop'
        ? setBackdropRatingYOffsetSquare
        : previewType === 'thumbnail'
          ? setThumbnailRatingYOffsetSquare
          : setRatingYOffsetSquare;

  return {
    activeAggregateAccent,
    activeAggregateRatingSource,
    activeArtworkSource,
    activeArtworkSourceOptionMeta,
    activeArtworkSourceOptions,
    activeArtworkSourceSummary,
    activeBackdropImageSizeOptionMeta,
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
    activeRatingXOffsetPillGlass,
    activeRatingYOffsetPillGlass,
    activeRatingXOffsetSquare,
    activeRatingYOffsetSquare,
    activeSideRatingsOffset,
    activeSideRatingsPosition,
    activeTypeLabel,
    canGenerateConfig: Boolean(configString),
    canGenerateProxy: Boolean(proxyUrl),
    currentSetupItems,
    enabledProviderCount,
    isEditorialPresentation,
    isCompactRingPresentation,
    layoutPlacementHelp,
    providersLabel,
    quickPresentationOptions,
    ratingProviderRows,
    resolvedActiveProviderEditorId,
    selectedPresetMeta,
    setActiveRatingXOffsetPillGlass,
    setActiveRatingYOffsetPillGlass,
    setActiveRatingXOffsetSquare,
    setActiveRatingYOffsetSquare,
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
