import type {
  GenreBadgeFamilyId,
  GenreBadgeMode,
  GenreBadgePosition,
  GenreBadgeStyle,
} from './genreBadge.ts';
import { buildGenreBadgeSvg } from './imageRouteGenreBadge.ts';

type ImageType = 'poster' | 'backdrop' | 'logo';

export type GenreBadgePlacementRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GenreBadgePlacementInput = {
  familyId: GenreBadgeFamilyId;
  label: string;
  accentColor: string;
  mode: GenreBadgeMode;
  style: GenreBadgeStyle;
  position: GenreBadgePosition;
  scalePercent?: number;
};

export type GenreBadgeOverlaySpec = {
  svg: string;
  width: number;
  height: number;
  top: number;
  left: number;
};

export const resolveGenreBadgeOverlay = ({
  genreBadge,
  imageType,
  outputWidth,
  outputHeight,
  badgeTopOffset,
  badgeBottomOffset,
  badgeGap,
  posterEdgeInset,
  collisionRects,
}: {
  genreBadge: GenreBadgePlacementInput | null;
  imageType: ImageType;
  outputWidth: number;
  outputHeight: number;
  badgeTopOffset: number;
  badgeBottomOffset: number;
  badgeGap: number;
  posterEdgeInset: number;
  collisionRects: GenreBadgePlacementRect[];
}) => {
  if (!genreBadge) return null;

  const spec = buildGenreBadgeSvg(genreBadge, imageType);
  const horizontalInset = imageType === 'poster' ? posterEdgeInset : 12;
  const maxLeft = Math.max(horizontalInset, outputWidth - spec.width - horizontalInset);
  const maxTop = Math.max(12, outputHeight - spec.height - 12);
  const topInset = Math.min(maxTop, Math.max(12, badgeTopOffset));
  const bottomInset = Math.min(
    maxTop,
    Math.max(12, outputHeight - spec.height - badgeBottomOffset)
  );
  const centerLeft = Math.max(12, Math.min(maxLeft, Math.round((outputWidth - spec.width) / 2)));
  const left =
    genreBadge.position === 'topRight' || genreBadge.position === 'bottomRight'
      ? maxLeft
      : genreBadge.position === 'topCenter' || genreBadge.position === 'bottomCenter'
        ? centerLeft
        : horizontalInset;
  const initialTop =
    genreBadge.position === 'bottomLeft' ||
    genreBadge.position === 'bottomCenter' ||
    genreBadge.position === 'bottomRight'
      ? bottomInset
      : topInset;
  const verticalDirection =
    genreBadge.position === 'bottomLeft' ||
    genreBadge.position === 'bottomCenter' ||
    genreBadge.position === 'bottomRight'
      ? 'up'
      : 'down';
  const collisionPadding = Math.max(8, Math.round(badgeGap * 0.9));
  let adjustedTop = initialTop;

  for (let pass = 0; pass < collisionRects.length + 2; pass += 1) {
    let nextTop = adjustedTop;
    for (const rect of collisionRects) {
      const overlapsHorizontally =
        left < rect.left + rect.width + collisionPadding &&
        left + spec.width > rect.left - collisionPadding;
      const overlapsVertically =
        adjustedTop < rect.top + rect.height + collisionPadding &&
        adjustedTop + spec.height > rect.top - collisionPadding;
      if (!overlapsHorizontally || !overlapsVertically) continue;
      nextTop =
        verticalDirection === 'up'
          ? Math.min(nextTop, rect.top - spec.height - collisionPadding)
          : Math.max(nextTop, rect.top + rect.height + collisionPadding);
    }
    const clampedNextTop = Math.max(12, Math.min(maxTop, nextTop));
    if (clampedNextTop === adjustedTop) break;
    adjustedTop = clampedNextTop;
  }

  return {
    svg: spec.svg,
    width: spec.width,
    height: spec.height,
    top: adjustedTop,
    left,
  };
};
