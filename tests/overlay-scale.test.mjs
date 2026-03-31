import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveOverlayAutoScale } from '../lib/overlayScale.ts';

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
