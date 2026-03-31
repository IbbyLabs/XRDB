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
