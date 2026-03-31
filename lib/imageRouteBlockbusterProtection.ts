import {
  measureBadgeColumnHeight,
} from './imageRouteBadgeColumns.ts';
import type {
  BadgeLayoutMetrics,
  BadgeMetricInput,
} from './imageRouteBadgeMetrics.ts';
import type { PosterRatingLayout } from './posterLayoutOptions.ts';
import type { RatingStyle } from './ratingAppearance.ts';
import type { BlockbusterPlacementRect } from './imageRouteBlockbusterScatter.ts';

export const resolveBlockbusterProtectedRects = ({
  imageType,
  ratingPresentation,
  qualityBadgeCount,
  posterQualityBadgePlacement,
  badgeBaseHeight,
  qualityBadgeScaleRatio,
  badgeTopOffset,
  badgeBottomOffset,
  outputWidth,
  outputHeight,
  badgeGap,
  posterRatingsLayout,
  posterTopRowCount,
  posterTopBlockBottom,
  leftBadges,
  rightBadges,
  sideMetrics,
  ratingStyle,
  posterEdgeInset,
  resolveSideBadgeStartY,
}: {
  imageType: 'poster' | 'backdrop' | 'logo';
  ratingPresentation: string;
  qualityBadgeCount: number;
  posterQualityBadgePlacement: 'top' | 'bottom' | 'left' | 'right' | null;
  badgeBaseHeight: number;
  qualityBadgeScaleRatio: number;
  badgeTopOffset: number;
  badgeBottomOffset: number;
  outputWidth: number;
  outputHeight: number;
  badgeGap: number;
  posterRatingsLayout: PosterRatingLayout;
  posterTopRowCount: number;
  posterTopBlockBottom: number;
  leftBadges: BadgeMetricInput[];
  rightBadges: BadgeMetricInput[];
  sideMetrics: BadgeLayoutMetrics;
  ratingStyle: RatingStyle;
  posterEdgeInset: number;
  resolveSideBadgeStartY: (
    columnBadges: BadgeMetricInput[],
    metrics?: BadgeLayoutMetrics,
    minTop?: number
  ) => number;
}): BlockbusterPlacementRect[] => {
  if (imageType !== 'poster' || ratingPresentation !== 'blockbuster') return [];
  if (qualityBadgeCount <= 0 || !posterQualityBadgePlacement) return [];

  const protectionPad = 18;
  if (posterQualityBadgePlacement === 'bottom') {
    const bottomQualityHeight = Math.max(
      36,
      Math.round(badgeBaseHeight * 1.05 * qualityBadgeScaleRatio),
    );
    const bottomY = Math.max(
      badgeTopOffset,
      outputHeight - badgeBottomOffset - bottomQualityHeight
    );
    return [
      {
        left: 0,
        top: Math.max(0, bottomY - protectionPad),
        width: outputWidth,
        height: outputHeight - Math.max(0, bottomY - protectionPad),
      },
    ];
  }

  if (posterQualityBadgePlacement === 'top') {
    const topQualityHeight = Math.max(
      36,
      Math.round(badgeBaseHeight * 1.05 * qualityBadgeScaleRatio),
    );
    return [
      {
        left: 0,
        top: 0,
        width: outputWidth,
        height: Math.min(outputHeight, badgeTopOffset + topQualityHeight + protectionPad),
      },
    ];
  }

  const qualityHeight = Math.max(44, Math.round(badgeBaseHeight * 1.25 * qualityBadgeScaleRatio));
  const uniformBadgeWidth = Math.min(
    Math.max(72, Math.round(qualityHeight * 1.75)),
    Math.max(72, outputWidth - 24)
  );
  const qualityGap = Math.round(badgeGap * 1.25);
  const qualityTotalHeight =
    qualityBadgeCount * qualityHeight +
    Math.max(0, qualityBadgeCount - 1) * qualityGap;
  const centeredStartY = Math.max(
    badgeTopOffset,
    Math.round((outputHeight - qualityTotalHeight) / 2)
  );
  let qualityStartY = centeredStartY;
  const shouldTopAlignQuality =
    (posterRatingsLayout === 'left' || posterRatingsLayout === 'right') &&
    (posterQualityBadgePlacement === 'left' || posterQualityBadgePlacement === 'right');
  if (shouldTopAlignQuality) {
    qualityStartY = badgeTopOffset;
  } else if (posterTopRowCount > 0) {
    qualityStartY = Math.max(qualityStartY, posterTopBlockBottom);
  } else {
    const sideBadges =
      posterQualityBadgePlacement === 'right' ? rightBadges : leftBadges;
    if (sideBadges.length > 0) {
      const sideColumnHeight = measureBadgeColumnHeight(
        sideBadges,
        sideMetrics,
        ratingStyle,
      );
      if (sideColumnHeight > 0) {
        qualityStartY = Math.max(
          qualityStartY,
          resolveSideBadgeStartY(sideBadges, sideMetrics) +
            sideColumnHeight +
            badgeGap
        );
      }
    }
  }

  const left =
    posterQualityBadgePlacement === 'right'
      ? Math.max(0, outputWidth - uniformBadgeWidth - posterEdgeInset - protectionPad)
      : Math.max(0, posterEdgeInset - protectionPad);
  return [
    {
      left,
      top: Math.max(0, qualityStartY - protectionPad),
      width: Math.min(outputWidth - left, uniformBadgeWidth + protectionPad * 2),
      height: Math.min(
        outputHeight - Math.max(0, qualityStartY - protectionPad),
        qualityTotalHeight + protectionPad * 2
      ),
    },
  ];
};
