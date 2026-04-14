import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOverlayAutoScale, resolveGenreBadgeAutoScale } from '../lib/overlayScale.ts';

test('poster overlay auto scale follows poster size tiers', () => {
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 580, outputHeight: 859 }),
    1,
  );
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 1280, outputHeight: 1896 }),
    Math.min(1280 / 580, 1896 / 859),
  );
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 2000, outputHeight: 2926 }),
    Math.min(2000 / 580, 2926 / 859),
  );
});

test('auto scale clamps invalid and very small dimensions', () => {
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 0, outputHeight: 0 }),
    1,
  );
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 200, outputHeight: 300 }),
    0.75,
  );
});

test('backdrop and logo auto scale use their baselines', () => {
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'backdrop', outputWidth: 1280, outputHeight: 720 }),
    1,
  );
  assert.equal(
    resolveOverlayAutoScale({ imageType: 'logo', outputWidth: 900, outputHeight: 320 }),
    1,
  );
});

test('genre badge auto scale is 1 at normal poster size', () => {
  assert.equal(
    resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 580, outputHeight: 859 }),
    1,
  );
});

test('genre badge auto scale boosts large poster above linear', () => {
  const genre = resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 1280, outputHeight: 1896 });
  const linear = resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 1280, outputHeight: 1896 });
  assert.ok(genre > linear, `expected genre(${genre}) > linear(${linear})`);
  assert.ok(Math.abs(genre - 2.31) < 0.05, `expected ~2.31, got ${genre}`);
});

test('genre badge auto scale boosts 4K poster above linear', () => {
  const genre = resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 2000, outputHeight: 2926 });
  const linear = resolveOverlayAutoScale({ imageType: 'poster', outputWidth: 2000, outputHeight: 2926 });
  assert.ok(genre > linear, `expected genre(${genre}) > linear(${linear})`);
  assert.ok(Math.abs(genre - 3.64) < 0.05, `expected ~3.64, got ${genre}`);
});

test('poster genre auto scale keeps comparable normalized size ratios across tiers', () => {
  const normalScale = resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 580, outputHeight: 859 });
  const largeScale = resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 1280, outputHeight: 1896 });
  const fourKScale = resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 2000, outputHeight: 2926 });

  const normalRatio = (40 * normalScale) / 859;
  const largeRatio = (40 * largeScale) / 1896;
  const fourKRatio = (40 * fourKScale) / 2926;

  assert.ok(Math.abs(largeRatio - normalRatio) < 0.004, `expected large ratio near normal (${largeRatio} vs ${normalRatio})`);
  assert.ok(Math.abs(fourKRatio - normalRatio) < 0.004, `expected 4K ratio near normal (${fourKRatio} vs ${normalRatio})`);
});

test('genre badge auto scale boosts 4K backdrop above linear', () => {
  const genre = resolveGenreBadgeAutoScale({ imageType: 'backdrop', outputWidth: 3840, outputHeight: 2160 });
  const linear = resolveOverlayAutoScale({ imageType: 'backdrop', outputWidth: 3840, outputHeight: 2160 });
  assert.ok(genre > linear, `expected genre(${genre}) > linear(${linear})`);
  assert.ok(Math.abs(genre - 3.54) < 0.05, `expected ~3.54, got ${genre}`);
});

test('genre badge auto scale clamps to minimum 0.75 on very small output', () => {
  assert.equal(
    resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 200, outputHeight: 300 }),
    0.75,
  );
  assert.equal(
    resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 0, outputHeight: 0 }),
    1,
  );
});

test('genre badge auto scale clamps to maximum 5 on very large output', () => {
  const result = resolveGenreBadgeAutoScale({ imageType: 'poster', outputWidth: 20000, outputHeight: 30000 });
  assert.equal(result, 5);
});

test('genre badge auto scale is always >= linear overlay auto scale when scale > 1', () => {
  const sizes = [
    { imageType: 'poster', outputWidth: 580, outputHeight: 859 },
    { imageType: 'poster', outputWidth: 1280, outputHeight: 1896 },
    { imageType: 'poster', outputWidth: 2000, outputHeight: 2926 },
    { imageType: 'backdrop', outputWidth: 1280, outputHeight: 720 },
    { imageType: 'backdrop', outputWidth: 3840, outputHeight: 2160 },
  ];
  for (const size of sizes) {
    const genre = resolveGenreBadgeAutoScale(size);
    const linear = resolveOverlayAutoScale(size);
    if (linear > 1) {
      assert.ok(genre >= linear, `at ${size.outputWidth}x${size.outputHeight}: genre(${genre}) < linear(${linear})`);
    }
  }
});
