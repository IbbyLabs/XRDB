import { DEFAULT_BADGE_MIN_METRICS, estimateRenderedBadgeWidth, type BadgeLayoutMetrics, type BadgeMetricInput } from './imageRouteBadgeMetrics.ts';
import { DEFAULT_RATING_STYLE, type RatingStyle } from './ratingAppearance.ts';

export const measureBadgeRowWidth = (
  rowBadges: BadgeMetricInput[],
  metrics: BadgeLayoutMetrics,
  compactText = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  if (rowBadges.length === 0) return 0;
  return (
    rowBadges.reduce(
      (acc, badge) =>
        acc +
        estimateRenderedBadgeWidth(
          badge,
          metrics.fontSize,
          metrics.paddingX,
          metrics.iconSize,
          metrics.gap,
          compactText,
          ratingStyle,
        ),
      0
    ) +
    Math.max(0, rowBadges.length - 1) * metrics.gap
  );
};

export const splitBadgesAcrossRowCount = <T>(badges: T[], rowCount: number) => {
  if (badges.length === 0) return [];
  if (rowCount <= 1) return [badges];

  const rows: T[][] = [];
  let startIndex = 0;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowsLeft = rowCount - rowIndex;
    const badgesLeft = badges.length - startIndex;
    const nextRowSize = Math.ceil(badgesLeft / rowsLeft);
    rows.push(badges.slice(startIndex, startIndex + nextRowSize));
    startIndex += nextRowSize;
  }
  return rows.filter((row) => row.length > 0);
};

export const splitBadgesIntoFittingRows = <T extends BadgeMetricInput>(
  badges: T[],
  maxRowWidth: number,
  metrics: BadgeLayoutMetrics,
  compactText = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  if (badges.length === 0) return [];
  if (maxRowWidth <= 0) return badges.map((badge) => [badge]);

  for (let rowCount = 1; rowCount <= badges.length; rowCount += 1) {
    const rows = splitBadgesAcrossRowCount(badges, rowCount);
    if (rows.every((row) => measureBadgeRowWidth(row, metrics, compactText, ratingStyle) <= maxRowWidth)) {
      return rows;
    }
  }

  return badges.map((badge) => [badge]);
};

export const fitBadgeMetricsToWidth = <T extends BadgeMetricInput>(
  rows: T[][],
  outputWidth: number,
  initialMetrics: BadgeLayoutMetrics,
  minMetrics: BadgeLayoutMetrics = DEFAULT_BADGE_MIN_METRICS,
  compactText = false,
  preserveContent = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  const maxRowWidth = Math.max(0, outputWidth - 24);
  const metrics: BadgeLayoutMetrics = { ...initialMetrics };

  const measureWidestRow = () =>
    rows.reduce(
      (maxWidth, row) => Math.max(maxWidth, measureBadgeRowWidth(row, metrics, compactText, ratingStyle)),
      0,
    );

  let widestRow = measureWidestRow();
  let attempts = 0;

  while (widestRow > maxRowWidth && attempts < 20) {
    const ratio = Math.max(0.84, Math.min(0.96, maxRowWidth / widestRow));
    if (preserveContent) {
      const chromeRatio = Math.max(0.68, ratio * ratio);
      const verticalRatio = Math.max(0.76, ratio * ratio);
      const iconRatio = Math.max(0.88, Math.min(0.97, ratio + 0.05));
      const fontRatio = Math.max(0.92, Math.min(0.98, ratio + 0.09));
      metrics.paddingX = Math.max(minMetrics.paddingX, Math.floor(metrics.paddingX * chromeRatio));
      metrics.paddingY = Math.max(minMetrics.paddingY, Math.floor(metrics.paddingY * verticalRatio));
      metrics.gap = Math.max(minMetrics.gap, Math.floor(metrics.gap * chromeRatio));
      metrics.iconSize = Math.max(minMetrics.iconSize, Math.floor(metrics.iconSize * iconRatio));
      metrics.fontSize = Math.max(minMetrics.fontSize, Math.floor(metrics.fontSize * fontRatio));
    } else {
      metrics.iconSize = Math.max(minMetrics.iconSize, Math.floor(metrics.iconSize * ratio));
      metrics.fontSize = Math.max(minMetrics.fontSize, Math.floor(metrics.fontSize * ratio));
      metrics.paddingX = Math.max(minMetrics.paddingX, Math.floor(metrics.paddingX * ratio));
      metrics.paddingY = Math.max(minMetrics.paddingY, Math.floor(metrics.paddingY * ratio));
      metrics.gap = Math.max(minMetrics.gap, Math.floor(metrics.gap * ratio));
    }

    if (widestRow > maxRowWidth) {
      if (metrics.paddingX > minMetrics.paddingX) metrics.paddingX -= 1;
      else if (metrics.gap > minMetrics.gap) metrics.gap -= 1;
      else if (metrics.paddingY > minMetrics.paddingY) metrics.paddingY -= 1;
      else if (!preserveContent && metrics.fontSize > minMetrics.fontSize) metrics.fontSize -= 1;
      else if (metrics.iconSize > minMetrics.iconSize) metrics.iconSize -= 1;
      else if (metrics.fontSize > minMetrics.fontSize) metrics.fontSize -= 1;
      else break;
    }

    widestRow = measureWidestRow();
    attempts += 1;
  }

  while (widestRow > maxRowWidth) {
    if (metrics.gap > minMetrics.gap) metrics.gap -= 1;
    else if (metrics.paddingX > minMetrics.paddingX) metrics.paddingX -= 1;
    else if (metrics.paddingY > minMetrics.paddingY) metrics.paddingY -= 1;
    else if (metrics.iconSize > minMetrics.iconSize) metrics.iconSize -= 1;
    else if (metrics.fontSize > minMetrics.fontSize) metrics.fontSize -= 1;
    else break;
    widestRow = measureWidestRow();
  }

  return metrics;
};
