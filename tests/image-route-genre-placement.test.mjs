import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveGenreBadgeOverlay } from '../lib/imageRouteGenrePlacement.ts';

const baseGenreBadge = {
  familyId: 'anime',
  label: 'Action',
  accentColor: '#38bdf8',
  mode: 'genre',
  style: 'glass',
  position: 'topRight',
  scalePercent: 100,
};

test('image route genre placement respects poster edge inset for right aligned badges', () => {
  const overlay = resolveGenreBadgeOverlay({
    genreBadge: baseGenreBadge,
    imageType: 'poster',
    outputWidth: 400,
    outputHeight: 600,
    badgeTopOffset: 24,
    badgeBottomOffset: 24,
    badgeGap: 10,
    posterEdgeInset: 18,
    collisionRects: [],
  });

  assert.ok(overlay);
  assert.equal(overlay.top, 24);
  assert.equal(overlay.left, 400 - overlay.width - 18);
});

test('image route genre placement nudges downward to avoid top collisions', () => {
  const overlay = resolveGenreBadgeOverlay({
    genreBadge: {
      ...baseGenreBadge,
      position: 'topLeft',
    },
    imageType: 'poster',
    outputWidth: 400,
    outputHeight: 600,
    badgeTopOffset: 24,
    badgeBottomOffset: 24,
    badgeGap: 10,
    posterEdgeInset: 18,
    collisionRects: [
      {
        left: 18,
        top: 24,
        width: 220,
        height: 42,
      },
    ],
  });

  assert.ok(overlay);
  assert.equal(overlay.left, 18);
  assert.equal(overlay.top > 24, true);
});

test('image route genre placement nudges upward from bottom collisions', () => {
  const overlay = resolveGenreBadgeOverlay({
    genreBadge: {
      ...baseGenreBadge,
      position: 'bottomCenter',
    },
    imageType: 'backdrop',
    outputWidth: 500,
    outputHeight: 300,
    badgeTopOffset: 18,
    badgeBottomOffset: 20,
    badgeGap: 12,
    posterEdgeInset: 18,
    collisionRects: [
      {
        left: 150,
        top: 220,
        width: 200,
        height: 40,
      },
    ],
  });

  assert.ok(overlay);
  assert.equal(overlay.top < 240, true);
});

test('image route clean genre placement avoids title collision across poster sizes', () => {
  const posterSizes = [
    { name: 'normal', width: 580, height: 859 },
    { name: 'large', width: 1000, height: 1463 },
    { name: '4k', width: 2000, height: 2926 },
  ];

  for (const size of posterSizes) {
    const titleRect = {
      left: Math.round(size.width * 0.15),
      top: Math.round(size.height * 0.76),
      width: Math.round(size.width * 0.7),
      height: Math.round(size.height * 0.09),
    };
    const overlay = resolveGenreBadgeOverlay({
      genreBadge: {
        ...baseGenreBadge,
        style: 'clean',
        mode: 'text',
      },
      imageType: 'poster',
      outputWidth: size.width,
      outputHeight: size.height,
      badgeTopOffset: Math.round(size.height * 0.03),
      badgeBottomOffset: Math.round(size.height * 0.03),
      badgeGap: Math.max(10, Math.round(size.height * 0.012)),
      posterEdgeInset: Math.max(12, Math.round(size.width * 0.02)),
      collisionRects: [titleRect],
    });

    assert.ok(overlay, `${size.name} should resolve clean genre overlay`);
    const overlapsTitle =
      overlay.left < titleRect.left + titleRect.width &&
      overlay.left + overlay.width > titleRect.left &&
      overlay.top < titleRect.top + titleRect.height &&
      overlay.top + overlay.height > titleRect.top;
    assert.equal(overlapsTitle, false, `${size.name} clean genre should not overlap title region`);
  }
});

test('image route clean genre placement remains near bottom under dense collisions', () => {
  const outputWidth = 580;
  const outputHeight = 859;
  const overlay = resolveGenreBadgeOverlay({
    genreBadge: {
      ...baseGenreBadge,
      style: 'clean',
      mode: 'text',
      position: 'topLeft',
    },
    imageType: 'poster',
    outputWidth,
    outputHeight,
    badgeTopOffset: 24,
    badgeBottomOffset: 24,
    badgeGap: 10,
    posterEdgeInset: 18,
    collisionRects: [
      { left: 30, top: 80, width: 520, height: 80 },
      { left: 20, top: 190, width: 540, height: 92 },
      { left: 22, top: 320, width: 536, height: 94 },
      { left: 26, top: 452, width: 528, height: 88 },
      { left: 36, top: 570, width: 508, height: 76 },
    ],
  });

  assert.ok(overlay);
  const minInset = Math.round(outputHeight * 0.013);
  const anchoredBottomTop = outputHeight - overlay.height - minInset;
  const maxAllowedRise = Math.max(
    Math.round(outputHeight * 0.08),
    overlay.height + Math.max(8, Math.round(10 * 0.9)) * 2,
  );
  assert.equal(overlay.top >= anchoredBottomTop - maxAllowedRise, true);
  assert.equal(overlay.top < Math.round(outputHeight * 0.7), false);
});

test('image route genre placement in blockbuster mode respects selected position', () => {
  const outputWidth = 580;
  const outputHeight = 859;
  const badgeTopOffset = 24;
  const badgeBottomOffset = 24;

  for (const position of ['topLeft', 'topCenter', 'topRight', 'bottomLeft', 'bottomCenter', 'bottomRight']) {
    const overlay = resolveGenreBadgeOverlay({
      genreBadge: {
        ...baseGenreBadge,
        style: 'glass',
        mode: 'both',
        position,
      },
      imageType: 'poster',
      outputWidth,
      outputHeight,
      badgeTopOffset,
      badgeBottomOffset,
      badgeGap: 10,
      posterEdgeInset: 18,
      collisionRects: [],
    });

    assert.ok(overlay, `${position} should resolve`);

    const isBottom = position.startsWith('bottom');
    if (isBottom) {
      assert.equal(overlay.top >= outputHeight - overlay.height - badgeBottomOffset - 2, true,
        `${position}: badge top (${overlay.top}) should be near bottom offset`);
    } else {
      assert.equal(overlay.top <= badgeTopOffset + 2, true,
        `${position}: badge top (${overlay.top}) should be at top offset (${badgeTopOffset})`);
    }
  }
});
