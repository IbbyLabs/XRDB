export type RatingStyle = 'glass' | 'square' | 'plain' | 'stacked';
export type QualityBadgeStyle = 'glass' | 'square' | 'plain' | 'media' | 'silver';

export const DEFAULT_RATING_STYLE: RatingStyle = 'glass';
export const DEFAULT_QUALITY_BADGES_STYLE: QualityBadgeStyle = 'glass';

const ratingStyleCatalog = [
  ['glass', 'Pill Glass'],
  ['square', 'Square Dark'],
  ['plain', 'No Background'],
  ['stacked', 'Stacked'],
] as const;

const qualityBadgeStyleCatalog = [
  ['glass', 'Pill Glass'],
  ['square', 'Square Dark'],
  ['plain', 'No Background'],
  ['media', 'Media Marks'],
  ['silver', 'Silver Marks'],
] as const;

export const RATING_STYLE_OPTIONS: Array<{ id: RatingStyle; label: string }> =
  ratingStyleCatalog.map(([id, label]) => ({ id, label }));
export const QUALITY_BADGE_STYLE_OPTIONS: Array<{ id: QualityBadgeStyle; label: string }> =
  qualityBadgeStyleCatalog.map(([id, label]) => ({ id, label }));

const ratingStyleIds = new Set<RatingStyle>(ratingStyleCatalog.map(([id]) => id));
const qualityBadgeStyleIds = new Set<QualityBadgeStyle>(qualityBadgeStyleCatalog.map(([id]) => id));

const normalizeStyleToken = (value?: string | null) => String(value ?? '').trim().toLowerCase();

export const normalizeRatingStyle = (value?: string | null): RatingStyle => {
  const token = normalizeStyleToken(value);
  return ratingStyleIds.has(token as RatingStyle) ? (token as RatingStyle) : DEFAULT_RATING_STYLE;
};

export const normalizeQualityBadgeStyle = (value?: string | null): QualityBadgeStyle => {
  const token = normalizeStyleToken(value);
  return qualityBadgeStyleIds.has(token as QualityBadgeStyle)
    ? (token as QualityBadgeStyle)
    : DEFAULT_QUALITY_BADGES_STYLE;
};
