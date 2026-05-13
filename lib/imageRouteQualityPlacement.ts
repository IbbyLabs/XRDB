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

type ImageType = 'poster' | 'backdrop' | 'logo';

export type QualityBadgeOverlaySpec = {
  svg: string;
  width: number;
  height: number;
  top: number;
  left: number;
};

const buildClampedQualityBadgeSpec = ({
  badge,
  qualityHeight,
  qualityBadgesStyle,
  widthHint,
  maxBadgeWidth,
}: {
  badge: QualityBadgeInput;
  qualityHeight: number;
  qualityBadgesStyle: QualityBadgeStyle;
  widthHint?: number;
  maxBadgeWidth?: number;
}) => {
  const initialSpec = buildQualityBadgeSvg(
    badge,
    qualityHeight,
    widthHint,
    qualityBadgesStyle,
  );
  if (!initialSpec) return null;
  if (!maxBadgeWidth || initialSpec.width <= maxBadgeWidth) {
    return initialSpec;
  }
  return (
    buildQualityBadgeSvg(
      badge,
      qualityHeight,
      maxBadgeWidth,
      qualityBadgesStyle,
    ) ?? initialSpec
  );
};

const resolveQualityBadgeEdgeInset = (
  imageType: ImageType,
  posterEdgeInset: number,
  backdropEdgeInset: number,
) => (imageType === 'backdrop' ? backdropEdgeInset : posterEdgeInset);

export const measureQualityBadgeColumnWidth = ({
  columnBadges,
  qualityHeight,
  qualityBadgesStyle,
  uniformBadgeWidth,
  maxBadgeWidth,
}: {
  columnBadges: QualityBadgeInput[];
  qualityHeight: number;
  qualityBadgesStyle: QualityBadgeStyle;
  uniformBadgeWidth: number;
  maxBadgeWidth?: number;
}) => {
  return columnBadges.reduce((maxWidth, badge) => {
    const useIntrinsicWidth = usesIntrinsicQualityBadgeWidths(qualityBadgesStyle, badge);
    const spec = buildClampedQualityBadgeSpec({
      badge,
      qualityHeight,
      qualityBadgesStyle,
      widthHint: useIntrinsicWidth ? undefined : uniformBadgeWidth,
      maxBadgeWidth,
    });
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
  backdropEdgeInset,
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
  backdropEdgeInset: number;
}) => {
  if (columnBadges.length === 0) return [];

  const rowEdgeInset = resolveQualityBadgeEdgeInset(
    imageType,
    posterEdgeInset,
    backdropEdgeInset,
  );
  const columnLayout = resolveQualityBadgeColumnLayout({
    referenceBadgeHeight,
    qualityBadgeScalePercent,
    badgeGap,
    badgeCount: columnBadges.length,
    availableHeight: outputHeight - Math.max(badgeTopOffset, startY) - badgeBottomOffset,
  });
  const qualityHeight = columnLayout.height;
  const qualityGap = columnLayout.gap;
  const maxBadgeWidth = Math.max(72, outputWidth - rowEdgeInset * 2);
  const uniformBadgeWidth = Math.min(
    Math.max(72, Math.round(qualityHeight * 1.75)),
    maxBadgeWidth
  );
  let rowY = Math.max(badgeTopOffset, startY);
  const overlays: QualityBadgeOverlaySpec[] = [];

  for (const badge of columnBadges) {
    const useIntrinsicWidth = usesIntrinsicQualityBadgeWidths(qualityBadgesStyle, badge);
    const spec = buildClampedQualityBadgeSpec({
      badge,
      qualityHeight,
      qualityBadgesStyle,
      widthHint: useIntrinsicWidth ? undefined : uniformBadgeWidth,
      maxBadgeWidth,
    });
    if (!spec) continue;

    const badgeWidth = spec.width;
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
  align = 'center',
  imageType,
  outputWidth,
  referenceBadgeHeight,
  qualityBadgeScalePercent,
  badgeGap,
  qualityBadgesStyle,
  posterEdgeInset,
  backdropEdgeInset,
}: {
  rowBadges: QualityBadgeInput[];
  rowY: number;
  origin?: 'top' | 'bottom';
  align?: 'left' | 'center' | 'right';
  imageType: ImageType;
  outputWidth: number;
  referenceBadgeHeight: number;
  qualityBadgeScalePercent: number;
  badgeGap: number;
  qualityBadgesStyle: QualityBadgeStyle;
  posterEdgeInset: number;
  backdropEdgeInset: number;
}) => {
  if (rowBadges.length === 0) return [];

  const rowEdgeInset = resolveQualityBadgeEdgeInset(
    imageType,
    posterEdgeInset,
    backdropEdgeInset,
  );
  const qualityHeight = resolveQualityBadgeHeight({
    referenceBadgeHeight,
    qualityBadgeScalePercent,
    layout: 'row',
  });
  const availableWidth = outputWidth - rowEdgeInset * 2;
  const maxBadgeWidth = Math.max(64, availableWidth);
  const badgeWidth = Math.min(
    Math.max(64, Math.round(qualityHeight * 1.75)),
    maxBadgeWidth
  );
  const rowGap = resolveQualityBadgeGap({ badgeGap, layout: 'row' });
  const targetRowCount = imageType === 'poster' ? Math.max(1, Math.ceil(rowBadges.length / 3)) : 1;
  const badgeRows = splitBadgesAcrossRowCount(rowBadges, targetRowCount);
  const specRows = badgeRows
    .map((badgeRow) => {
      const badgesInRow = badgeRow.length;
      const gapsWidth = Math.max(0, badgesInRow - 1) * rowGap;
      const maxBadgeWidthForRow = Math.max(64, Math.floor((availableWidth - gapsWidth) / badgesInRow));
      return badgeRow
        .map((badge) =>
          buildClampedQualityBadgeSpec({
            badge,
            qualityHeight,
            qualityBadgesStyle,
            widthHint: usesIntrinsicQualityBadgeWidths(qualityBadgesStyle, badge)
              ? undefined
              : badgeWidth,
            maxBadgeWidth: maxBadgeWidthForRow,
          })
        )
        .filter((spec): spec is NonNullable<typeof spec> => Boolean(spec));
    })
    .filter((specRow) => specRow.length > 0)
    .map((specRow) => {
      if (imageType !== 'logo') return specRow;
      const clipped: typeof specRow = [];
      let usedWidth = 0;
      for (const spec of specRow) {
        const addWidth = clipped.length > 0 ? rowGap + spec.width : spec.width;
        if (usedWidth + addWidth > availableWidth) break;
        clipped.push(spec);
        usedWidth += addWidth;
      }
      return clipped;
    })
    .filter((specRow) => specRow.length > 0);

  const totalHeight =
    specRows.reduce((sum, specRow) => sum + Math.max(...specRow.map((spec) => spec.height), 0), 0) +
    Math.max(0, specRows.length - 1) * rowGap;
  let startY =
    origin === 'bottom'
      ? rowY - totalHeight + Math.max(...(specRows.at(-1)?.map((spec) => spec.height) || [0]))
      : rowY;
  const overlays: QualityBadgeOverlaySpec[] = [];

  for (const specRow of specRows) {
    const rowWidth =
      specRow.reduce((sum, spec) => sum + spec.width, 0) + Math.max(0, specRow.length - 1) * rowGap;
    let rowX =
      align === 'left'
        ? rowEdgeInset
        : align === 'right'
          ? outputWidth - rowWidth - rowEdgeInset
          : Math.floor((outputWidth - rowWidth) / 2);
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
        top: startY + Math.floor((rowHeight - spec.height) / 2),
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
  backdropEdgeInset,
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
  backdropEdgeInset: number;
}) => {
  if (columnBadges.length === 0) return [];

  const qualityGap = Math.round(badgeGap * 1.25);
  let rowY = Math.max(badgeTopOffset, startY);
  const clampedX = Math.round(x);
  const minX = resolveQualityBadgeEdgeInset(imageType, posterEdgeInset, backdropEdgeInset);
  const maxBadgeWidth = Math.max(72, outputWidth - minX * 2);
  const overlays: QualityBadgeOverlaySpec[] = [];

  for (const badge of columnBadges) {
    const useIntrinsicWidth = usesIntrinsicQualityBadgeWidths(qualityBadgesStyle, badge);
    const spec = buildClampedQualityBadgeSpec({
      badge,
      qualityHeight,
      qualityBadgesStyle,
      widthHint: useIntrinsicWidth ? undefined : uniformBadgeWidth,
      maxBadgeWidth,
    });
    if (!spec) continue;

    const badgeWidth = spec.width;
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
