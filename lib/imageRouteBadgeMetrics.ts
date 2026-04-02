import {
  DEFAULT_BADGE_SCALE_PERCENT,
  DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
  DEFAULT_STACKED_WIDTH_PERCENT,
} from './badgeCustomization.ts';
import { DEFAULT_RATING_STYLE, type RatingStyle } from './ratingAppearance.ts';
import { getStackedBadgeHeight } from './stackedBadgeLayout.ts';

export type BadgeLayoutMetrics = {
  iconSize: number;
  fontSize: number;
  paddingX: number;
  paddingY: number;
  gap: number;
};

export type BadgeMetricInput = {
  value: string;
  label: string;
  variant?: string;
  stackedWidthPercent?: number | null;
};

export const DEFAULT_BADGE_MIN_METRICS: BadgeLayoutMetrics = {
  iconSize: 24,
  fontSize: 18,
  paddingX: 8,
  paddingY: 6,
  gap: 6,
};

export const scaleBadgeMetrics = (
  metrics: BadgeLayoutMetrics,
  scalePercent: number = DEFAULT_BADGE_SCALE_PERCENT,
  autoScaleRatio = 1,
): BadgeLayoutMetrics => {
  const ratio = Math.max(0.7, scalePercent / 100) * Math.max(0.75, autoScaleRatio);
  return {
    iconSize: Math.max(18, Math.round(metrics.iconSize * ratio)),
    fontSize: Math.max(14, Math.round(metrics.fontSize * ratio)),
    paddingX: Math.max(6, Math.round(metrics.paddingX * ratio)),
    paddingY: Math.max(5, Math.round(metrics.paddingY * ratio)),
    gap: Math.max(4, Math.round(metrics.gap * ratio)),
  };
};

export const getBadgeHeightFromMetrics = (
  metrics: BadgeLayoutMetrics,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) =>
  ratingStyle === 'stacked'
    ? getStackedBadgeHeight(metrics)
    : metrics.iconSize + metrics.paddingY * 2;

export const resolveBadgeIconRenderSize = ({
  iconSlotSize,
  badgeHeight,
  iconScalePercent = DEFAULT_PROVIDER_ICON_SCALE_PERCENT,
}: {
  iconSlotSize: number;
  badgeHeight: number;
  iconScalePercent?: number;
}) => {
  const ratio = Math.max(0.7, Math.min(1.45, iconScalePercent / 100));
  const scaledSize = Math.round(iconSlotSize * ratio);
  return Math.max(16, Math.min(badgeHeight - 4, scaledSize));
};

export const getBadgeTextRightInset = (
  value: string,
  fontSize: number,
  paddingX: number,
  compactText = false
) => {
  const normalized = value.trim();
  const baseInset = Math.max(
    compactText ? 7 : 12,
    Math.round(fontSize * (compactText ? 0.28 : 0.38)) + Math.round(paddingX * 0.75)
  );
  const trailingPercentInset =
    normalized.endsWith('%')
      ? Math.max(
          compactText ? 9 : 12,
          Math.round(fontSize * (compactText ? 0.3 : 0.28))
        )
      : 0;
  return baseInset + trailingPercentInset;
};

export const estimateBadgeTextWidth = (
  value: string,
  fontSize: number,
  compactText = false
) => {
  const normalized = value.trim();
  if (!normalized) {
    return Math.round(fontSize * (compactText ? 1.14 : 1.3));
  }
  const measureChar = (ch: string) => {
    if (/[0-9]/.test(ch)) return fontSize * (compactText ? 0.51 : 0.56);
    if (ch === '%') return fontSize * (compactText ? 0.56 : 0.62);
    if (ch === '/' || ch === '|') return fontSize * (compactText ? 0.34 : 0.4);
    if (ch === '.' || ch === ',' || ch === ':') return fontSize * (compactText ? 0.22 : 0.28);
    if (ch === ' ') return fontSize * (compactText ? 0.24 : 0.3);
    return fontSize * (compactText ? 0.54 : 0.58);
  };
  const measuredTextWidth = [...normalized].reduce((acc, ch) => acc + measureChar(ch), 0);
  const safetyRightPadding = Math.max(
    compactText ? 1 : 2,
    Math.round(
      fontSize *
      (normalized.endsWith('%') || normalized.includes('/')
        ? compactText ? 0.2 : 0.28
        : compactText ? 0.04 : 0.06)
    )
  );
  const structureWidth = Math.round(normalized.length * fontSize * (compactText ? 0.38 : 0.44));
  const isShortDecimalValue = /^\d+(?:[.,]\d)?$/.test(normalized) && !normalized.includes('/');
  const isWholeNumberValue = /^\d+$/.test(normalized);
  const shortDecimalMinWidth = isShortDecimalValue
    ? Math.round(fontSize * (compactText ? 1.52 : 1.68))
    : 0;
  const wholeNumberMinWidth = isWholeNumberValue
    ? Math.round(fontSize * (compactText ? 1.44 : 1.62))
    : 0;
  return Math.max(
    wholeNumberMinWidth,
    shortDecimalMinWidth,
    Math.round(fontSize * (compactText ? 0.92 : 1)),
    Math.round(measuredTextWidth + safetyRightPadding),
    structureWidth
  );
};

export const estimateBadgeWidth = (
  value: string,
  fontSize: number,
  paddingX: number,
  iconSize: number,
  gap: number,
  compactText = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  const textWidth = estimateBadgeTextWidth(value, fontSize, compactText);
  const outerPadding = Math.max(6, Math.round(paddingX * 0.7));
  const innerGap = outerPadding;
  if (ratingStyle === 'stacked') {
    return Math.max(
      Math.round(fontSize * 2.45),
      outerPadding * 2 + Math.max(textWidth, Math.round(iconSize * 0.92)),
    );
  }
  return Math.max(
    outerPadding + iconSize + innerGap + textWidth + outerPadding,
    outerPadding + iconSize + innerGap + outerPadding + Math.round(fontSize * (compactText ? 1.12 : 1.25))
  );
};

export const estimateSummaryLabelWidth = (label: string, fontSize: number) => {
  const normalized = label.trim().toUpperCase();
  if (!normalized) return 0;
  return Math.round(
    [...normalized].reduce((acc, ch) => {
      if (ch === ' ') return acc + fontSize * 0.32;
      if (/[WM]/.test(ch)) return acc + fontSize * 0.9;
      if (/[A-Z]/.test(ch)) return acc + fontSize * 0.64;
      if (/[0-9]/.test(ch)) return acc + fontSize * 0.6;
      if (/[\-_:/'".,!?&+]/.test(ch)) return acc + fontSize * 0.36;
      return acc + fontSize * 0.58;
    }, 0)
  );
};

export const getSummaryBadgeHorizontalMetrics = (
  label: string,
  fontSize: number,
  paddingX: number
) => {
  const summaryLabel = label.trim().toUpperCase();
  const summaryLabelFontSize = Math.max(11, Math.round(fontSize * 0.46));
  const chipPaddingX = Math.max(9, Math.round(paddingX * 0.48));
  const chipMetricLabel =
    summaryLabel === 'CRITICS' || summaryLabel === 'AUDIENCE'
      ? 'AUDIENCE'
      : summaryLabel;
  const chipWidth = estimateSummaryLabelWidth(chipMetricLabel, summaryLabelFontSize) + chipPaddingX * 2;
  const contentGap = Math.max(8, Math.round(paddingX * 0.52));
  const sideInset = Math.max(10, Math.round(paddingX * 0.78));
  return {
    summaryLabel,
    summaryLabelFontSize,
    chipPaddingX,
    chipWidth,
    contentGap,
    sideInset,
  };
};

export const estimateRenderedBadgeWidth = (
  badge: BadgeMetricInput,
  fontSize: number,
  paddingX: number,
  iconSize: number,
  gap: number,
  compactText = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  const variant = badge.variant || 'standard';
  if (variant === 'standard') {
    const baseWidth = estimateBadgeWidth(
      badge.value,
      fontSize,
      paddingX,
      iconSize,
      gap,
      compactText,
      ratingStyle,
    );
    if (ratingStyle === 'stacked') {
      const widthRatio = Math.max(0.7, Math.min(1.3, (badge.stackedWidthPercent || DEFAULT_STACKED_WIDTH_PERCENT) / 100));
      return Math.max(Math.round(fontSize * 2.05), Math.round(baseWidth * widthRatio));
    }
    return baseWidth;
  }

  const outerPadding = Math.max(10, Math.round(paddingX * (variant === 'minimal' ? 1.05 : 0.95)));
  const valueWidth = estimateBadgeTextWidth(badge.value, fontSize, false);
  if (variant === 'minimal') {
    const chipDiameter = iconSize + outerPadding;
    return Math.max(chipDiameter, valueWidth + outerPadding * 2);
  }

  const { summaryLabelFontSize, chipWidth, contentGap, sideInset } = getSummaryBadgeHorizontalMetrics(
    badge.label,
    fontSize,
    paddingX
  );
  return Math.max(
    sideInset * 2 + valueWidth + chipWidth + contentGap,
    sideInset * 2 + valueWidth + Math.round(summaryLabelFontSize * 4.2)
  );
};

export const getMinimumCompressedBadgeWidth = (
  value: string,
  fontSize: number,
  paddingX: number,
  iconSize: number,
  gap: number,
  compactText = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) =>
  ratingStyle === 'stacked'
    ? Math.max(
        Math.round(fontSize * 1.9),
        Math.max(6, Math.round(paddingX * 0.7)) * 2 + Math.round(iconSize * 0.78),
      )
    : Math.max(6, Math.round(paddingX * 0.7)) +
      iconSize +
      Math.max(6, Math.round(paddingX * 0.7)) +
      Math.max(6, Math.round(paddingX * 0.7)) +
      Math.round(fontSize * (compactText ? 0.82 : 0.92));

export const getMinimumCompressedRenderedBadgeWidth = (
  badge: BadgeMetricInput,
  fontSize: number,
  paddingX: number,
  iconSize: number,
  gap: number,
  compactText = false,
  ratingStyle: RatingStyle = DEFAULT_RATING_STYLE,
) => {
  const variant = badge.variant || 'standard';
  if (variant === 'standard') {
    const baseWidth = getMinimumCompressedBadgeWidth(
      badge.value,
      fontSize,
      paddingX,
      iconSize,
      gap,
      compactText,
      ratingStyle,
    );
    if (ratingStyle === 'stacked') {
      const widthRatio = Math.max(0.7, Math.min(1.3, (badge.stackedWidthPercent || DEFAULT_STACKED_WIDTH_PERCENT) / 100));
      return Math.max(Math.round(fontSize * 1.72), Math.round(baseWidth * widthRatio));
    }
    return baseWidth;
  }

  if (variant === 'minimal') {
    return Math.max(iconSize, Math.round(fontSize * 1.8) + Math.max(12, Math.round(paddingX * 1.4)));
  }

  const { chipWidth, sideInset } = getSummaryBadgeHorizontalMetrics(
    badge.label,
    fontSize,
    paddingX
  );
  return Math.max(
    Math.round(fontSize * 2.5),
    chipWidth +
      Math.round(fontSize * 1.6) +
      sideInset * 2
  );
};
