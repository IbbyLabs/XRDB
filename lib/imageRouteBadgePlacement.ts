import {
  estimateRenderedBadgeWidth,
  getMinimumCompressedRenderedBadgeWidth,
  type BadgeMetricInput,
} from './imageRouteBadgeMetrics.ts';
import type { RatingStyle } from './ratingAppearance.ts';

export type BadgeRowPlacement<T> = {
  badge: T;
  badgeWidth: number;
  rowX: number;
};

export const planBadgeRowPlacements = <T extends BadgeMetricInput>({
  rowBadges,
  fontSize,
  paddingX,
  iconSize,
  gap,
  compactText,
  ratingStyle,
  regionLeft = 0,
  regionWidth,
  maxRowWidth,
  align = 'center',
  splitAcrossHalves = false,
  spreadAcrossThirds = false,
  preserveBadgeSize = false,
  isPosterRowLayout = false,
}: {
  rowBadges: T[];
  fontSize: number;
  paddingX: number;
  iconSize: number;
  gap: number;
  compactText: boolean;
  ratingStyle: RatingStyle;
  regionLeft?: number;
  regionWidth: number;
  maxRowWidth?: number;
  align?: 'left' | 'center' | 'right';
  splitAcrossHalves?: boolean;
  spreadAcrossThirds?: boolean;
  preserveBadgeSize?: boolean;
  isPosterRowLayout?: boolean;
}): BadgeRowPlacement<T>[] => {
  if (rowBadges.length === 0) return [];

  const rowEntries = rowBadges.map((badge) => {
    const badgeWidth = estimateRenderedBadgeWidth(
      badge,
      fontSize,
      paddingX,
      iconSize,
      gap,
      compactText,
      ratingStyle
    );
    const minBadgeWidth = getMinimumCompressedRenderedBadgeWidth(
      badge,
      fontSize,
      paddingX,
      iconSize,
      gap,
      compactText,
      ratingStyle
    );
    return { badge, badgeWidth, minBadgeWidth };
  });

  const normalizedRegionLeft = Math.max(0, Math.floor(regionLeft));
  const normalizedRegionWidth = Math.max(0, Math.floor(regionWidth));
  const regionRight = normalizedRegionLeft + normalizedRegionWidth;
  const effectiveMaxWidth =
    typeof maxRowWidth === 'number'
      ? Math.min(maxRowWidth, Math.max(0, normalizedRegionWidth - 24))
      : Math.max(0, normalizedRegionWidth - 24);

  let rowGap = gap;
  const measureCurrentRowWidth = () =>
    rowEntries.reduce((acc, entry) => acc + entry.badgeWidth, 0) +
    Math.max(0, rowEntries.length - 1) * rowGap;

  let rowWidth = measureCurrentRowWidth();
  if (!preserveBadgeSize && rowWidth > effectiveMaxWidth && rowEntries.length > 1 && rowGap > 0) {
    const shrinkPerGap = Math.min(
      rowGap,
      Math.max(1, Math.ceil((rowWidth - effectiveMaxWidth) / (rowEntries.length - 1)))
    );
    rowGap = Math.max(0, rowGap - shrinkPerGap);
    rowWidth = measureCurrentRowWidth();
  }

  if (!preserveBadgeSize && rowWidth > effectiveMaxWidth) {
    let overflow = rowWidth - effectiveMaxWidth;
    let guard = 0;
    while (overflow > 0 && guard < rowEntries.length * 8) {
      let changed = false;
      for (const entry of rowEntries) {
        if (overflow <= 0) break;
        const shrinkable = Math.max(0, entry.badgeWidth - entry.minBadgeWidth);
        if (shrinkable <= 0) continue;
        const shrink = Math.min(shrinkable, Math.max(1, Math.ceil(overflow / rowEntries.length)));
        entry.badgeWidth -= shrink;
        overflow -= shrink;
        changed = true;
      }
      if (!changed) break;
      rowWidth = measureCurrentRowWidth();
      overflow = Math.max(0, rowWidth - effectiveMaxWidth);
      guard += 1;
    }
    rowWidth = measureCurrentRowWidth();
  }

  const shouldCenterSingle = isPosterRowLayout && rowEntries.length === 1;
  const shouldSplitRow = (isPosterRowLayout || splitAcrossHalves) && rowEntries.length === 2;
  const shouldSpreadRow = (isPosterRowLayout || spreadAcrossThirds) && rowEntries.length === 3;

  if (shouldCenterSingle) {
    const centerX =
      normalizedRegionLeft + Math.floor(normalizedRegionWidth / 2) - Math.floor(rowEntries[0].badgeWidth / 2);
    const rowX = Math.max(
      normalizedRegionLeft,
      Math.min(centerX, Math.max(normalizedRegionLeft, regionRight - rowEntries[0].badgeWidth))
    );
    return [{ badge: rowEntries[0].badge, badgeWidth: rowEntries[0].badgeWidth, rowX }];
  }

  if (shouldSplitRow) {
    const edgeInset = 12;
    const leftHalfWidth = Math.floor(normalizedRegionWidth / 2);
    const rightHalfWidth = Math.max(0, normalizedRegionWidth - leftHalfWidth);
    const leftMin = normalizedRegionLeft + edgeInset;
    const leftMax = normalizedRegionLeft + leftHalfWidth - edgeInset - rowEntries[0].badgeWidth;
    const rightMin = normalizedRegionLeft + leftHalfWidth + edgeInset;
    const rightMax = regionRight - edgeInset - rowEntries[1].badgeWidth;
    if (leftMin <= leftMax && rightMin <= rightMax) {
      const leftCenterX =
        normalizedRegionLeft + Math.floor(leftHalfWidth / 2) - Math.floor(rowEntries[0].badgeWidth / 2);
      const rightCenterX =
        normalizedRegionLeft +
        leftHalfWidth +
        Math.floor(rightHalfWidth / 2) -
        Math.floor(rowEntries[1].badgeWidth / 2);
      const leftX = Math.max(leftMin, Math.min(leftCenterX, leftMax));
      const rightX = Math.max(rightMin, Math.min(rightCenterX, rightMax));
      const overlaps = leftX + rowEntries[0].badgeWidth + rowGap > rightX;
      if (!overlaps) {
        return [
          { badge: rowEntries[0].badge, badgeWidth: rowEntries[0].badgeWidth, rowX: leftX },
          { badge: rowEntries[1].badge, badgeWidth: rowEntries[1].badgeWidth, rowX: rightX },
        ];
      }
    }
  }

  if (shouldSpreadRow) {
    const edgeInset = 12;
    const leftX = normalizedRegionLeft + edgeInset;
    const centerX =
      normalizedRegionLeft + Math.floor(normalizedRegionWidth / 2) - Math.floor(rowEntries[1].badgeWidth / 2);
    const rightX = Math.max(normalizedRegionLeft, regionRight - rowEntries[2].badgeWidth - edgeInset);
    const overlaps =
      leftX + rowEntries[0].badgeWidth + rowGap > centerX ||
      centerX + rowEntries[1].badgeWidth + rowGap > rightX;
    if (!overlaps) {
      return [
        { badge: rowEntries[0].badge, badgeWidth: rowEntries[0].badgeWidth, rowX: leftX },
        { badge: rowEntries[1].badge, badgeWidth: rowEntries[1].badgeWidth, rowX: centerX },
        { badge: rowEntries[2].badge, badgeWidth: rowEntries[2].badgeWidth, rowX: rightX },
      ];
    }
  }

  const preferredEdgeInset = 12;
  const dynamicEdgeInset =
    rowWidth > effectiveMaxWidth
      ? Math.max(0, Math.min(preferredEdgeInset, Math.floor((normalizedRegionWidth - rowWidth) / 2)))
      : preferredEdgeInset;
  const minRowX = normalizedRegionLeft + dynamicEdgeInset;
  const maxRowX = Math.max(normalizedRegionLeft, regionRight - rowWidth - dynamicEdgeInset);
  let rowX =
    align === 'left'
      ? minRowX
      : align === 'right'
        ? maxRowX
        : normalizedRegionLeft + Math.floor((normalizedRegionWidth - rowWidth) / 2);
  if (rowWidth > effectiveMaxWidth) {
    rowX =
      align === 'right'
        ? Math.max(normalizedRegionLeft, regionRight - rowWidth)
        : align === 'left'
          ? normalizedRegionLeft
          : normalizedRegionLeft + Math.floor((normalizedRegionWidth - rowWidth) / 2);
  }
  rowX = Math.max(normalizedRegionLeft, Math.min(rowX, Math.max(normalizedRegionLeft, regionRight - rowWidth)));

  return rowEntries.map((entry) => {
    const placement = {
      badge: entry.badge,
      badgeWidth: entry.badgeWidth,
      rowX,
    };
    rowX += entry.badgeWidth + rowGap;
    return placement;
  });
};
