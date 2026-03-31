import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCKBUSTER_DENSITY_PRESETS,
  buildProviderMonogram,
  buildTransformedSvgOverlay,
  getBlockbusterDensityScale,
  hexColorToRgba,
} from '../lib/imageRouteBlockbusterLayout.ts';

test('image route blockbuster layout exposes stable density presets', () => {
  assert.equal(BLOCKBUSTER_DENSITY_PRESETS.sparse.calloutLimit, 3);
  assert.equal(BLOCKBUSTER_DENSITY_PRESETS.packed.blurbLimit, 6);
  assert.equal(BLOCKBUSTER_DENSITY_PRESETS.balanced.badgePadding, 2);
});

test('image route blockbuster layout clamps density scale lookups', () => {
  assert.equal(getBlockbusterDensityScale([1, 0.8, 0.6], -1), 1);
  assert.equal(getBlockbusterDensityScale([1, 0.8, 0.6], 99), 0.6);
});

test('image route blockbuster layout builds compact provider monograms', () => {
  assert.equal(buildProviderMonogram('Rotten Tomatoes'), 'RT');
  assert.equal(buildProviderMonogram('IMDb'), 'IM');
  assert.equal(buildProviderMonogram(''), 'R');
});

test('image route blockbuster layout converts hex colors to rgba safely', () => {
  assert.equal(hexColorToRgba('#abc', 0.5), 'rgba(170,187,204,0.5)');
  assert.equal(hexColorToRgba('bad-color', 0.3, 'fallback'), 'fallback');
});

test('image route blockbuster layout wraps transformed svg overlays', () => {
  const spec = buildTransformedSvgOverlay({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"></svg>',
    width: 40,
    height: 20,
    rotation: 15,
    opacity: 0.8,
    scale: 1.1,
    skewX: 4,
    skewY: -3,
    pad: 10,
  });

  assert.ok(spec.width > 40);
  assert.ok(spec.height > 20);
  assert.match(spec.svg, /data:image\/svg\+xml;base64,/);
});
