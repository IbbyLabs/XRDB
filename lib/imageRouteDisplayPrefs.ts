import { type GenreBadgeFamilyId } from './genreBadge.ts';
import { type PosterRatingLayout } from './posterLayoutOptions.ts';
import {
  getAggregateRatingSourceLabel,
  type AggregateRatingSource,
} from './ratingPresentation.ts';
import {
  normalizeQualityBadgeStyle,
  type QualityBadgeStyle,
} from './ratingAppearance.ts';
import type {
  LogoBackground,
  PosterQualityBadgesPosition,
  QualityBadgesSide,
} from './imageRouteConfig.ts';

const EDITORIAL_GENRE_LABEL_BY_FAMILY: Record<GenreBadgeFamilyId, string> = {
  anime: 'Anime',
  animation: 'Animation',
  horror: 'Horror',
  comedy: 'Comedy',
  romance: 'Romance',
  action: 'Action',
  scifi: 'Sci Fi',
  fantasy: 'Fantasy',
  crime: 'Crime',
  drama: 'Drama',
  documentary: 'Doc',
};

export const getEditorialEyebrowText = (
  familyId: GenreBadgeFamilyId | null,
  aggregateRatingSource: AggregateRatingSource,
) => {
  if (familyId) {
    return EDITORIAL_GENRE_LABEL_BY_FAMILY[familyId];
  }
  return getAggregateRatingSourceLabel(aggregateRatingSource);
};

export const normalizeStreamBadgesSetting = (value?: string | null) => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return 'auto';
  if (['1', 'true', 'yes', 'on', 'torrentio'].includes(normalized)) return 'on';
  if (['0', 'false', 'no', 'off', 'none'].includes(normalized)) return 'off';
  return 'auto';
};

export const normalizeQualityBadgesSide = (value?: string | null): QualityBadgesSide => {
  const normalized = (value || '').trim().toLowerCase();
  if (['right', 'r', 'end'].includes(normalized)) return 'right';
  return 'left';
};

export const normalizePosterQualityBadgesPosition = (
  value?: string | null,
): PosterQualityBadgesPosition => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto' || normalized === 'default') return 'auto';
  if (['right', 'r', 'end'].includes(normalized)) return 'right';
  if (['left', 'l', 'start'].includes(normalized)) return 'left';
  return 'auto';
};

export const resolvePosterQualityBadgePlacement = (
  layout: PosterRatingLayout,
  qualityBadgesSide: QualityBadgesSide,
  posterQualityBadgesPosition: PosterQualityBadgesPosition,
): 'top' | 'bottom' | QualityBadgesSide => {
  if (layout === 'left' || layout === 'right' || layout === 'left-right') {
    return 'bottom';
  }
  if (layout === 'top-bottom') {
    return qualityBadgesSide;
  }
  if (layout === 'top') {
    return posterQualityBadgesPosition === 'auto' ? 'bottom' : posterQualityBadgesPosition;
  }
  if (layout === 'bottom') {
    return posterQualityBadgesPosition === 'auto' ? 'top' : posterQualityBadgesPosition;
  }
  return qualityBadgesSide;
};

export const normalizeQualityBadgesStyle = (value?: string | null): QualityBadgeStyle =>
  normalizeQualityBadgeStyle(value);

export const normalizeLogoBackground = (value?: string | null): LogoBackground => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'dark' || normalized === 'solid' || normalized === 'canvas') {
    return 'dark';
  }
  return 'transparent';
};
