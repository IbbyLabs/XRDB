import {
  RATING_PROVIDER_OPTIONS,
  normalizeRatingPreference,
  type RatingPreference,
} from './ratingProviderCatalog.ts';

export type PosterCompactRingSource = RatingPreference | 'highest';

export const DEFAULT_POSTER_COMPACT_RING_VALUE_SOURCE: PosterCompactRingSource = 'highest';
export const DEFAULT_POSTER_COMPACT_RING_PROGRESS_SOURCE: PosterCompactRingSource = 'tmdb';

export const POSTER_COMPACT_RING_SOURCE_OPTIONS: Array<{
  id: PosterCompactRingSource;
  label: string;
}> = [
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
  if (['highest', 'best', 'top', 'auto'].includes(normalized)) {
    return 'highest';
  }
  return normalizeRatingPreference(normalized) ?? fallback;
};
