export const SIDE_RATING_POSITION_OPTIONS = [
  { id: 'top', label: 'Top' },
  { id: 'middle', label: 'Middle' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'custom', label: 'Custom' },
] as const;

export type SideRatingPosition = (typeof SIDE_RATING_POSITION_OPTIONS)[number]['id'];

export const DEFAULT_SIDE_RATING_POSITION: SideRatingPosition = 'top';
export const DEFAULT_SIDE_RATING_OFFSET = 50;

const SIDE_RATING_POSITION_SET = new Set<SideRatingPosition>(
  SIDE_RATING_POSITION_OPTIONS.map((option) => option.id)
);

const SIDE_RATING_POSITION_ALIASES: Record<string, SideRatingPosition> = {
  center: 'middle',
};

export const normalizeSideRatingPosition = (
  value: unknown,
  fallback: SideRatingPosition = DEFAULT_SIDE_RATING_POSITION
): SideRatingPosition => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const canonical = SIDE_RATING_POSITION_ALIASES[normalized] || normalized;
  return SIDE_RATING_POSITION_SET.has(canonical as SideRatingPosition)
    ? (canonical as SideRatingPosition)
    : fallback;
};

export const normalizeSideRatingOffset = (
  value: unknown,
  fallback = DEFAULT_SIDE_RATING_OFFSET
): number => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
};

export const resolveSideRatingOffsetFraction = (
  position: SideRatingPosition,
  customOffset = DEFAULT_SIDE_RATING_OFFSET
) => {
  if (position === 'middle') return 0.5;
  if (position === 'bottom') return 1;
  if (position === 'custom') return normalizeSideRatingOffset(customOffset) / 100;
  return 0;
};
