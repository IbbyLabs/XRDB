export type RatingStyle = 'glass' | 'square' | 'plain' | 'stacked' | 'tile';
export type QualityBadgeStyle = 'glass' | 'square' | 'plain' | 'media' | 'silver' | 'tile' | 'community-badge';
export type IconShape = 'original' | 'circle' | 'squircle' | 'rounded';

export const DEFAULT_RATING_STYLE: RatingStyle = 'glass';
export const DEFAULT_QUALITY_BADGES_STYLE: QualityBadgeStyle = 'glass';
export const DEFAULT_ICON_SHAPE: IconShape = 'original';

const ratingStyleCatalog = [
  ['glass', 'Pill Glass'],
  ['square', 'Square Dark'],
  ['plain', 'No Background'],
  ['stacked', 'Stacked'],
  ['tile', 'Tile Dark'],
] as const;

const qualityBadgeStyleCatalog = [
  ['glass', 'Pill Glass'],
  ['square', 'Square Dark'],
  ['plain', 'No Background'],
  ['media', 'Media Marks'],
  ['silver', 'Silver Marks'],
  ['tile', 'Tile Dark'],
  ['community-badge', 'Community Badges'],
] as const;

const iconShapeCatalog = [
  ['original', 'Original'],
  ['circle', 'Circle'],
  ['squircle', 'Squircle'],
  ['rounded', 'Rounded'],
] as const;

export const RATING_STYLE_OPTIONS: Array<{ id: RatingStyle; label: string }> =
  ratingStyleCatalog.map(([id, label]) => ({ id, label }));
export const QUALITY_BADGE_STYLE_OPTIONS: Array<{ id: QualityBadgeStyle; label: string }> =
  qualityBadgeStyleCatalog.map(([id, label]) => ({ id, label }));
export const ICON_SHAPE_OPTIONS: Array<{ id: IconShape; label: string }> =
  iconShapeCatalog.map(([id, label]) => ({ id, label }));

const ratingStyleIds = new Set<RatingStyle>(ratingStyleCatalog.map(([id]) => id));
const qualityBadgeStyleIds = new Set<QualityBadgeStyle>(qualityBadgeStyleCatalog.map(([id]) => id));
const iconShapeIds = new Set<IconShape>(iconShapeCatalog.map(([id]) => id));

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

export const normalizeQualityBadgeStyleOrNull = (value?: string | null): QualityBadgeStyle | null => {
  const token = normalizeStyleToken(value);
  return qualityBadgeStyleIds.has(token as QualityBadgeStyle) ? (token as QualityBadgeStyle) : null;
};

export const normalizeIconShape = (value?: string | null): IconShape => {
  const token = normalizeStyleToken(value);
  return iconShapeIds.has(token as IconShape) ? (token as IconShape) : DEFAULT_ICON_SHAPE;
};
