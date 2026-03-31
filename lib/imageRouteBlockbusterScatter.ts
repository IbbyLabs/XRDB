import { sha1Hex } from './imageRouteRuntime.ts';

export type BlockbusterPlacementRect = { left: number; top: number; width: number; height: number };
export type BlockbusterScatterMode = 'callout' | 'blurb' | 'score';

export const intersectsBlockbusterRect = (
  left: BlockbusterPlacementRect,
  right: BlockbusterPlacementRect,
  padding = 0
) =>
  left.left < right.left + right.width + padding &&
  left.left + left.width > right.left - padding &&
  left.top < right.top + right.height + padding &&
  left.top + left.height > right.top - padding;

export const clampBlockbusterRect = ({
  left,
  top,
  width,
  height,
  outputWidth,
  outputHeight,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
}): BlockbusterPlacementRect => ({
  left: Math.max(0, Math.min(Math.round(left), Math.max(0, outputWidth - width))),
  top: Math.max(0, Math.min(Math.round(top), Math.max(0, outputHeight - height))),
  width,
  height,
});

export const createBlockbusterScatterCandidates = ({
  seedSalt,
  seedKey,
  width,
  height,
  preferredLeft,
  preferredTop,
  outputWidth,
  outputHeight,
  badgeTopOffset,
  attempts = 72,
  scatterMode = 'score',
}: {
  seedSalt: string;
  seedKey: string;
  width: number;
  height: number;
  preferredLeft: number;
  preferredTop: number;
  outputWidth: number;
  outputHeight: number;
  badgeTopOffset: number;
  attempts?: number;
  scatterMode?: BlockbusterScatterMode;
}) => {
  let state = Number.parseInt(sha1Hex(`${seedSalt}:${seedKey}`).slice(0, 8), 16) || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const safeInset = 8;
  const horizontalRange = Math.max(0, outputWidth - width - safeInset * 2);
  const topInset = Math.max(8, badgeTopOffset - 8);
  const verticalRange = Math.max(0, outputHeight - height - topInset - safeInset);
  const edgeBandX = Math.max(14, Math.min(84, Math.round(outputWidth * 0.14)));
  const edgeBandY = Math.max(14, Math.min(88, Math.round(outputHeight * 0.12)));
  const anchorMap: Record<
    BlockbusterScatterMode,
    Array<{ x: number; y: number; jitterX: number; jitterY: number }>
  > = {
    callout: [
      { x: 0.04, y: 0.04, jitterX: 30, jitterY: 18 },
      { x: 0.24, y: 0.04, jitterX: 36, jitterY: 18 },
      { x: 0.52, y: 0.05, jitterX: 40, jitterY: 18 },
      { x: 0.8, y: 0.06, jitterX: 34, jitterY: 18 },
      { x: 0.04, y: 0.2, jitterX: 24, jitterY: 24 },
      { x: 0.82, y: 0.22, jitterX: 24, jitterY: 24 },
      { x: 0.08, y: 0.42, jitterX: 28, jitterY: 28 },
      { x: 0.76, y: 0.4, jitterX: 28, jitterY: 28 },
      { x: 0.14, y: 0.62, jitterX: 28, jitterY: 26 },
      { x: 0.68, y: 0.62, jitterX: 28, jitterY: 26 },
      { x: 0.42, y: 0.16, jitterX: 44, jitterY: 22 },
    ],
    blurb: [
      { x: 0.06, y: 0.18, jitterX: 26, jitterY: 24 },
      { x: 0.62, y: 0.12, jitterX: 30, jitterY: 24 },
      { x: 0.08, y: 0.36, jitterX: 28, jitterY: 26 },
      { x: 0.68, y: 0.34, jitterX: 30, jitterY: 26 },
      { x: 0.12, y: 0.58, jitterX: 28, jitterY: 24 },
      { x: 0.58, y: 0.56, jitterX: 32, jitterY: 24 },
      { x: 0.2, y: 0.74, jitterX: 26, jitterY: 18 },
      { x: 0.66, y: 0.72, jitterX: 26, jitterY: 18 },
      { x: 0.32, y: 0.24, jitterX: 36, jitterY: 24 },
      { x: 0.46, y: 0.44, jitterX: 34, jitterY: 24 },
    ],
    score: [
      { x: 0.02, y: 0.04, jitterX: 18, jitterY: 14 },
      { x: 0.84, y: 0.04, jitterX: 18, jitterY: 14 },
      { x: 0.04, y: 0.2, jitterX: 18, jitterY: 18 },
      { x: 0.84, y: 0.2, jitterX: 18, jitterY: 18 },
      { x: 0.06, y: 0.38, jitterX: 18, jitterY: 20 },
      { x: 0.84, y: 0.4, jitterX: 18, jitterY: 20 },
      { x: 0.08, y: 0.58, jitterX: 18, jitterY: 22 },
      { x: 0.82, y: 0.6, jitterX: 18, jitterY: 22 },
      { x: 0.1, y: 0.76, jitterX: 18, jitterY: 18 },
      { x: 0.78, y: 0.76, jitterX: 18, jitterY: 18 },
      { x: 0.34, y: 0.08, jitterX: 28, jitterY: 16 },
      { x: 0.56, y: 0.08, jitterX: 28, jitterY: 16 },
    ],
  };
  const candidates = [{ left: preferredLeft, top: preferredTop }];
  const anchors = anchorMap[scatterMode];
  const anchorOffset =
    anchors.length > 0
      ? (Number.parseInt(sha1Hex(`${seedKey}:anchors`).slice(0, 4), 16) || 0) % anchors.length
      : 0;

  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[(index + anchorOffset) % anchors.length];
    const jitterX = Math.round((next() - 0.5) * anchor.jitterX * 2);
    const jitterY = Math.round((next() - 0.5) * anchor.jitterY * 2);
    candidates.push({
      left: safeInset + Math.round(horizontalRange * anchor.x) + jitterX,
      top: topInset + Math.round(verticalRange * anchor.y) + jitterY,
    });
  }

  for (let index = 0; index < attempts; index += 1) {
    let left = safeInset + Math.round(horizontalRange * next());
    let top = topInset + Math.round(verticalRange * next());
    const roll = next();

    if (scatterMode === 'score') {
      if (roll < 0.28) {
        left = safeInset + Math.round(edgeBandX * next());
      } else if (roll < 0.56) {
        left = safeInset + horizontalRange - Math.round(edgeBandX * next());
      } else if (roll < 0.74) {
        top = topInset + Math.round(edgeBandY * next());
      } else if (roll < 0.88) {
        top = topInset + Math.round(verticalRange * (0.56 + next() * 0.28));
      } else {
        top = topInset + Math.round(verticalRange * (0.18 + next() * 0.5));
      }
    } else if (scatterMode === 'callout') {
      if (roll < 0.32) {
        top = topInset + Math.round(edgeBandY * next());
      } else if (roll < 0.54) {
        left = safeInset + Math.round(edgeBandX * next());
      } else if (roll < 0.76) {
        left = safeInset + horizontalRange - Math.round(edgeBandX * next());
      } else {
        top = topInset + Math.round(verticalRange * (0.12 + next() * 0.48));
      }
    } else {
      if (roll < 0.24) {
        left = safeInset + Math.round(edgeBandX * next());
      } else if (roll < 0.48) {
        left = safeInset + horizontalRange - Math.round(edgeBandX * next());
      } else if (roll < 0.72) {
        top = topInset + Math.round(verticalRange * (0.14 + next() * 0.44));
      } else {
        top = topInset + Math.round(verticalRange * (0.32 + next() * 0.4));
      }
    }

    candidates.push({ left, top });
  }

  return candidates;
};

export const placeBlockbusterRect = ({
  width,
  height,
  seedSalt,
  seedKey,
  preferredLeft,
  preferredTop,
  outputWidth,
  outputHeight,
  badgeTopOffset,
  protectedRects,
  placedRects,
  attempts = 72,
  protectedPadding = 18,
  occupiedPadding = 10,
  scatterMode = 'score',
  relaxedOccupiedPadding = 0,
}: {
  width: number;
  height: number;
  seedSalt: string;
  seedKey: string;
  preferredLeft: number;
  preferredTop: number;
  outputWidth: number;
  outputHeight: number;
  badgeTopOffset: number;
  protectedRects: BlockbusterPlacementRect[];
  placedRects: BlockbusterPlacementRect[];
  attempts?: number;
  protectedPadding?: number;
  occupiedPadding?: number;
  scatterMode?: BlockbusterScatterMode;
  relaxedOccupiedPadding?: number;
}): BlockbusterPlacementRect | null => {
  const candidates = createBlockbusterScatterCandidates({
    seedSalt,
    seedKey,
    width,
    height,
    preferredLeft,
    preferredTop,
    outputWidth,
    outputHeight,
    badgeTopOffset,
    attempts,
    scatterMode,
  });
  const occupiedPaddingPasses = Array.from(
    new Set([
      Math.max(0, Math.round(occupiedPadding)),
      Math.max(Math.max(0, relaxedOccupiedPadding), Math.round(occupiedPadding * 0.5)),
      Math.max(0, Math.round(relaxedOccupiedPadding)),
    ])
  ).sort((left, right) => right - left);

  for (const occupiedPaddingForPass of occupiedPaddingPasses) {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const rect = clampBlockbusterRect({
        left: candidate.left,
        top: candidate.top,
        width,
        height,
        outputWidth,
        outputHeight,
      });
      const hitsProtected = protectedRects.some((target) =>
        intersectsBlockbusterRect(rect, target, protectedPadding)
      );
      if (hitsProtected) continue;
      const hitsPlaced = placedRects.some((target) =>
        intersectsBlockbusterRect(rect, target, occupiedPaddingForPass)
      );
      if (hitsPlaced) continue;
      placedRects.push(rect);
      return rect;
    }
  }

  return null;
};
