import type { RatingPreference } from './ratingProviderCatalog';

export type RatingValueMode = 'native' | 'normalized' | 'normalized100';

export const DEFAULT_RATING_VALUE_MODE: RatingValueMode = 'native';

export const RATING_VALUE_MODE_OPTIONS: Array<{
  id: RatingValueMode;
  label: string;
  description: string;
}> = [
  {
    id: 'native',
    label: 'Provider Default',
    description: 'Keep every source on its own native value, so each logo keeps its own score without forcing a shared scale.',
  },
  {
    id: 'normalized',
    label: 'Normalised to Ten',
    description: 'Convert every source to a ten point value so different providers can be compared directly.',
  },
  {
    id: 'normalized100',
    label: 'Normalised to 100',
    description: 'Convert every source to a rounded whole number out of 100 so badges stay more compact.',
  },
];

const PERCENTAGE_RATING_PROVIDERS = new Set<RatingPreference>([
  'tomatoes',
  'tomatoesaudience',
  'anilist',
  'kitsu',
]);

const NATIVE_SCALE_SUFFIX_RATING_PROVIDERS: Partial<Record<RatingPreference, string>> = {
  mdblist: '/100',
  metacritic: '/100',
  tmdb: '/10',
  imdb: '/10',
  trakt: '/10',
  simkl: '/10',
  metacriticuser: '/10',
  letterboxd: '/5',
  myanimelist: '/10',
  rogerebert: '/4',
};

export const normalizeRatingValueMode = (
  value: unknown,
  fallback: RatingValueMode = DEFAULT_RATING_VALUE_MODE,
): RatingValueMode => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'native' || normalized === 'normalized') {
    return normalized;
  }
  if (
    normalized === 'normalized100' ||
    normalized === 'normalized-100' ||
    normalized === 'normalizedhundred' ||
    normalized === 'normalized-hundred'
  ) {
    return 'normalized100';
  }
  return fallback;
};

export const parseNumericRatingValue = (value: string) => {
  const numericValue = Number(value.replace('%', '').replace(',', '.').trim());
  return Number.isNaN(numericValue) || !Number.isFinite(numericValue) ? null : numericValue;
};

export const formatRatingNumber = (value: number) => {
  const rounded = value.toFixed(1);
  return rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded;
};

export const normalizeRatingToTenPointValue = (
  provider: RatingPreference,
  baseValue: string,
): number | null => {
  if (baseValue === 'N/A') return null;

  const numericValue = parseNumericRatingValue(baseValue);
  if (numericValue === null) return null;

  if (provider === 'trakt') {
    return numericValue > 10 ? numericValue / 10 : numericValue;
  }

  if (PERCENTAGE_RATING_PROVIDERS.has(provider)) {
    return numericValue / 10;
  }

  const suffix = NATIVE_SCALE_SUFFIX_RATING_PROVIDERS[provider];
  if (suffix === '/100') return numericValue / 10;
  if (suffix === '/10') return numericValue;
  if (suffix === '/5') return numericValue * 2;
  if (suffix === '/4') return numericValue * 2.5;

  return numericValue;
};

export const normalizeRatingToHundredPointValue = (
  provider: RatingPreference,
  baseValue: string,
): number | null => {
  const normalizedTenPointValue = normalizeRatingToTenPointValue(provider, baseValue);
  if (normalizedTenPointValue === null) return null;
  return Math.max(0, Math.min(100, Math.round(normalizedTenPointValue * 10)));
};

export const formatNormalizedRatingValue = (
  normalizedTenPointValue: number,
  valueMode: RatingValueMode = 'normalized',
) => {
  if (valueMode === 'normalized100') {
    return String(Math.max(0, Math.min(100, Math.round(normalizedTenPointValue * 10))));
  }
  return formatRatingNumber(normalizedTenPointValue);
};

const formatNativeProviderValue = (
  provider: RatingPreference,
  baseValue: string,
) => {
  const numericValue = parseNumericRatingValue(baseValue);
  if (numericValue === null) return baseValue;

  if (provider === 'trakt') {
    const normalizedTraktValue = numericValue > 10 ? numericValue / 10 : numericValue;
    return formatRatingNumber(normalizedTraktValue);
  }

  if (PERCENTAGE_RATING_PROVIDERS.has(provider)) {
    return `${formatRatingNumber(numericValue)}%`;
  }

  const suffix = NATIVE_SCALE_SUFFIX_RATING_PROVIDERS[provider];
  if (suffix) {
    return formatRatingNumber(numericValue);
  }

  return formatRatingNumber(numericValue);
};

export const formatDisplayRatingValue = (
  provider: RatingPreference,
  baseValue: string,
  {
    valueMode = DEFAULT_RATING_VALUE_MODE,
  }: {
    valueMode?: RatingValueMode;
  } = {},
) => {
  if (baseValue === 'N/A') return baseValue;

  if (valueMode === 'normalized' || valueMode === 'normalized100') {
    const normalizedValue = normalizeRatingToTenPointValue(provider, baseValue);
    if (normalizedValue !== null) {
      return formatNormalizedRatingValue(normalizedValue, valueMode);
    }
    return baseValue;
  }

  return formatNativeProviderValue(provider, baseValue);
};
