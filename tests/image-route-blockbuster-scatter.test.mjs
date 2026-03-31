import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampBlockbusterRect,
  createBlockbusterScatterCandidates,
  intersectsBlockbusterRect,
  placeBlockbusterRect,
} from '../lib/imageRouteBlockbusterScatter.ts';

test('image route blockbuster scatter candidates are deterministic and lead with the preferred placement', () => {
  const input = {
    seedSalt: 'salt',
    seedKey: 'score:test',
    width: 120,
    height: 80,
    preferredLeft: 40,
    preferredTop: 24,
    outputWidth: 800,
    outputHeight: 1200,
    badgeTopOffset: 20,
    attempts: 4,
    scatterMode: 'score',
  };

  const first = createBlockbusterScatterCandidates(input);
  const second = createBlockbusterScatterCandidates(input);

  assert.deepEqual(first, second);
  assert.deepEqual(first[0], { left: 40, top: 24 });
  assert.equal(first.length > 5, true);
});

test('image route blockbuster scatter rects clamp to the canvas bounds', () => {
  assert.deepEqual(
    clampBlockbusterRect({
      left: -30,
      top: 999,
      width: 100,
      height: 80,
      outputWidth: 320,
      outputHeight: 240,
    }),
    {
      left: 0,
      top: 160,
      width: 100,
      height: 80,
    },
  );
});

test('image route blockbuster scatter placement avoids protected and occupied rects', () => {
  const protectedRects = [
    { left: 0, top: 0, width: 180, height: 160 },
  ];
  const placedRects = [
    { left: 220, top: 120, width: 120, height: 90 },
  ];

  const placement = placeBlockbusterRect({
    width: 120,
    height: 90,
    seedSalt: 'salt',
    seedKey: 'callout:test',
    preferredLeft: 30,
    preferredTop: 30,
    outputWidth: 420,
    outputHeight: 320,
    badgeTopOffset: 20,
    protectedRects,
    placedRects,
    scatterMode: 'callout',
    attempts: 20,
    protectedPadding: 12,
    occupiedPadding: 10,
  });

  assert.ok(placement);
  assert.equal(intersectsBlockbusterRect(placement, protectedRects[0], 12), false);
  assert.equal(intersectsBlockbusterRect(placement, placedRects[0], 10), false);
  assert.deepEqual(placedRects.at(-1), placement);
});

test('image route blockbuster scatter placement returns null when no safe slot exists', () => {
  const placement = placeBlockbusterRect({
    width: 100,
    height: 100,
    seedSalt: 'salt',
    seedKey: 'blocked',
    preferredLeft: 0,
    preferredTop: 0,
    outputWidth: 100,
    outputHeight: 100,
    badgeTopOffset: 8,
    protectedRects: [{ left: 0, top: 0, width: 100, height: 100 }],
    placedRects: [],
    attempts: 4,
    protectedPadding: 0,
    occupiedPadding: 0,
  });

  assert.equal(placement, null);
});
