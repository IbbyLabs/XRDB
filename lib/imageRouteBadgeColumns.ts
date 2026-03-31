import { type BackdropRatingLayout } from './backdropLayoutOptions.ts';
import { getBadgeHeightFromMetrics, DEFAULT_BADGE_MIN_METRICS, type BadgeLayoutMetrics, type BadgeMetricInput } from './imageRouteBadgeMetrics.ts';
import { getPosterRatingLayoutMaxBadges, type PosterRatingLayout } from './posterLayoutOptions.ts';
import { DEFAULT_RATING_STYLE, type RatingStyle } from './ratingAppearance.ts';
import { resolveSideRatingOffsetFraction, type SideRatingPosition } from './sideRatingPosition.ts';

export type PosterBadgeGroups<T> = {
  topBadges: T[];
  bottomBadges: T[];
  leftBadges: T[];
  rightBadges: T[];
};

export type BackdropBadgeRegion = {
  left: number;
  width: number;
};

export const measureBadgeColumnHeight = (
  columnBadges: BadgeMetricInput[],
  metrics: BadgeLayoutMetrics,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  if (columnBadges.length === 0) return 0;
  const badgeHeight = getBadgeHeightFromMetrics(metrics, ratingStyle);
  return columnBadges.length * badgeHeight + Math.max(0, columnBadges.length - 1) * metrics.gap;
};

export const resolveVerticalBadgeColumnStartY = ({
  outputHeight,
  columnHeight,
  topOffset,
  bottomOffset,
  position,
  customOffset,
  minTop = topOffset,
}: {
  outputHeight: number;
  columnHeight: number;
  topOffset: number;
  bottomOffset: number;
  position: SideRatingPosition;
  customOffset: number;
  minTop?: number;
}) => {
  const baseTop = Math.max(topOffset, minTop);
  if (columnHeight <= 0) return baseTop;
  const maxStartY = Math.max(baseTop, outputHeight - bottomOffset - columnHeight);
  if (maxStartY <= baseTop) return baseTop;
  const fraction = resolveSideRatingOffsetFraction(position, customOffset);
  return Math.round(baseTop + (maxStartY - baseTop) * fraction);
};

export const getMaxBadgeColumnCount = (
  outputHeight: number,
  metrics: BadgeLayoutMetrics,
  topOffset: number,
  bottomOffset: number,
  reservedTopRows = 0,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  const badgeHeight = getBadgeHeightFromMetrics(metrics, ratingStyle);
  const step = badgeHeight + metrics.gap;
  const reservedTopHeight = reservedTopRows > 0 ? reservedTopRows * step : 0;
  const availableHeight = Math.max(0, outputHeight - topOffset - bottomOffset - reservedTopHeight);
  if (badgeHeight <= 0 || step <= 0) return 1;
  return Math.max(1, Math.floor((availableHeight + metrics.gap) / step));
};

export const fitBadgeMetricsToHeight = <T extends BadgeMetricInput>(
  columns: T[][],
  outputHeight: number,
  initialMetrics: BadgeLayoutMetrics,
  topOffset: number,
  bottomOffset: number,
  minMetrics: BadgeLayoutMetrics = DEFAULT_BADGE_MIN_METRICS,
  reservedTopRows = 0,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  const metrics: BadgeLayoutMetrics = { ...initialMetrics };
  const getMaxColumnHeight = () => {
    const badgeHeight = getBadgeHeightFromMetrics(metrics, ratingStyle);
    const reservedTopHeight =
      reservedTopRows > 0 ? reservedTopRows * (badgeHeight + metrics.gap) : 0;
    return Math.max(0, outputHeight - topOffset - bottomOffset - reservedTopHeight);
  };

  const measureTallestColumn = () =>
    columns.reduce(
      (maxHeight, column) => Math.max(maxHeight, measureBadgeColumnHeight(column, metrics, ratingStyle)),
      0
    );

  let tallestColumn = measureTallestColumn();
  let attempts = 0;

  while (tallestColumn > getMaxColumnHeight() && attempts < 12) {
    const maxColumnHeight = getMaxColumnHeight();
    const ratio = Math.max(0.84, Math.min(0.96, maxColumnHeight / tallestColumn));
    metrics.iconSize = Math.max(minMetrics.iconSize, Math.floor(metrics.iconSize * ratio));
    metrics.fontSize = Math.max(minMetrics.fontSize, Math.floor(metrics.fontSize * ratio));
    metrics.paddingX = Math.max(minMetrics.paddingX, Math.floor(metrics.paddingX * ratio));
    metrics.paddingY = Math.max(minMetrics.paddingY, Math.floor(metrics.paddingY * ratio));
    metrics.gap = Math.max(minMetrics.gap, Math.floor(metrics.gap * ratio));

    if (tallestColumn > getMaxColumnHeight()) {
      if (metrics.paddingY > minMetrics.paddingY) metrics.paddingY -= 1;
      else if (metrics.gap > minMetrics.gap) metrics.gap -= 1;
      else if (metrics.fontSize > minMetrics.fontSize) metrics.fontSize -= 1;
      else if (metrics.iconSize > minMetrics.iconSize) metrics.iconSize -= 1;
      else if (metrics.paddingX > minMetrics.paddingX) metrics.paddingX -= 1;
      else break;
    }

    tallestColumn = measureTallestColumn();
    attempts += 1;
  }

  return metrics;
};

export const splitPosterBadgesByLayout = <T>(
  badges: T[],
  layout: PosterRatingLayout,
  maxPerColumn?: number
): PosterBadgeGroups<T> => {
  const totalLimit = getPosterRatingLayoutMaxBadges(layout, maxPerColumn);
  const limitedBadges = typeof totalLimit === 'number' ? badges.slice(0, totalLimit) : badges;
  const columnLimit = typeof maxPerColumn === 'number' ? Math.max(1, maxPerColumn) : null;
  if (layout === 'top') {
    return { topBadges: limitedBadges, bottomBadges: [], leftBadges: [], rightBadges: [] };
  }
  if (layout === 'bottom') {
    return { topBadges: [], bottomBadges: limitedBadges, leftBadges: [], rightBadges: [] };
  }
  if (layout === 'left') {
    return {
      topBadges: [],
      bottomBadges: [],
      leftBadges: columnLimit ? limitedBadges.slice(0, columnLimit) : limitedBadges,
      rightBadges: [],
    };
  }
  if (layout === 'right') {
    return {
      topBadges: [],
      bottomBadges: [],
      leftBadges: [],
      rightBadges: columnLimit ? limitedBadges.slice(0, columnLimit) : limitedBadges,
    };
  }

  if (layout === 'left-right') {
    if (limitedBadges.length % 2 === 1) {
      const topBadges = limitedBadges.slice(0, 1);
      const sideBadges = limitedBadges.slice(1);
      const columnSize = Math.ceil(sideBadges.length / 2);
      return {
        topBadges,
        bottomBadges: [],
        leftBadges: sideBadges.slice(0, columnSize),
        rightBadges: sideBadges.slice(columnSize, columnSize * 2),
      };
    }

    const columnSize = Math.ceil(limitedBadges.length / 2);
    return {
      topBadges: [],
      bottomBadges: [],
      leftBadges: limitedBadges.slice(0, columnSize),
      rightBadges: limitedBadges.slice(columnSize, columnSize * 2),
    };
  }

  const topRowCount = Math.ceil(limitedBadges.length / 2);
  const primary = limitedBadges.slice(0, topRowCount);
  const secondary = limitedBadges.slice(topRowCount);
  return { topBadges: primary, bottomBadges: secondary, leftBadges: [], rightBadges: [] };
};

export const getBackdropBadgeRegion = (
  outputWidth: number,
  layout: BackdropRatingLayout
): BackdropBadgeRegion => {
  if (layout !== 'right') {
    return { left: 0, width: outputWidth };
  }

  const width = Math.min(outputWidth - 24, Math.max(280, Math.floor(outputWidth * 0.46)));
  return {
    left: Math.max(12, outputWidth - width - 12),
    width,
  };
};
