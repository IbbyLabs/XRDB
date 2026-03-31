const posterLayoutCatalog = [
  { id: 'top', label: 'Top', vertical: false, single: true, extraBadges: 0 },
  { id: 'bottom', label: 'Bottom', vertical: false, single: true, extraBadges: 0 },
  { id: 'left', label: 'Left Vertical', vertical: true, single: true, extraBadges: 0 },
  { id: 'right', label: 'Right Vertical', vertical: true, single: true, extraBadges: 0 },
  { id: 'top-bottom', label: 'Top & Bottom', vertical: false, single: false, extraBadges: 0 },
  { id: 'left-right', label: 'Left & Right Vertical', vertical: true, single: false, extraBadges: 1 },
] as const;

export type PosterRatingLayout = (typeof posterLayoutCatalog)[number]['id'];

export const POSTER_RATING_LAYOUT_OPTIONS = posterLayoutCatalog.map(({ id, label }) => ({ id, label }));
export const DEFAULT_POSTER_RATING_LAYOUT: PosterRatingLayout = 'top-bottom';
export const POSTER_RATINGS_MAX_PER_SIDE_MIN = 1;
export const POSTER_RATINGS_MAX_PER_SIDE_MAX = 20;
export const DEFAULT_POSTER_RATINGS_MAX_PER_SIDE: number | null = null;

const posterLayoutLookup = new Map<PosterRatingLayout, (typeof posterLayoutCatalog)[number]>(
  posterLayoutCatalog.map((entry) => [entry.id, entry]),
);
const posterLayoutAliases = new Map<string, PosterRatingLayout>([
  ['top bottom', 'top-bottom'],
  ['left right', 'left-right'],
]);

const normalizePosterLayoutToken = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');

export const normalizePosterRatingLayout = (value?: string | null): PosterRatingLayout => {
  const token = normalizePosterLayoutToken(value);
  const candidate = posterLayoutAliases.get(token) ?? token;
  return posterLayoutLookup.has(candidate as PosterRatingLayout)
    ? (candidate as PosterRatingLayout)
    : DEFAULT_POSTER_RATING_LAYOUT;
};

export const normalizePosterRatingsMaxPerSide = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return DEFAULT_POSTER_RATINGS_MAX_PER_SIDE;
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return DEFAULT_POSTER_RATINGS_MAX_PER_SIDE;
  const normalized = Math.trunc(numericValue);
  if (normalized < POSTER_RATINGS_MAX_PER_SIDE_MIN) return DEFAULT_POSTER_RATINGS_MAX_PER_SIDE;
  return normalized;
};

export const isSinglePosterRatingLayout = (layout: PosterRatingLayout) =>
  posterLayoutLookup.get(layout)?.single ?? false;

export const isVerticalPosterRatingLayout = (layout: PosterRatingLayout) =>
  posterLayoutLookup.get(layout)?.vertical ?? false;

export const getPosterRatingLayoutLimit = (layout: PosterRatingLayout): number | null => {
  return null;
};

export const getPosterRatingLayoutMaxBadges = (
  layout: PosterRatingLayout,
  maxPerSide?: number | null
): number | null => {
  const limit = getPosterRatingLayoutLimit(layout);
  if (limit !== null) return limit;
  const layoutEntry = posterLayoutLookup.get(layout);
  if (!layoutEntry) return null;

  const parsedMaxPerSide = typeof maxPerSide === 'number' ? maxPerSide : Number.NaN;
  if (!Number.isFinite(parsedMaxPerSide)) return null;
  const normalizedMaxPerSide = Math.max(1, Math.trunc(parsedMaxPerSide));
  return layoutEntry.extraBadges > 0
    ? normalizedMaxPerSide * 2 + layoutEntry.extraBadges
    : normalizedMaxPerSide;
};

export const describePosterRatingLayoutLimit = (
  layout: PosterRatingLayout,
  maxPerSide?: number | null
) => {
  const normalizedMaxPerSide = normalizePosterRatingsMaxPerSide(maxPerSide);
  if (normalizedMaxPerSide === null) {
    if (layout === 'top-bottom') return 'all that fit across the top and bottom rows';
    return 'all that fit inside the poster';
  }
  if (layout === 'left-right') return `up to ${normalizedMaxPerSide} per side, plus 1 top-center`;
  return `up to ${normalizedMaxPerSide} on the selected side`;
};
