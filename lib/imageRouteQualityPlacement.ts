import { splitBadgesAcrossRowCount } from './imageRouteBadgeRows.ts';
import {
  buildQualityBadgeSvg,
  usesIntrinsicQualityBadgeWidths,
  type QualityBadgeInput,
} from './imageRouteQualityBadge.ts';
import {
  resolveQualityBadgeColumnLayout,
  resolveQualityBadgeGap,
  resolveQualityBadgeHeight,
} from './qualityBadgeLayout.ts';
import type { QualityBadgeStyle } from './ratingAppearance.ts';

type ImageType = 'poster' | 'backdrop';

export type QualityBadgeOverlaySpec = {
  svg: string;
  width: number;
  height: number;
  top: number;
  left: number;
};

const resolveQualityBadgeEdgeInset = (imageType: ImageType, posterEdgeInset: number) =>
  imageType === 'poster' ? posterEdgeInset : 12;

export const measureQualityBadgeColumnWidth = ({
  columnBadges,
  qualityHeight,
  qualityBadgesStyle,
  uniformBadgeWidth,
}: {
  columnBadges: QualityBadgeInput[];
  qualityHeight: number;
  qualityBadgesStyle: QualityBadgeStyle;
  uniformBadgeWidth: number;
}) => {
  if (!usesIntrinsicQualityBadgeWidths(qualityBadgesStyle)) {
    return uniformBadgeWidth;
  }

  return columnBadges.reduce((maxWidth, badge) => {
    const spec = buildQualityBadgeSvg(
      badge,
      qualityHeight,
      undefined,
      qualityBadgesStyle
    );
    return Math.max(maxWidth, spec?.width ?? 0);
  }, 0);
};

export const buildQualityBadgeColumnOverlays = ({
  columnBadges,
  startY,
  side,
  imageType,
  outputWidth,
  outputHeight,
  badgeTopOffset,
  badgeBottomOffset,
  referenceBadgeHeight,
  qualityBadgeScalePercent,
  badgeGap,
  qualityBadgesStyle,
  posterEdgeInset,
}: {
  columnBadges: QualityBadgeInput[];
  startY: number;
  side: 'left' | 'right';
  imageType: ImageType;
  outputWidth: number;
  outputHeight: number;
  badgeTopOffset: number;
  badgeBottomOffset: number;
  referenceBadgeHeight: number;
  qualityBadgeScalePercent: number;
  badgeGap: number;
  qualityBadgesStyle: QualityBadgeStyle;
  posterEdgeInset: number;
}) => {
  if (columnBadges.length === 0) return [];

  const columnLayout = resolveQualityBadgeColumnLayout({
    referenceBadgeHeight,
    qualityBadgeScalePercent,
    badgeGap,
    badgeCount: columnBadges.length,
    availableHeight: outputHeight - Math.max(badgeTopOffset, startY) - badgeBottomOffset,
  });
  const qualityHeight = columnLayout.height;
  const qualityGap = columnLayout.gap;
  const useIntrinsicWidths = usesIntrinsicQualityBadgeWidths(qualityBadgesStyle);
  const uniformBadgeWidth = useIntrinsicWidths
    ? null
    : Math.min(
        Math.max(72, Math.round(qualityHeight * 1.75)),
        Math.max(72, outputWidth - 24)
      );
  let rowY = Math.max(badgeTopOffset, startY);
  const rowEdgeInset = resolveQualityBadgeEdgeInset(imageType, posterEdgeInset);
  const overlays: QualityBadgeOverlaySpec[] = [];

  for (const badge of columnBadges) {
    const spec = buildQualityBadgeSvg(
      badge,
      qualityHeight,
      uniformBadgeWidth ?? undefined,
      qualityBadgesStyle
    );
    if (!spec) continue;

    const badgeWidth =
      uniformBadgeWidth === null ? spec.width : Math.min(spec.width, uniformBadgeWidth);
    const rowX =
      side === 'right'
        ? Math.max(rowEdgeInset, outputWidth - badgeWidth - rowEdgeInset)
        : rowEdgeInset;

    overlays.push({
      svg: spec.svg,
      width: badgeWidth,
      height: spec.height,
      top: rowY,
      left: rowX,
    });
    rowY += spec.height + qualityGap;
  }

  return overlays;
};

export const buildQualityBadgeRowOverlays = ({
  rowBadges,
  rowY,
  origin = 'top',
  imageType,
  outputWidth,
  referenceBadgeHeight,
  qualityBadgeScalePercent,
  badgeGap,
  qualityBadgesStyle,
  posterEdgeInset,
}: {
  rowBadges: QualityBadgeInput[];
  rowY: number;
  origin?: 'top' | 'bottom';
  imageType: ImageType;
  outputWidth: number;
  referenceBadgeHeight: number;
  qualityBadgeScalePercent: number;
  badgeGap: number;
  qualityBadgesStyle: QualityBadgeStyle;
  posterEdgeInset: number;
}) => {
  if (rowBadges.length === 0) return [];

  const useIntrinsicWidths = usesIntrinsicQualityBadgeWidths(qualityBadgesStyle);
  const qualityHeight = resolveQualityBadgeHeight({
    referenceBadgeHeight,
    qualityBadgeScalePercent,
    layout: 'row',
  });
  const badgeWidth = useIntrinsicWidths
    ? null
    : Math.min(
        Math.max(64, Math.round(qualityHeight * 1.75)),
        Math.max(64, outputWidth - 24)
      );
  const rowGap = resolveQualityBadgeGap({ badgeGap, layout: 'row' });
  const targetRowCount = imageType === 'poster' ? Math.max(1, Math.ceil(rowBadges.length / 3)) : 1;
  const badgeRows = splitBadgesAcrossRowCount(rowBadges, targetRowCount);
  const specRows = badgeRows
    .map((badgeRow) =>
      badgeRow
        .map((badge) =>
          buildQualityBadgeSvg(
            badge,
            qualityHeight,
            badgeWidth ?? undefined,
            qualityBadgesStyle
          )
        )
        .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec))
    )
    .filter((specRow) => specRow.length > 0);

  const totalHeight =
    specRows.reduce((sum, specRow) => sum + Math.max(...specRow.map((spec) => spec.height), 0), 0) +
    Math.max(0, specRows.length - 1) * rowGap;
  let startY =
    origin === 'bottom'
      ? rowY - totalHeight + Math.max(...(specRows.at(-1)?.map((spec) => spec.height) || [0]))
      : rowY;
  const rowEdgeInset = resolveQualityBadgeEdgeInset(imageType, posterEdgeInset);
  const overlays: QualityBadgeOverlaySpec[] = [];

  for (const specRow of specRows) {
    const rowWidth =
      specRow.reduce((sum, spec) => sum + spec.width, 0) + Math.max(0, specRow.length - 1) * rowGap;
    let rowX = Math.floor((outputWidth - rowWidth) / 2);
    rowX = Math.max(
      rowEdgeInset,
      Math.min(rowX, Math.max(rowEdgeInset, outputWidth - rowWidth - rowEdgeInset))
    );
    const rowHeight = Math.max(...specRow.map((spec) => spec.height), 0);

    for (const spec of specRow) {
      overlays.push({
        svg: spec.svg,
        width: spec.width,
        height: spec.height,
        top: startY,
        left: rowX,
      });
      rowX += spec.width + rowGap;
    }

    startY += rowHeight + rowGap;
  }

  return overlays;
};

export const buildQualityBadgeColumnOverlaysAt = ({
  columnBadges,
  startY,
  x,
  qualityHeight,
  uniformBadgeWidth,
  imageType,
  outputWidth,
  badgeTopOffset,
  badgeGap,
  qualityBadgesStyle,
  posterEdgeInset,
}: {
  columnBadges: QualityBadgeInput[];
  startY: number;
  x: number;
  qualityHeight: number;
  uniformBadgeWidth: number;
  imageType: ImageType;
  outputWidth: number;
  badgeTopOffset: number;
  badgeGap: number;
  qualityBadgesStyle: QualityBadgeStyle;
  posterEdgeInset: number;
}) => {
  if (columnBadges.length === 0) return [];

  const qualityGap = Math.round(badgeGap * 1.25);
  let rowY = Math.max(badgeTopOffset, startY);
  const useIntrinsicWidths = usesIntrinsicQualityBadgeWidths(qualityBadgesStyle);
  const clampedX = Math.round(x);
  const minX = resolveQualityBadgeEdgeInset(imageType, posterEdgeInset);
  const overlays: QualityBadgeOverlaySpec[] = [];

  for (const badge of columnBadges) {
    const spec = buildQualityBadgeSvg(
      badge,
      qualityHeight,
      useIntrinsicWidths ? undefined : uniformBadgeWidth,
      qualityBadgesStyle
    );
    if (!spec) continue;

    const badgeWidth = useIntrinsicWidths ? spec.width : uniformBadgeWidth;
    const adjustedX = Math.max(
      minX,
      Math.min(clampedX, Math.max(minX, outputWidth - badgeWidth - minX))
    );

    overlays.push({
      svg: spec.svg,
      width: badgeWidth,
      height: spec.height,
      top: rowY,
      left: adjustedX,
    });
    rowY += spec.height + qualityGap;
  }

  return overlays;
};
