import { RATING_PROVIDER_OPTIONS, type RatingPreference } from './ratingProviderCatalog.ts';

export type RatingProviderRow = {
  id: RatingPreference;
  enabled: boolean;
};

const catalogOrder = RATING_PROVIDER_OPTIONS.map(({ id }) => id);

const buildRatingRow = (id: RatingPreference, enabled: boolean): RatingProviderRow => ({
  id,
  enabled,
});

export const buildDefaultRatingRows = (): RatingProviderRow[] =>
  catalogOrder.map((id) => buildRatingRow(id, true));

export const rowsToEnabledOrdered = (rows: RatingProviderRow[]): RatingPreference[] =>
  rows.filter((row) => row.enabled).map((row) => row.id);

export const enabledOrderedToRows = (enabledOrdered: RatingPreference[]): RatingProviderRow[] => {
  const enabledSet = new Set(enabledOrdered);
  const orderedIds = [
    ...enabledOrdered,
    ...catalogOrder.filter((providerId) => !enabledSet.has(providerId)),
  ];

  return orderedIds.map((providerId) => buildRatingRow(providerId, enabledSet.has(providerId)));
};
