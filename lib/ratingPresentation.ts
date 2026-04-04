import type { BackdropRatingLayout } from './backdropLayoutOptions.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';

export type RatingPresentation =
  | 'standard'
  | 'minimal'
  | 'average'
  | 'dual'
  | 'dual-minimal'
  | 'ring'
  | 'editorial'
  | 'blockbuster'
  | 'none';
export type AggregateRatingSource = 'overall' | 'critics' | 'audience';
export type AggregateAccentMode = 'source' | 'genre' | 'custom' | 'dynamic';
export type AggregateDynamicStop = {
  threshold: number;
  color: string;
};

export const DEFAULT_RATING_PRESENTATION: RatingPresentation = 'standard';
export const DEFAULT_AGGREGATE_RATING_SOURCE: AggregateRatingSource = 'overall';
export const DEFAULT_AGGREGATE_ACCENT_MODE: AggregateAccentMode = 'source';
export const DEFAULT_AGGREGATE_ACCENT_COLOR = '#a78bfa';
export const DEFAULT_AGGREGATE_VALUE_COLOR = '#ffffff';
export const DEFAULT_AGGREGATE_DYNAMIC_STOPS =
  '0:#7f1d1d,40:#dc2626,60:#f59e0b,75:#84cc16,85:#16a34a';
export const DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET = 0;
export const MIN_AGGREGATE_ACCENT_BAR_OFFSET = -12;
export const MAX_AGGREGATE_ACCENT_BAR_OFFSET = 12;
export const AGGREGATE_RATING_SOURCE_ACCENTS: Record<AggregateRatingSource, string> = {
  overall: '#a78bfa',
  critics: '#fb923c',
  audience: '#34d399',
};

export const RATING_PRESENTATION_OPTIONS: Array<{
  id: RatingPresentation;
  label: string;
  description: string;
}> = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Current provider badges and layouts.',
  },
  {
    id: 'minimal',
    label: 'Compact Average',
    description: 'One compact score chip using AVG, CRT, or AUD.',
  },
  {
    id: 'average',
    label: 'Labeled Average',
    description: 'One average badge labeled Overall, Critics, or Audience.',
  },
  {
    id: 'dual',
    label: 'Critics + Audience',
    description: 'Render separate critic and audience average badges at the same time.',
  },
  {
    id: 'dual-minimal',
    label: 'Compact Critics + Audience',
    description: 'Render separate critic and audience compact score chips at the same time.',
  },
  {
    id: 'ring',
    label: 'Compact Ring',
    description: 'Poster gets a fixed top right score ring with configurable center and progress sources.',
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'Poster gets an integrated top left score mark. Other outputs fall back to one clean average badge.',
  },
  {
    id: 'blockbuster',
    label: 'Blockbuster',
    description: 'Deliberately dense badge rich promo mode.',
  },
  {
    id: 'none',
    label: 'None',
    description: 'No rating badges or provider overlays.',
  },
];

export const AGGREGATE_RATING_SOURCE_OPTIONS: Array<{
  id: AggregateRatingSource;
  label: string;
  description: string;
}> = [
  {
    id: 'overall',
    label: 'Overall',
    description: 'Average across all available selected providers.',
  },
  {
    id: 'critics',
    label: 'Critics',
    description: 'Prefer critic focused sources such as Rotten Tomatoes and Metacritic.',
  },
  {
    id: 'audience',
    label: 'Audience',
    description: 'Prefer audience and user driven rating sources.',
  },
];

export const AGGREGATE_ACCENT_MODE_OPTIONS: Array<{
  id: AggregateAccentMode;
  label: string;
  description: string;
}> = [
  {
    id: 'source',
    label: 'Source',
    description: 'Use the built in colour for the active aggregate source.',
  },
  {
    id: 'genre',
    label: 'Genre',
    description: 'Match the resolved genre badge colour when a supported genre is available.',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Use a custom accent colour for aggregate badges and overlays.',
  },
  {
    id: 'dynamic',
    label: 'Dynamic',
    description: 'Map aggregate score ranges to configurable colours.',
  },
];

const CRITICS_RATING_PROVIDERS = new Set<RatingPreference>([
  'mdblist',
  'allocinepress',
  'tomatoes',
  'metacritic',
  'rogerebert',
]);

const AUDIENCE_RATING_PROVIDERS = new Set<RatingPreference>([
  'tmdb',
  'imdb',
  'allocine',
  'tomatoesaudience',
  'letterboxd',
  'metacriticuser',
  'trakt',
  'myanimelist',
  'anilist',
  'kitsu',
]);

export const normalizeRatingPresentation = (
  value: unknown,
  fallback: RatingPresentation = DEFAULT_RATING_PRESENTATION,
): RatingPresentation => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'standard' ||
    normalized === 'minimal' ||
    normalized === 'average' ||
    normalized === 'dual' ||
    normalized === 'dual-minimal' ||
    normalized === 'ring' ||
    normalized === 'editorial' ||
    normalized === 'blockbuster' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  if (
    normalized === 'dualminimal' ||
    normalized === 'minimal-dual' ||
    normalized === 'compact-dual' ||
    normalized === 'compactdual' ||
    normalized === 'dualcompact'
  ) {
    return 'dual-minimal';
  }
  return fallback;
};

export const resolveEffectiveRatingPresentation = (
  presentation: RatingPresentation,
  imageType: 'poster' | 'backdrop' | 'logo',
): RatingPresentation =>
  (presentation === 'editorial' || presentation === 'ring') && imageType !== 'poster'
    ? 'average'
    : presentation;

export const normalizeAggregateRatingSource = (
  value: unknown,
  fallback: AggregateRatingSource = DEFAULT_AGGREGATE_RATING_SOURCE,
): AggregateRatingSource => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'overall' || normalized === 'critics' || normalized === 'audience') {
    return normalized;
  }
  return fallback;
};

export const normalizeAggregateAccentMode = (
  value: unknown,
  fallback: AggregateAccentMode = DEFAULT_AGGREGATE_ACCENT_MODE,
): AggregateAccentMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'source' ||
    normalized === 'genre' ||
    normalized === 'custom' ||
    normalized === 'dynamic'
  ) {
    return normalized;
  }
  return fallback;
};

const AGGREGATE_DYNAMIC_STOP_TOKEN_PATTERN = /^(-?\d+(?:\.\d+)?)\s*:\s*(#[0-9a-fA-F]{6})$/;

const parseAggregateDynamicStopsInternal = (value: unknown): AggregateDynamicStop[] => {
  if (typeof value !== 'string') return [];
  const tokens = value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  const stopMap = new Map<number, string>();
  for (const token of tokens) {
    const match = token.match(AGGREGATE_DYNAMIC_STOP_TOKEN_PATTERN);
    if (!match) continue;
    const numericThreshold = Number.parseFloat(match[1]);
    if (!Number.isFinite(numericThreshold)) continue;
    const threshold = Math.max(0, Math.min(100, Math.round(numericThreshold)));
    const color = match[2].toLowerCase();
    stopMap.set(threshold, color);
  }
  return [...stopMap.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([threshold, color]) => ({ threshold, color }));
};

const stringifyAggregateDynamicStops = (stops: AggregateDynamicStop[]) =>
  stops.map((stop) => `${stop.threshold}:${stop.color}`).join(',');

export const normalizeAggregateDynamicStops = (
  value: unknown,
  fallback: string = DEFAULT_AGGREGATE_DYNAMIC_STOPS,
) => {
  const parsed = parseAggregateDynamicStopsInternal(value);
  if (parsed.length > 0) {
    return stringifyAggregateDynamicStops(parsed);
  }
  const fallbackParsed = parseAggregateDynamicStopsInternal(fallback);
  if (fallbackParsed.length > 0) {
    return stringifyAggregateDynamicStops(fallbackParsed);
  }
  return DEFAULT_AGGREGATE_DYNAMIC_STOPS;
};

export const parseAggregateDynamicStops = (
  value: unknown,
  fallback: string = DEFAULT_AGGREGATE_DYNAMIC_STOPS,
): AggregateDynamicStop[] =>
  parseAggregateDynamicStopsInternal(
    normalizeAggregateDynamicStops(value, fallback),
  );

export const resolveAggregateDynamicAccentColor = (
  scorePercent: number,
  stops: AggregateDynamicStop[],
) => {
  if (!Array.isArray(stops) || stops.length === 0) {
    return '#22c55e';
  }
  const normalizedScore = Number.isFinite(scorePercent)
    ? Math.max(0, Math.min(100, scorePercent))
    : 0;
  let resolvedColor = stops[0].color;
  for (const stop of stops) {
    if (normalizedScore >= stop.threshold) {
      resolvedColor = stop.color;
      continue;
    }
    break;
  }
  return resolvedColor;
};

export const normalizeAggregateAccentBarOffset = (
  value: unknown,
  fallback = DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(
    MIN_AGGREGATE_ACCENT_BAR_OFFSET,
    Math.min(MAX_AGGREGATE_ACCENT_BAR_OFFSET, Math.round(numericValue)),
  );
};

export const usesAggregateRatingPresentation = (presentation: RatingPresentation) =>
  presentation === 'minimal' ||
  presentation === 'average' ||
  presentation === 'dual' ||
  presentation === 'dual-minimal' ||
  presentation === 'editorial';

export const usesAggregateRatingSource = (presentation: RatingPresentation) =>
  presentation === 'minimal' || presentation === 'average' || presentation === 'editorial';

export const usesDualAggregateRatingPresentation = (presentation: RatingPresentation) =>
  presentation === 'dual' || presentation === 'dual-minimal';

export const usesAggregateAccentBar = (presentation: RatingPresentation) =>
  presentation === 'minimal' ||
  presentation === 'average' ||
  presentation === 'dual' ||
  presentation === 'dual-minimal';

export const usesCompactRingPresentation = (presentation: RatingPresentation) =>
  presentation === 'ring';

export const preservesSelectedRatingLayout = (presentation: RatingPresentation) =>
  presentation !== 'blockbuster' && presentation !== 'editorial' && presentation !== 'ring';

export const resolvePosterRatingLayoutForPresentation = (
  presentation: RatingPresentation,
  layout: PosterRatingLayout,
): PosterRatingLayout =>
  presentation === 'ring' ? layout : preservesSelectedRatingLayout(presentation) ? layout : 'left-right';

export const resolveBackdropRatingLayoutForPresentation = (
  presentation: RatingPresentation,
  layout: BackdropRatingLayout,
): BackdropRatingLayout => (preservesSelectedRatingLayout(presentation) ? layout : 'right-vertical');

export const resolvePosterRatingsMaxPerSideForPresentation = (
  presentation: RatingPresentation,
  maxPerSide: number | null,
) => (presentation === 'ring' || preservesSelectedRatingLayout(presentation) ? maxPerSide : null);

export const resolveLogoRatingsMaxForPresentation = (
  presentation: RatingPresentation,
  maxRatings: number | null,
) => (preservesSelectedRatingLayout(presentation) ? maxRatings : null);

export const getAggregateRatingSourceLabel = (source: AggregateRatingSource) => {
  if (source === 'critics') return 'Critics';
  if (source === 'audience') return 'Audience';
  return 'Overall';
};

export const getAggregateRatingSourceShortLabel = (source: AggregateRatingSource) => {
  if (source === 'critics') return 'CRT';
  if (source === 'audience') return 'AUD';
  return 'AVG';
};

export const selectAggregateRatingProviders = (
  source: AggregateRatingSource,
  providers: RatingPreference[],
) => {
  if (source === 'overall') {
    return [...providers];
  }

  const filter =
    source === 'critics' ? CRITICS_RATING_PROVIDERS : AUDIENCE_RATING_PROVIDERS;
  const preferred = providers.filter((provider) => filter.has(provider));

  if (preferred.length > 0) {
    return preferred;
  }

  return [...providers];
};

export const hasAggregateRatingProvidersForSource = (
  source: AggregateRatingSource,
  providers: RatingPreference[],
) => {
  if (source === 'overall') {
    return providers.length > 0;
  }

  const filter =
    source === 'critics' ? CRITICS_RATING_PROVIDERS : AUDIENCE_RATING_PROVIDERS;
  return providers.some((provider) => filter.has(provider));
};
