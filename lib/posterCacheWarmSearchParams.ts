import {
  MDBLIST_BACKED_RATING_PROVIDERS,
  parseRatingPreferencesAllowEmpty,
  stringifyRatingPreferencesAllowEmpty,
  type RatingPreference,
} from './ratingProviderCatalog.ts';
import { SENSITIVE_CREDENTIAL_QUERY_PARAM_NAMES, stripSensitiveCredentialSearchParams } from './credentialSearchParams.ts';

const STRIP_WARM_SEARCH_PARAMS = new Set([
  'cb',
  'config',
  'debugRatings',
  ...SENSITIVE_CREDENTIAL_QUERY_PARAM_NAMES,
]);

const DEFAULT_POSTER_WARM_RATING_PREFERENCES: RatingPreference[] = ['imdb', 'tmdb'];

const resolvePosterWarmRatings = (rawValue: string | null) => {
  if (rawValue === null) {
    return stringifyRatingPreferencesAllowEmpty(DEFAULT_POSTER_WARM_RATING_PREFERENCES);
  }

  if (rawValue.trim() === '') {
    return '';
  }

  const safeProviders = parseRatingPreferencesAllowEmpty(rawValue).filter(
    (provider) => !MDBLIST_BACKED_RATING_PROVIDERS.has(provider),
  );

  return stringifyRatingPreferencesAllowEmpty(
    safeProviders.length > 0 ? safeProviders : DEFAULT_POSTER_WARM_RATING_PREFERENCES,
  );
};

export const buildPosterWarmSearchParams = (searchParams?: URLSearchParams) => {
  const warmSearchParams = new URLSearchParams(searchParams);
  const requestedPosterRatings = searchParams?.get('posterRatings') ?? searchParams?.get('ratings') ?? null;

  stripSensitiveCredentialSearchParams(warmSearchParams);
  for (const key of STRIP_WARM_SEARCH_PARAMS) {
    warmSearchParams.delete(key);
  }

  warmSearchParams.delete('ratings');
  warmSearchParams.set('posterRatings', resolvePosterWarmRatings(requestedPosterRatings));

  return warmSearchParams;
};