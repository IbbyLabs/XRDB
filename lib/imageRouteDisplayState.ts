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
  hasAggregateRatingProvidersForSource,
  parseAggregateDynamicStops,
  resolveAggregateDynamicAccentColor,
  selectAggregateRatingProviders,
  usesCompactRingPresentation as isCompactRingPresentationMode,
  usesAggregateRatingPresentation,
  type AggregateAccentMode,
  type AggregateProviderWeights,
  type AggregateRatingSource,
  type RatingPresentation,
} from './ratingPresentation.ts';
import {
  formatDisplayRatingValue,
  normalizeRatingToTenPointValue,
  type RatingValueMode,
} from './ratingDisplay.ts';
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
import {
  DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
  DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
  type PosterCompactRingSource,
} from './posterCompactRing.ts';
import { buildPosterCompactRingOverlay, type PosterCompactRingOverlaySpec } from './posterCompactRingOverlay.ts';

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
  compactRingOverlay: PosterCompactRingOverlaySpec | null;
  ratingBadgeByProvider: Map<RatingPreference, RatingBadge>;
  renderableRatingPreferences: RatingPreference[];
  debugResolvedRatingProviders: RatingPreference[];
};

export const resolveImageRouteDisplayState = (input: {
  imageType: 'poster' | 'backdrop' | 'logo';
  ratingPresentation: RatingPresentation;
  aggregateRatingSource: AggregateRatingSource;
  aggregateProviderWeights: AggregateProviderWeights;
  aggregateAccentMode: AggregateAccentMode;
  aggregateAccentColor: string | null;
  aggregateCriticsAccentColor: string | null;
  aggregateAudienceAccentColor: string | null;
  aggregateValueColor: string | null;
  aggregateCriticsValueColor: string | null;
  aggregateAudienceValueColor: string | null;
  aggregateDynamicStops: string;
  aggregateAccentBarOffset: number;
  aggregateAccentBarVisible: boolean;
  posterRingValueSource: PosterCompactRingSource;
  posterRingProgressSource: PosterCompactRingSource;
  posterRingCenterOpacity: number;
  posterRingCriticsPriority: RatingPreference[];
  posterRingAudiencePriority: RatingPreference[];
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
  posterRatingBadgeScale: number;
}): ImageRouteDisplayState => {
  const {
    imageType,
    ratingPresentation,
    aggregateRatingSource,
    aggregateProviderWeights,
    aggregateAccentMode,
    aggregateAccentColor,
    aggregateCriticsAccentColor,
    aggregateAudienceAccentColor,
    aggregateValueColor,
    aggregateCriticsValueColor,
    aggregateAudienceValueColor,
    aggregateDynamicStops,
    aggregateAccentBarOffset,
    aggregateAccentBarVisible,
    posterRingValueSource,
    posterRingProgressSource,
    posterRingCenterOpacity,
    posterRingCriticsPriority,
    posterRingAudiencePriority,
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
    posterRatingBadgeScale,
  } = input;
  let { streamBadges, genreBadge } = input;
  const suppressRatingPresentation = ratingPresentation === 'none';
  if (suppressRatingPresentation) {
    streamBadges = [];
  }
  const aggregateDynamicStopEntries = parseAggregateDynamicStops(aggregateDynamicStops);

  const usePosterBadgeLayout = imageType === 'poster';
  const useBackdropBadgeLayout = imageType === 'backdrop';
  const useLogoBadgeLayout = imageType === 'logo';
  const usesAggregatePresentation =
    !suppressRatingPresentation && usesAggregateRatingPresentation(ratingPresentation);
  const useCompactRingPresentation =
    !suppressRatingPresentation && imageType === 'poster' && isCompactRingPresentationMode(ratingPresentation);
  const useEditorialPosterPresentation =
    !suppressRatingPresentation && imageType === 'poster' && ratingPresentation === 'editorial';
  const useBlockbusterPresentation = !suppressRatingPresentation && ratingPresentation === 'blockbuster';
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
    suppressRatingPresentation
      ? []
      : effectiveRatingPreferences.filter((provider) =>
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
      hasCustomIconOverride: Boolean(providerAppearance?.iconUrl),
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
      valueOffsetX: providerAppearance?.valueOffsetX,
      valueOffsetY: providerAppearance?.valueOffsetY,
      valueColor: aggregateValueColor || undefined,
      variant: 'standard',
    });
  }

  const resolveAggregateAccentColor = (
    source: AggregateRatingSource,
    normalizedScore: number | null,
  ) => {
    if (aggregateAccentMode === 'dynamic' && normalizedScore !== null) {
      return resolveAggregateDynamicAccentColor(
        parseFloat(normalizedScore.toFixed(1)) * 10,
        aggregateDynamicStopEntries,
      );
    }
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

  const resolveAggregateValueColor = (
    source: AggregateRatingSource,
  ): string | undefined => {
    if (source === 'critics' && aggregateCriticsValueColor) {
      return aggregateCriticsValueColor;
    }
    if (source === 'audience' && aggregateAudienceValueColor) {
      return aggregateAudienceValueColor;
    }
    if (aggregateValueColor) {
      return aggregateValueColor;
    }
    return undefined;
  };

  const aggregateBadges = usesAggregatePresentation
    ? buildAggregateRatingBadges({
        requestedSource: aggregateRatingSource,
        presentation: ratingPresentation,
        renderablePreferences: renderableRatingPreferences,
        ratingBadgeByProvider,
        resolveAccentColor: resolveAggregateAccentColor,
        resolveValueColor: resolveAggregateValueColor,
        accentBarOffset: aggregateAccentBarOffset,
        accentBarVisible: aggregateAccentBarVisible,
        valueMode: ratingValueMode,
        providerWeights: aggregateProviderWeights,
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
          accentColor: primaryAggregateBadge.accentColor,
        })
      : null;

  type CompactRingResolvedValue =
    | {
        kind: 'provider';
        provider: RatingPreference;
        badge: RatingBadge;
        normalizedValue: number;
      }
    | {
        kind: 'aggregate';
        source: AggregateRatingSource;
        normalizedValue: number;
      };

  const resolveCompactRingBadge = (
    requestedSource: PosterCompactRingSource,
  ): CompactRingResolvedValue | null => {
    const availableEntries = renderableRatingPreferences
      .map((provider) => {
        const badge = ratingBadgeByProvider.get(provider);
        if (!badge) return null;
        const normalizedValue = normalizeRatingToTenPointValue(
          provider,
          String(badge.sourceValue || badge.value || '').trim(),
        );
        if (normalizedValue === null) return null;
        return { provider, badge, normalizedValue };
      })
      .filter(
        (entry): entry is { provider: RatingPreference; badge: RatingBadge; normalizedValue: number } =>
          entry !== null,
      );

    if (availableEntries.length === 0) return null;

    const availableProviders = availableEntries.map((entry) => entry.provider);
    const availableEntryByProvider = new Map(
      availableEntries.map((entry) => [entry.provider, entry] as const),
    );

    const resolvePriorityEntry = (priorityList: RatingPreference[]) => {
      for (const provider of priorityList) {
        const entry = availableEntryByProvider.get(provider);
        if (entry) return entry;
      }
      return null;
    };

    const resolveAggregateValue = (
      source: AggregateRatingSource,
    ): { source: AggregateRatingSource; normalizedValue: number } | null => {
      if (
        source !== 'overall' &&
        !hasAggregateRatingProvidersForSource(source, availableProviders)
      ) {
        return null;
      }
      const selectedProviders = selectAggregateRatingProviders(source, availableProviders);
      const selectedValues = selectedProviders
        .map((provider) => availableEntryByProvider.get(provider)?.normalizedValue ?? null)
        .filter((value): value is number => value !== null);
      if (selectedValues.length === 0) {
        return null;
      }
      return {
        source,
        normalizedValue:
          selectedValues.reduce((sum, value) => sum + value, 0) / selectedValues.length,
      };
    };

    const resolveAggregatePriorityEntry = (source: AggregateRatingSource) => {
      if (source === 'critics') {
        return resolvePriorityEntry(posterRingCriticsPriority);
      }
      if (source === 'audience') {
        return resolvePriorityEntry(posterRingAudiencePriority);
      }
      const mergedPriority: RatingPreference[] = [];
      const seen = new Set<RatingPreference>();
      for (const provider of [...posterRingCriticsPriority, ...posterRingAudiencePriority]) {
        if (seen.has(provider)) continue;
        seen.add(provider);
        mergedPriority.push(provider);
      }
      return resolvePriorityEntry(mergedPriority);
    };

    if (requestedSource === 'priority-critics') {
      const priorityEntry = resolvePriorityEntry(posterRingCriticsPriority);
      return priorityEntry
        ? {
            kind: 'provider',
            provider: priorityEntry.provider,
            badge: priorityEntry.badge,
            normalizedValue: priorityEntry.normalizedValue,
          }
        : null;
    }

    if (requestedSource === 'priority-audience') {
      const priorityEntry = resolvePriorityEntry(posterRingAudiencePriority);
      return priorityEntry
        ? {
            kind: 'provider',
            provider: priorityEntry.provider,
            badge: priorityEntry.badge,
            normalizedValue: priorityEntry.normalizedValue,
          }
        : null;
    }

    if (
      requestedSource === 'overall' ||
      requestedSource === 'critics' ||
      requestedSource === 'audience'
    ) {
      const aggregateMatch =
        resolveAggregateValue(requestedSource) || resolveAggregateValue('overall');
      if (aggregateMatch) {
        return {
          kind: 'aggregate',
          source: aggregateMatch.source,
          normalizedValue: aggregateMatch.normalizedValue,
        };
      }
      const priorityFallback = resolveAggregatePriorityEntry(requestedSource);
      return priorityFallback
        ? {
            kind: 'provider',
            provider: priorityFallback.provider,
            badge: priorityFallback.badge,
            normalizedValue: priorityFallback.normalizedValue,
          }
        : null;
    }

    if (requestedSource !== 'highest') {
      const exactMatch = availableEntries.find((entry) => entry.provider === requestedSource);
      if (exactMatch) {
        return {
          kind: 'provider',
          provider: exactMatch.provider,
          badge: exactMatch.badge,
          normalizedValue: exactMatch.normalizedValue,
        };
      }
      return null;
    }

    const highest = availableEntries.reduce(
      (highest, entry) =>
        highest === null || entry.normalizedValue > highest.normalizedValue ? entry : highest,
      null as { provider: RatingPreference; badge: RatingBadge; normalizedValue: number } | null,
    );
    return highest
      ? {
          kind: 'provider',
          provider: highest.provider,
          badge: highest.badge,
          normalizedValue: highest.normalizedValue,
        }
      : null;
  };

  const valueRingBadge =
    useCompactRingPresentation
      ? resolveCompactRingBadge(posterRingValueSource || DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE)
      : null;
  const progressRingBadge =
    useCompactRingPresentation
      ? resolveCompactRingBadge(
          posterRingProgressSource || DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE,
        )
      : null;
  const compactRingPrimaryBadge = valueRingBadge;
  const compactRingScorePercent =
    parseFloat(((compactRingPrimaryBadge?.normalizedValue ?? 0)).toFixed(1)) * 10;
  const compactRingAccentColor =
    aggregateAccentMode === 'dynamic'
      ? resolveAggregateDynamicAccentColor(
          compactRingScorePercent,
          aggregateDynamicStopEntries,
        )
      : aggregateAccentMode === 'custom'
        ? aggregateAccentColor ||
          (compactRingPrimaryBadge?.kind === 'provider'
            ? compactRingPrimaryBadge.badge.accentColor
            : null) ||
          '#22c55e'
      : aggregateAccentMode === 'genre' && primaryGenreFamily?.accentColor
        ? primaryGenreFamily.accentColor
        : compactRingPrimaryBadge?.kind === 'aggregate'
          ? resolveAggregateAccentColor(
              compactRingPrimaryBadge.source,
              compactRingPrimaryBadge.normalizedValue,
            )
          : compactRingPrimaryBadge?.kind === 'provider'
            ? compactRingPrimaryBadge.badge.accentColor
            : '#22c55e';
  const compactRingValueColor =
    compactRingPrimaryBadge?.kind === 'aggregate'
      ? resolveAggregateValueColor(compactRingPrimaryBadge.source)
      : aggregateValueColor || undefined;
  const compactRingOverlay =
    useCompactRingPresentation && compactRingPrimaryBadge
      ? buildPosterCompactRingOverlay({
          outputWidth,
          outputHeight,
          valueText: String(Math.round(compactRingPrimaryBadge.normalizedValue * 10)),
          progressPercent: Math.round(
            (progressRingBadge || compactRingPrimaryBadge).normalizedValue * 10,
          ),
          centerOpacityPercent: posterRingCenterOpacity,
          accentColor: compactRingAccentColor,
          valueColor: compactRingValueColor,
          badgeScalePercent: posterRatingBadgeScale,
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
  const displayRatingBadges =
    useEditorialPosterPresentation || useCompactRingPresentation ? [] : ratingBadges;

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
    compactRingOverlay,
    ratingBadgeByProvider,
    renderableRatingPreferences,
    debugResolvedRatingProviders: [...ratingBadgeByProvider.keys()],
  };
};

const shouldRenderRatingValue = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().toLowerCase() !== 'n/a';
