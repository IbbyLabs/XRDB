import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPosterCleanOverlayAsset,
  resolvePosterCleanOverlayPlacement,
} from '../lib/imageRoutePosterCleanOverlay.ts';

test('image route poster clean overlay falls back to generated title art when no logo is available', async () => {
  const overlay = await buildPosterCleanOverlayAsset({
    imageType: 'poster',
    posterTitleText: 'A Quiet Place',
    posterLogoUrl: null,
    posterRowRegionWidth: 420,
    outputWidth: 500,
    outputHeight: 750,
    sharp: () => {
      throw new Error('sharp should not be used for title only overlays');
    },
    getSourceImagePayload: async () => {
      throw new Error('source fetch should not be used for title only overlays');
    },
  });

  assert.ok(overlay);
  assert.equal(Buffer.isBuffer(overlay.buffer), true);
  assert.equal(overlay.width > 0, true);
  assert.equal(overlay.height > 0, true);
});

test('image route poster clean overlay prefers resized logo art when the logo resolves', async () => {
  const overlay = await buildPosterCleanOverlayAsset({
    imageType: 'poster',
    posterTitleText: 'Fallback Title',
    posterLogoUrl: 'https://cdn.example.com/logo.png',
    posterRowRegionWidth: 360,
    outputWidth: 500,
    outputHeight: 800,
    sharp: () => ({
      metadata: async () => ({ width: 1200, height: 300 }),
      resize: (width, height) => ({
        png: () => ({
          toBuffer: async () => Buffer.from(`logo:${width}x${height}`),
        }),
      }),
    }),
    getSourceImagePayload: async () => ({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=60',
    }),
  });

  assert.ok(overlay);
  assert.deepEqual(overlay.buffer, Buffer.from('logo:360x90'));
  assert.equal(overlay.width, 360);
  assert.equal(overlay.height, 90);
});

test('image route poster clean overlay placement centers art above the bottom block', () => {
  const placement = resolvePosterCleanOverlayPlacement({
    overlay: {
      buffer: Buffer.from('x'),
      width: 180,
      height: 54,
    },
    bottomBlockTopY: 620,
    topRowBottom: 120,
    badgeGap: 10,
    outputWidth: 500,
    posterRowHorizontalInset: 28,
  });

  assert.deepEqual(placement, {
    top: 557,
    left: 160,
  });
});

test('image route poster clean overlay placement returns null when there is no safe gap', () => {
  const placement = resolvePosterCleanOverlayPlacement({
    overlay: {
      buffer: Buffer.from('x'),
      width: 200,
      height: 90,
    },
    bottomBlockTopY: 180,
    topRowBottom: 140,
    badgeGap: 10,
    outputWidth: 400,
    posterRowHorizontalInset: 24,
  });

  assert.equal(placement, null);
});
