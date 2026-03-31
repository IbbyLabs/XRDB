import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveBlockbusterProtectedRects } from '../lib/imageRouteBlockbusterProtection.ts';

const baseInput = {
  imageType: 'poster',
  ratingPresentation: 'blockbuster',
  qualityBadgeCount: 2,
  posterQualityBadgePlacement: 'bottom',
  badgeBaseHeight: 48,
  qualityBadgeScaleRatio: 1,
  badgeTopOffset: 20,
  badgeBottomOffset: 20,
  outputWidth: 800,
  outputHeight: 1200,
  badgeGap: 10,
  posterRatingsLayout: 'top',
  posterTopRowCount: 0,
  posterTopBlockBottom: 20,
  leftBadges: [],
  rightBadges: [],
  sideMetrics: {
    iconSize: 32,
    fontSize: 24,
    paddingX: 12,
    paddingY: 8,
    gap: 10,
  },
  ratingStyle: 'glass',
  posterEdgeInset: 24,
  resolveSideBadgeStartY: () => 0,
};

test('image route blockbuster protection returns no protected rects outside poster blockbuster mode', () => {
  assert.deepEqual(
    resolveBlockbusterProtectedRects({
      ...baseInput,
      imageType: 'backdrop',
    }),
    [],
  );
});

test('image route blockbuster protection builds a bottom protected band', () => {
  assert.deepEqual(
    resolveBlockbusterProtectedRects(baseInput),
    [
      {
        left: 0,
        top: 1112,
        width: 800,
        height: 88,
      },
    ],
  );
});

test('image route blockbuster protection keeps top row space reserved for side placement', () => {
  const [rect] = resolveBlockbusterProtectedRects({
    ...baseInput,
    outputHeight: 360,
    posterQualityBadgePlacement: 'left',
    posterRatingsLayout: 'top-bottom',
    posterTopRowCount: 2,
    posterTopBlockBottom: 160,
  });

  assert.equal(rect.top, 142);
  assert.equal(rect.left, 6);
});

test('image route blockbuster protection can start below an occupied side column', () => {
  const [rect] = resolveBlockbusterProtectedRects({
    ...baseInput,
    outputHeight: 320,
    posterQualityBadgePlacement: 'right',
    posterRatingsLayout: 'top-bottom',
    leftBadges: [],
    rightBadges: [
      { label: 'IMDb', value: '8.1' },
    ],
    resolveSideBadgeStartY: () => 100,
  });

  assert.equal(rect.top, 140);
  assert.equal(rect.left > 600, true);
});
