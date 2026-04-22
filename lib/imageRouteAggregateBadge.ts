import {
  computeWeightedAverage,
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  getAggregateRatingSourceLabel,
  getAggregateRatingSourceShortLabel,
  hasAggregateRatingProvidersForSource,
  selectAggregateRatingProviders,
  usesDualAggregateRatingPresentation,
  type AggregateProviderWeights,
  type AggregateRatingSource,
  type RatingPresentation,
} from './ratingPresentation.ts';
import {
  formatNormalizedRatingValue,
  normalizeRatingToTenPointValue,
  DEFAULT_RATING_VALUE_MODE,
  type RatingValueMode,
} from './ratingDisplay.ts';
import { type RatingPreference } from './ratingProviderCatalog.ts';
import { type AggregateBadgeKey, type BadgeKey } from './imageRouteConfig.ts';

export type AggregateBadgeInput = {
  key: BadgeKey;
  label: string;
  value: string;
  sourceValue?: string;
  iconUrl: string;
  accentColor: string;
  valueColor?: string;
  accentBarOffset?: number;
  accentBarVisible?: boolean;
  variant?: 'standard' | 'minimal' | 'summary';
};

const AGGREGATE_BADGE_KEY_BY_SOURCE: Record<AggregateRatingSource, AggregateBadgeKey> = {
  overall: 'aggregate-overall',
  critics: 'aggregate-critics',
  audience: 'aggregate-audience',
};

export const buildAggregateRatingBadgeForSource = ({
  requestedSource,
  presentation,
  renderablePreferences,
  ratingBadgeByProvider,
  resolveAccentColor,
  resolveValueColor,
  accentBarOffset = DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  accentBarVisible = true,
  allowFallbackToOverall = true,
  valueMode = DEFAULT_RATING_VALUE_MODE,
  providerWeights = {},
}: {
  requestedSource: AggregateRatingSource;
  presentation: RatingPresentation;
  renderablePreferences: RatingPreference[];
  ratingBadgeByProvider: Map<RatingPreference, AggregateBadgeInput>;
  resolveAccentColor: (
    source: AggregateRatingSource,
    normalizedScore: number | null,
  ) => string;
  resolveValueColor?: (
    source: AggregateRatingSource,
  ) => string | undefined;
  accentBarOffset?: number;
  accentBarVisible?: boolean;
  allowFallbackToOverall?: boolean;
  valueMode?: RatingValueMode;
  providerWeights?: AggregateProviderWeights;
}): AggregateBadgeInput | null => {
  const availableProviders = renderablePreferences.filter((provider) => ratingBadgeByProvider.has(provider));
  if (availableProviders.length === 0) return null;
  const useCompactAggregateBadge =
    presentation === 'minimal' || presentation === 'dual-minimal';

  const hasProvidersForRequestedSource =
    requestedSource === 'overall' ||
    hasAggregateRatingProvidersForSource(requestedSource, availableProviders);
  if (!allowFallbackToOverall && !hasProvidersForRequestedSource) {
    return null;
  }

  const resolvedSource =
    allowFallbackToOverall && requestedSource !== 'overall' && !hasProvidersForRequestedSource
      ? 'overall'
      : requestedSource;
  const selectedProviders = selectAggregateRatingProviders(resolvedSource, availableProviders);

  const numericEntries = selectedProviders
    .map((provider) => ({ provider, badge: ratingBadgeByProvider.get(provider) }))
    .filter((entry): entry is { provider: RatingPreference; badge: AggregateBadgeInput } => entry.badge !== undefined)
    .flatMap(({ provider, badge }) => {
      const v = normalizeRatingToTenPointValue(provider, String(badge.sourceValue || badge.value || '').trim());
      return v !== null ? [{ provider, value: v }] : [];
    });

  if (numericEntries.length === 0) return null;

  const averageValue = computeWeightedAverage(numericEntries, providerWeights);
  const effectiveSource = resolvedSource as AggregateRatingSource;

  const representativeProvider = selectedProviders.find((provider) =>
    Boolean(ratingBadgeByProvider.get(provider)?.iconUrl),
  );
  const representativeIconUrl = representativeProvider
    ? ratingBadgeByProvider.get(representativeProvider)?.iconUrl || ''
    : '';

  return {
    key: AGGREGATE_BADGE_KEY_BY_SOURCE[effectiveSource],
    label:
      useCompactAggregateBadge
        ? getAggregateRatingSourceShortLabel(effectiveSource)
        : getAggregateRatingSourceLabel(effectiveSource),
    value: formatNormalizedRatingValue(averageValue, valueMode),
    iconUrl: useCompactAggregateBadge ? representativeIconUrl : '',
    accentColor: resolveAccentColor(effectiveSource, averageValue),
    valueColor: resolveValueColor?.(effectiveSource),
    accentBarOffset,
    accentBarVisible,
    variant: useCompactAggregateBadge ? 'minimal' : 'summary',
  };
};

export const buildAggregateRatingBadges = ({
  requestedSource,
  presentation,
  renderablePreferences,
  ratingBadgeByProvider,
  resolveAccentColor,
  resolveValueColor,
  accentBarOffset = DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  accentBarVisible = true,
  valueMode = DEFAULT_RATING_VALUE_MODE,
  providerWeights = {},
}: {
  requestedSource: AggregateRatingSource;
  presentation: RatingPresentation;
  renderablePreferences: RatingPreference[];
  ratingBadgeByProvider: Map<RatingPreference, AggregateBadgeInput>;
  resolveAccentColor: (
    source: AggregateRatingSource,
    normalizedScore: number | null,
  ) => string;
  resolveValueColor?: (
    source: AggregateRatingSource,
  ) => string | undefined;
  accentBarOffset?: number;
  accentBarVisible?: boolean;
  valueMode?: RatingValueMode;
  providerWeights?: AggregateProviderWeights;
}) => {
  if (usesDualAggregateRatingPresentation(presentation)) {
    return (['critics', 'audience'] as const)
      .map((source) =>
        buildAggregateRatingBadgeForSource({
          requestedSource: source,
          presentation,
          renderablePreferences,
          ratingBadgeByProvider,
          resolveAccentColor,
          resolveValueColor,
          accentBarOffset,
          accentBarVisible,
          allowFallbackToOverall: false,
          valueMode,
          providerWeights,
        }),
      )
      .filter((badge): badge is AggregateBadgeInput => badge !== null);
  }

  const badge = buildAggregateRatingBadgeForSource({
    requestedSource,
    presentation,
    renderablePreferences,
    ratingBadgeByProvider,
    resolveAccentColor,
    resolveValueColor,
    accentBarOffset,
    accentBarVisible,
    valueMode,
    providerWeights,
  });

  return badge ? [badge] : [];
};
