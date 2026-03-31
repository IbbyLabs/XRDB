import {
  RATING_PROVIDER_OPTIONS,
  orderRatingPreferencesForRender,
  selectAvailableRatingPreferences,
  type RatingPreference,
} from './ratingProviderCatalog.ts';
import { getPosterRatingLayoutMaxBadges, type PosterRatingLayout } from './posterLayoutOptions.ts';
import {
  resolveBackdropRatingLayoutForPresentation,
  resolveLogoRatingsMaxForPresentation,
  resolvePosterRatingLayoutForPresentation,
  resolvePosterRatingsMaxPerSideForPresentation,
  usesAggregateRatingPresentation,
  type AggregateAccentMode,
  type AggregateRatingSource,
  type RatingPresentation,
} from './ratingPresentation.ts';
import { formatDisplayRatingValue, type RatingValueMode } from './ratingDisplay.ts';
import { buildAggregateRatingBadges } from './imageRouteAggregateBadge.ts';
import { resolveRatingProviderBadgeAppearance } from './ratingProviderIcons.ts';
import {
  DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
  type RatingProviderAppearanceOverrides,
} from './badgeCustomization.ts';
import { resolveXrdbProviderIconScalePercent } from './xrdbBadgeAppearanceDefaults.ts';
import { buildEditorialRatingOverlaySvg, type EditorialRatingOverlaySpec } from './editorialRatingOverlay.ts';
import { getEditorialEyebrowText } from './imageRouteDisplayPrefs.ts';
import type { GenreBadgeFamilyMeta, GenreBadgeFamilyId } from './genreBadge.ts';
import type { GenreBadgeSpec, RatingBadge } from './imageRouteRenderer.ts';
import type { BackdropRatingLayout } from './backdropLayoutOptions.ts';

const ANIME_ONLY_RATING_PROVIDER_SET = new Set<RatingPreference>(['myanimelist', 'anilist', 'kitsu']);
const RATING_PROVIDER_META = new Map(
  RATING_PROVIDER_OPTIONS.map((provider) => [provider.id, provider] as const),
);

const AGGREGATE_BADGE_ACCENT_BY_SOURCE = {
  overall: '#f59e0b',
  critics: '#22c55e',
  audience: '#38bdf8',
} as const;

export type ImageRouteDisplayState = {
  usePosterBadgeLayout: boolean;
  useBackdropBadgeLayout: boolean;
  useLogoBadgeLayout: boolean;
  usesAggregatePresentation: boolean;
  useEditorialPosterPresentation: boolean;
  useBlockbusterPresentation: boolean;
  effectivePosterRatingsLayout: PosterRatingLayout;
  effectivePosterRatingsMaxPerSide: number | null;
  effectiveBackdropRatingsLayout: BackdropRatingLayout;
  effectiveLogoRatingsMax: number | null;
  displayRatingBadges: RatingBadge[];
  streamBadges: RatingBadge[];
  genreBadge: GenreBadgeSpec | null;
  editorialOverlay: EditorialRatingOverlaySpec | null;
  ratingBadgeByProvider: Map<RatingPreference, RatingBadge>;
  renderableRatingPreferences: RatingPreference[];
  debugResolvedRatingProviders: RatingPreference[];
};

export const resolveImageRouteDisplayState = (input: {
  imageType: 'poster' | 'backdrop' | 'logo';
  ratingPresentation: RatingPresentation;
  aggregateRatingSource: AggregateRatingSource;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string | null;
  aggregateCriticsAccentColor: string | null;
  aggregateAudienceAccentColor: string | null;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  posterRatingsLayout: PosterRatingLayout;
  posterRatingsMaxPerSide: number | null;
  backdropRatingsLayout: BackdropRatingLayout;
  logoRatingsMax: number | null;
  posterRatingsMax: number | null;
  backdropRatingsMax: number | null;
  effectiveRatingPreferences: RatingPreference[];
  hasExplicitRatingOrder: boolean;
  allowAnimeOnlyRatings: boolean;
  shouldRenderRawKitsuFallbackRating: boolean;
  tmdbRating: string;
  providerRatings: Map<RatingPreference, string>;
  ratingValueMode: RatingValueMode;
  providerAppearanceOverrides: RatingProviderAppearanceOverrides;
  primaryGenreFamily: GenreBadgeFamilyMeta | null;
  streamBadges: RatingBadge[];
  genreBadge: GenreBadgeSpec | null;
  outputWidth: number;
  outputHeight: number;
}): ImageRouteDisplayState => {
  const {
    imageType,
    ratingPresentation,
    aggregateRatingSource,
    aggregateAccentMode,
    aggregateAccentColor,
    aggregateCriticsAccentColor,
    aggregateAudienceAccentColor,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    posterRatingsLayout,
    posterRatingsMaxPerSide,
    backdropRatingsLayout,
    logoRatingsMax,
    posterRatingsMax,
    backdropRatingsMax,
    effectiveRatingPreferences,
    hasExplicitRatingOrder,
    allowAnimeOnlyRatings,
    shouldRenderRawKitsuFallbackRating,
    tmdbRating,
    providerRatings,
    ratingValueMode,
    providerAppearanceOverrides,
    primaryGenreFamily,
    outputWidth,
    outputHeight,
  } = input;
  let { streamBadges, genreBadge } = input;

  const usePosterBadgeLayout = imageType === 'poster';
  const useBackdropBadgeLayout = imageType === 'backdrop';
  const useLogoBadgeLayout = imageType === 'logo';
  const usesAggregatePresentation = usesAggregateRatingPresentation(ratingPresentation);
  const useEditorialPosterPresentation =
    imageType === 'poster' && ratingPresentation === 'editorial';
  const useBlockbusterPresentation = ratingPresentation === 'blockbuster';
  const effectivePosterRatingsLayout =
    usePosterBadgeLayout
      ? resolvePosterRatingLayoutForPresentation(ratingPresentation, posterRatingsLayout)
      : posterRatingsLayout;
  const effectivePosterRatingsMaxPerSide =
    usePosterBadgeLayout
      ? resolvePosterRatingsMaxPerSideForPresentation(
          ratingPresentation,
          posterRatingsMaxPerSide,
        )
      : posterRatingsMaxPerSide;
  const effectiveBackdropRatingsLayout =
    useBackdropBadgeLayout
      ? resolveBackdropRatingLayoutForPresentation(ratingPresentation, backdropRatingsLayout)
      : backdropRatingsLayout;
  const effectiveLogoRatingsMax =
    useLogoBadgeLayout
      ? resolveLogoRatingsMaxForPresentation(ratingPresentation, logoRatingsMax)
      : logoRatingsMax;
  const posterRatingLimit = usePosterBadgeLayout
    ? getPosterRatingLayoutMaxBadges(effectivePosterRatingsLayout, effectivePosterRatingsMaxPerSide)
    : null;
  const logoRatingLimit = useLogoBadgeLayout ? effectiveLogoRatingsMax : null;
  const explicitRatingBadgeLimit =
    imageType === 'poster'
      ? posterRatingsMax
      : imageType === 'backdrop'
        ? backdropRatingsMax
        : effectiveLogoRatingsMax;
  const resolvedRatingBadgeLimit =
    !usesAggregatePresentation && (usePosterBadgeLayout || useLogoBadgeLayout)
      ? (posterRatingLimit ?? logoRatingLimit ?? null)
      : !usesAggregatePresentation && useBackdropBadgeLayout
        ? explicitRatingBadgeLimit
        : null;
  const effectiveResolvedRatingBadgeLimit =
    typeof explicitRatingBadgeLimit === 'number' && explicitRatingBadgeLimit > 0
      ? typeof resolvedRatingBadgeLimit === 'number' && resolvedRatingBadgeLimit > 0
        ? Math.min(resolvedRatingBadgeLimit, explicitRatingBadgeLimit)
        : explicitRatingBadgeLimit
      : resolvedRatingBadgeLimit;

  const ratingBadgeByProvider = new Map<RatingPreference, RatingBadge>();
  const renderableRatingPreferences = orderRatingPreferencesForRender(
    effectiveRatingPreferences.filter((provider) =>
      provider === 'kitsu'
        ? shouldRenderRawKitsuFallbackRating || allowAnimeOnlyRatings
        : allowAnimeOnlyRatings || !ANIME_ONLY_RATING_PROVIDER_SET.has(provider),
    ),
    {
      prioritizeAnimeRatings: allowAnimeOnlyRatings,
      preserveInputOrder: hasExplicitRatingOrder,
    },
  );

  for (const provider of renderableRatingPreferences) {
    const meta = RATING_PROVIDER_META.get(provider);
    if (!meta) continue;

    const baseValue = provider === 'tmdb' ? tmdbRating : providerRatings.get(provider) || null;
    if (!shouldRenderRatingValue(baseValue)) continue;
    const value = formatDisplayRatingValue(provider, baseValue as string, {
      valueMode: ratingValueMode,
    });
    const sourceValue = formatDisplayRatingValue(provider, baseValue as string, {
      valueMode: 'native',
    });
    if (!shouldRenderRatingValue(value)) continue;
    const appearance = resolveRatingProviderBadgeAppearance({
      provider,
      label: meta.label,
      iconUrl: meta.iconUrl,
      accentColor: meta.accentColor,
      sourceValue,
    });
    const providerAppearance = providerAppearanceOverrides[provider];
    ratingBadgeByProvider.set(provider, {
      key: provider,
      label: appearance.label,
      value,
      sourceValue,
      iconUrl: providerAppearance?.iconUrl || appearance.iconUrl,
      accentColor: providerAppearance?.accentColor || appearance.accentColor,
      iconCornerRadius: 'iconCornerRadius' in meta ? meta.iconCornerRadius : undefined,
      iconScalePercent:
        providerAppearance?.iconScalePercent ??
        (useLogoBadgeLayout
          ? resolveXrdbProviderIconScalePercent(provider)
          : DEFAULT_PROVIDER_ICON_SCALE_PERCENT),
      stackedLineVisible:
        providerAppearance?.stackedLineVisible === false ? false : undefined,
      stackedLineWidthPercent: providerAppearance?.stackedLineWidthPercent,
      stackedLineHeightPercent: providerAppearance?.stackedLineHeightPercent,
      stackedLineGapPercent: providerAppearance?.stackedLineGapPercent,
      stackedWidthPercent: providerAppearance?.stackedWidthPercent,
      stackedSurfaceOpacityPercent: providerAppearance?.stackedSurfaceOpacityPercent,
      stackedAccentMode: providerAppearance?.stackedAccentMode,
      stackedLineOffsetX: providerAppearance?.stackedLineOffsetX,
      stackedLineOffsetY: providerAppearance?.stackedLineOffsetY,
      stackedIconOffsetX: providerAppearance?.stackedIconOffsetX,
      stackedIconOffsetY: providerAppearance?.stackedIconOffsetY,
      stackedValueOffsetX: providerAppearance?.stackedValueOffsetX,
      stackedValueOffsetY: providerAppearance?.stackedValueOffsetY,
      variant: 'standard',
    });
  }

  const resolveAggregateAccentColor = (source: AggregateRatingSource) => {
    if (aggregateAccentMode === 'custom') {
      if (source === 'critics' && aggregateCriticsAccentColor) {
        return aggregateCriticsAccentColor;
      }
      if (source === 'audience' && aggregateAudienceAccentColor) {
        return aggregateAudienceAccentColor;
      }
      if (aggregateAccentColor) {
        return aggregateAccentColor;
      }
    }
    if (aggregateAccentMode === 'genre' && primaryGenreFamily?.accentColor) {
      return primaryGenreFamily.accentColor;
    }
    return AGGREGATE_BADGE_ACCENT_BY_SOURCE[source];
  };

  const aggregateBadges = usesAggregatePresentation
    ? buildAggregateRatingBadges({
        requestedSource: aggregateRatingSource,
        presentation: ratingPresentation,
        renderablePreferences: renderableRatingPreferences,
        ratingBadgeByProvider,
        resolveAccentColor: resolveAggregateAccentColor,
        accentBarOffset: aggregateAccentBarOffset,
        accentBarVisible: aggregateAccentBarVisible,
        valueMode: ratingValueMode,
      })
    : [];
  const primaryAggregateBadge = aggregateBadges[0] || null;
  const editorialAggregateSource =
    primaryAggregateBadge?.key === 'aggregate-critics'
      ? 'critics'
      : primaryAggregateBadge?.key === 'aggregate-audience'
        ? 'audience'
        : 'overall';
  const editorialOverlay =
    useEditorialPosterPresentation && primaryAggregateBadge
      ? buildEditorialRatingOverlaySvg({
          outputWidth,
          outputHeight,
          eyebrowText: getEditorialEyebrowText(
            (primaryGenreFamily?.id || null) as GenreBadgeFamilyId | null,
            editorialAggregateSource,
          ),
          valueText: primaryAggregateBadge.value,
          accentColor: resolveAggregateAccentColor(editorialAggregateSource),
        })
      : null;

  const ratingBadges = usesAggregatePresentation
    ? aggregateBadges
    : selectAvailableRatingPreferences(
        renderableRatingPreferences,
        ratingBadgeByProvider.keys(),
        effectiveResolvedRatingBadgeLimit,
      )
        .map((provider) => ratingBadgeByProvider.get(provider) || null)
        .filter((badge): badge is RatingBadge => badge !== null);
  const displayRatingBadges = useEditorialPosterPresentation ? [] : ratingBadges;

  if (useEditorialPosterPresentation) {
    genreBadge = null;
  }

  return {
    usePosterBadgeLayout,
    useBackdropBadgeLayout,
    useLogoBadgeLayout,
    usesAggregatePresentation,
    useEditorialPosterPresentation,
    useBlockbusterPresentation,
    effectivePosterRatingsLayout,
    effectivePosterRatingsMaxPerSide,
    effectiveBackdropRatingsLayout,
    effectiveLogoRatingsMax,
    displayRatingBadges,
    streamBadges,
    genreBadge,
    editorialOverlay,
    ratingBadgeByProvider,
    renderableRatingPreferences,
    debugResolvedRatingProviders: [...ratingBadgeByProvider.keys()],
  };
};

const shouldRenderRatingValue = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().toLowerCase() !== 'n/a';
