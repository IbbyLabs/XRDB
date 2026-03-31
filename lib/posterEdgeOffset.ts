export const DEFAULT_POSTER_EDGE_OFFSET = 0;
export const MIN_POSTER_EDGE_OFFSET = 0;
export const MAX_POSTER_EDGE_OFFSET = 80;
export const POSTER_EDGE_INSET_BASE = 12;

export const normalizePosterEdgeOffset = (
  value: unknown,
  fallback = DEFAULT_POSTER_EDGE_OFFSET
): number => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(
    MIN_POSTER_EDGE_OFFSET,
    Math.min(MAX_POSTER_EDGE_OFFSET, Math.round(numericValue))
  );
};
