const backdropLayoutCatalog = [
  ['center', 'Center'],
  ['right', 'Right'],
  ['right-vertical', 'Right Vertical'],
] as const;

export type BackdropRatingLayout = (typeof backdropLayoutCatalog)[number][0];

export const BACKDROP_RATING_LAYOUT_OPTIONS = backdropLayoutCatalog.map(([id, label]) => ({ id, label }));
export const DEFAULT_BACKDROP_RATING_LAYOUT: BackdropRatingLayout = 'center';

const backdropLayoutIds = new Set<BackdropRatingLayout>(
  backdropLayoutCatalog.map(([id]) => id),
);
const backdropLayoutAliases = new Map<string, BackdropRatingLayout>([
  ['right vertical', 'right-vertical'],
]);

const normalizeBackdropLayoutToken = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');

export const normalizeBackdropRatingLayout = (value?: string | null): BackdropRatingLayout => {
  const token = normalizeBackdropLayoutToken(value);
  const candidate = backdropLayoutAliases.get(token) ?? token;
  return backdropLayoutIds.has(candidate as BackdropRatingLayout)
    ? (candidate as BackdropRatingLayout)
    : DEFAULT_BACKDROP_RATING_LAYOUT;
};

export const isVerticalBackdropRatingLayout = (layout: BackdropRatingLayout) => layout === 'right-vertical';
