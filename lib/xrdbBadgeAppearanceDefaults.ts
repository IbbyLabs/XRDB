import type { RatingPreference } from './ratingProviderCatalog.ts';
import { DEFAULT_PROVIDER_ICON_SCALE_PERCENT } from './badgeCustomization.ts';

const XRDB_LOGO_BADGE_ICON_SCALE_BY_PROVIDER: Partial<Record<RatingPreference, number>> = {
  tmdb: 108,
  mdblist: 108,
  imdb: 106,
  simkl: 88,
};

export const resolveXrdbProviderIconScalePercent = (provider: RatingPreference) =>
  XRDB_LOGO_BADGE_ICON_SCALE_BY_PROVIDER[provider] ?? DEFAULT_PROVIDER_ICON_SCALE_PERCENT;
