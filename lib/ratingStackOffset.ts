import type { RatingStyle } from './ratingAppearance.ts';

export const DEFAULT_RATING_STACK_OFFSET_PX = 0;
export const MIN_RATING_STACK_OFFSET_PX = -320;
export const MAX_RATING_STACK_OFFSET_PX = 320;

export const normalizeRatingStackOffsetPx = (
  value: unknown,
  fallback = DEFAULT_RATING_STACK_OFFSET_PX,
) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(
    MIN_RATING_STACK_OFFSET_PX,
    Math.min(MAX_RATING_STACK_OFFSET_PX, Math.round(numericValue)),
  );
};

export const resolveStyleRatingStackOffset = ({
  ratingStyle,
  ratingXOffsetPillGlass,
  ratingYOffsetPillGlass,
  ratingXOffsetSquare,
  ratingYOffsetSquare,
}: {
  ratingStyle: RatingStyle;
  ratingXOffsetPillGlass: number;
  ratingYOffsetPillGlass: number;
  ratingXOffsetSquare: number;
  ratingYOffsetSquare: number;
}) => {
  if (ratingStyle === 'glass') {
    return {
      x: ratingXOffsetPillGlass,
      y: ratingYOffsetPillGlass,
    };
  }
  if (ratingStyle === 'square') {
    return {
      x: ratingXOffsetSquare,
      y: ratingYOffsetSquare,
    };
  }
  return {
    x: DEFAULT_RATING_STACK_OFFSET_PX,
    y: DEFAULT_RATING_STACK_OFFSET_PX,
  };
};
