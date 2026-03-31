const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const resolveQualityBadgeHeight = ({
  referenceBadgeHeight,
  qualityBadgeScalePercent,
  layout,
}: {
  referenceBadgeHeight: number;
  qualityBadgeScalePercent: number;
  layout: 'row' | 'column';
}) => {
  const qualityBadgeScaleRatio = Math.max(0.7, qualityBadgeScalePercent / 100);
  const preferredHeight =
    layout === 'column'
      ? Math.round(referenceBadgeHeight * 1.0 * qualityBadgeScaleRatio)
      : Math.round(referenceBadgeHeight * 1.02 * qualityBadgeScaleRatio);

  return layout === 'column'
    ? clamp(preferredHeight, 40, 200)
    : clamp(preferredHeight, 40, 200);
};

export const resolveQualityBadgeGap = ({
  badgeGap,
  layout,
}: {
  badgeGap: number;
  layout: 'row' | 'column';
}) => {
  const preferredGap = layout === 'column' ? Math.round(badgeGap * 1.15) : Math.round(badgeGap * 1.18);
  return layout === 'column' ? clamp(preferredGap, 5, 13) : clamp(preferredGap, 5, 14);
};

export const resolveQualityBadgeColumnLayout = ({
  referenceBadgeHeight,
  qualityBadgeScalePercent,
  badgeGap,
  badgeCount,
  availableHeight,
}: {
  referenceBadgeHeight: number;
  qualityBadgeScalePercent: number;
  badgeGap: number;
  badgeCount: number;
  availableHeight: number;
}) => {
  const preferredHeight = resolveQualityBadgeHeight({
    referenceBadgeHeight,
    qualityBadgeScalePercent,
    layout: 'column',
  });
  const preferredGap = resolveQualityBadgeGap({ badgeGap, layout: 'column' });
  const normalizedBadgeCount = Math.max(0, Math.floor(badgeCount));
  const normalizedAvailableHeight = Math.max(0, Math.floor(availableHeight));
  const preferredTotalHeight =
    preferredHeight * normalizedBadgeCount +
    Math.max(0, normalizedBadgeCount - 1) * preferredGap;

  if (
    normalizedBadgeCount <= 1 ||
    normalizedAvailableHeight <= 0 ||
    preferredTotalHeight <= normalizedAvailableHeight
  ) {
    return {
      height: preferredHeight,
      gap: preferredGap,
      totalHeight: preferredTotalHeight,
    };
  }

  const fitScale = Math.max(0.42, normalizedAvailableHeight / preferredTotalHeight);
  const fittedHeight = Math.max(28, Math.floor(preferredHeight * fitScale));
  const fittedGap = Math.max(2, Math.floor(preferredGap * fitScale));
  const fittedTotalHeight =
    fittedHeight * normalizedBadgeCount +
    Math.max(0, normalizedBadgeCount - 1) * fittedGap;

  if (fittedTotalHeight <= normalizedAvailableHeight) {
    return {
      height: fittedHeight,
      gap: fittedGap,
      totalHeight: fittedTotalHeight,
    };
  }

  const remainingHeight = Math.max(0, normalizedAvailableHeight - fittedHeight * normalizedBadgeCount);
  const clampedGap =
    normalizedBadgeCount > 1
      ? Math.max(0, Math.floor(remainingHeight / (normalizedBadgeCount - 1)))
      : 0;

  return {
    height: fittedHeight,
    gap: clampedGap,
    totalHeight:
      fittedHeight * normalizedBadgeCount +
      Math.max(0, normalizedBadgeCount - 1) * clampedGap,
  };
};
