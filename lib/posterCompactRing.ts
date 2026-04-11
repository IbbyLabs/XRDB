import {
  RATING_PROVIDER_OPTIONS,
  normalizeRatingPreference,
  type RatingPreference,
} from './ratingProviderCatalog.ts';
import { type AggregateRatingSource } from './ratingPresentation.ts';

export type PosterCompactRingPrioritySource = 'priority-critics' | 'priority-audience';

export type PosterCompactRingSource =
  | RatingPreference
  | AggregateRatingSource
  | PosterCompactRingPrioritySource
  | 'highest';

export const DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE: PosterCompactRingSource = 'highest';
export const DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE: PosterCompactRingSource = 'tmdb';
export const MAX_POSTER_COMPACT_RING_PRIORITY_LENGTH = 3;
export const DEFAULT_POSTER_COMPACT_RING_CRITICS_PRIORITY: RatingPreference[] = [
  'tomatoes',
  'metacritic',
  'imdb',
];
export const DEFAULT_POSTER_COMPACT_RING_AUDIENCE_PRIORITY: RatingPreference[] = [
  'tomatoesaudience',
  'imdb',
  'tmdb',
];

export const POSTER_COMPACT_RING_SOURCE_OPTIONS: Array<{
  id: PosterCompactRingSource;
  label: string;
}> = [
  { id: 'overall', label: 'Overall Average' },
  { id: 'critics', label: 'Critics Average' },
  { id: 'audience', label: 'Audience Average' },
  { id: 'priority-critics', label: 'Critics Priority' },
  { id: 'priority-audience', label: 'Audience Priority' },
  { id: 'highest', label: 'Highest Available' },
  ...RATING_PROVIDER_OPTIONS.map((provider) => ({
    id: provider.id,
    label: provider.label,
  })),
];

export const normalizePosterCompactRingSource = (
  value: unknown,
  fallback: PosterCompactRingSource = DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE,
): PosterCompactRingSource => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return fallback;
  if (normalized === 'overall' || normalized === 'critics' || normalized === 'audience') {
    return normalized;
  }
  if (
    normalized === 'priority-critics' ||
    normalized === 'priority_critics' ||
    normalized === 'prioritycritics' ||
    normalized === 'critics-priority' ||
    normalized === 'criticspriority'
  ) {
    return 'priority-critics';
  }
  if (
    normalized === 'priority-audience' ||
    normalized === 'priority_audience' ||
    normalized === 'priorityaudience' ||
    normalized === 'audience-priority' ||
    normalized === 'audiencepriority'
  ) {
    return 'priority-audience';
  }
  if (['highest', 'best', 'top', 'auto'].includes(normalized)) {
    return 'highest';
  }
  return normalizeRatingPreference(normalized) ?? fallback;
};

const normalizeCompactRingPriorityListInput = (value: unknown) => {
  const rawValues =
    typeof value === 'string'
      ? value.split(',')
      : Array.isArray(value)
        ? value.map((entry) => String(entry))
        : [];
  const seen = new Set<RatingPreference>();
  const normalized: RatingPreference[] = [];
  for (const raw of rawValues) {
    const provider = normalizeRatingPreference(raw);
    if (!provider || seen.has(provider)) continue;
    seen.add(provider);
    normalized.push(provider);
    if (normalized.length >= MAX_POSTER_COMPACT_RING_PRIORITY_LENGTH) {
      break;
    }
  }
  return normalized;
};

export const normalizePosterCompactRingPriorityList = (
  value: unknown,
  fallback: RatingPreference[],
) => {
  const parsed = normalizeCompactRingPriorityListInput(value);
  if (parsed.length > 0) {
    return parsed;
  }
  return normalizeCompactRingPriorityListInput(fallback);
};

export const stringifyPosterCompactRingPriorityList = (value: RatingPreference[]) =>
  normalizeCompactRingPriorityListInput(value).join(',');
