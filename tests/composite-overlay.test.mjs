import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { fitCompositeOverlaysToCanvas } from '../lib/compositeOverlay.ts';

const createOverlay = async (width, height) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

test('composite overlays keep their size when they already fit the canvas', async () => {
  const overlayBuffer = await createOverlay(120, 80);
  const [overlay] = await fitCompositeOverlaysToCanvas(
    sharp,
    [{ input: overlayBuffer, left: 12, top: 8 }],
    400,
    300,
  );

  const metadata = await sharp(overlay.input).metadata();
  assert.equal(metadata.width, 120);
  assert.equal(metadata.height, 80);
  assert.equal(overlay.left, 12);
  assert.equal(overlay.top, 8);
});

test('composite overlays shrink to the remaining canvas space when needed', async () => {
  const overlayBuffer = await createOverlay(240, 120);
  const [overlay] = await fitCompositeOverlaysToCanvas(
    sharp,
    [{ input: overlayBuffer, left: 150, top: 50 }],
    200,
    100,
  );

  const metadata = await sharp(overlay.input).metadata();
  assert.equal(metadata.width, 50);
  assert.equal(metadata.height, 25);
  assert.equal(overlay.left, 150);
  assert.equal(overlay.top, 50);
});

test('composite overlays that start outside the canvas are dropped', async () => {
  const overlayBuffer = await createOverlay(80, 80);
  const overlays = await fitCompositeOverlaysToCanvas(
    sharp,
    [{ input: overlayBuffer, left: 250, top: 20 }],
    200,
    100,
  );

  assert.equal(overlays.length, 0);
});
