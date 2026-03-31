import type { BackdropRatingLayout } from './backdropLayoutOptions.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
import type { RatingPreference } from './ratingProviderCatalog.ts';

export type RatingPresentation =
  | 'standard'
  | 'minimal'
  | 'average'
  | 'dual'
  | 'dual-minimal'
  | 'editorial'
  | 'blockbuster'
  | 'none';
export type AggregateRatingSource = 'overall' | 'critics' | 'audience';
export type AggregateAccentMode = 'source' | 'genre' | 'custom';

export const DEFAULT_RATING_PRESENTATION: RatingPresentation = 'standard';
export const DEFAULT_AGGREGATE_RATING_SOURCE: AggregateRatingSource = 'overall';
export const DEFAULT_AGGREGATE_ACCENT_MODE: AggregateAccentMode = 'source';
export const DEFAULT_AGGREGATE_ACCENT_COLOR = '#a78bfa';
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
];

const CRITICS_RATING_PROVIDERS = new Set<RatingPreference>([
  'mdblist',
  'tomatoes',
  'metacritic',
  'rogerebert',
]);

const AUDIENCE_RATING_PROVIDERS = new Set<RatingPreference>([
  'tmdb',
  'imdb',
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
  presentation === 'editorial' && imageType !== 'poster' ? 'average' : presentation;

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
  if (normalized === 'source' || normalized === 'genre' || normalized === 'custom') {
    return normalized;
  }
  return fallback;
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

export const preservesSelectedRatingLayout = (presentation: RatingPresentation) =>
  presentation !== 'blockbuster' && presentation !== 'editorial';

export const resolvePosterRatingLayoutForPresentation = (
  presentation: RatingPresentation,
  layout: PosterRatingLayout,
): PosterRatingLayout => (preservesSelectedRatingLayout(presentation) ? layout : 'left-right');

export const resolveBackdropRatingLayoutForPresentation = (
  presentation: RatingPresentation,
  layout: BackdropRatingLayout,
): BackdropRatingLayout => (preservesSelectedRatingLayout(presentation) ? layout : 'right-vertical');

export const resolvePosterRatingsMaxPerSideForPresentation = (
  presentation: RatingPresentation,
  maxPerSide: number | null,
) => (preservesSelectedRatingLayout(presentation) ? maxPerSide : null);

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
