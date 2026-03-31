import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildQualityBadgeSvg,
  getBadgeIconRadius,
  getBadgeOuterRadius,
  usesIntrinsicQualityBadgeWidths,
} from '../lib/imageRouteQualityBadge.ts';

test('image route quality badge helpers derive expected radii', () => {
  assert.equal(getBadgeOuterRadius(40, 'glass'), 20);
  assert.equal(getBadgeOuterRadius(40, 'square'), 10);
  assert.equal(getBadgeOuterRadius(40, 'stacked'), 12);

  assert.equal(getBadgeIconRadius(24, 'glass'), 12);
  assert.equal(getBadgeIconRadius(24, 'square'), 6);
  assert.equal(getBadgeIconRadius(24, 'stacked'), 7);
});

test('image route quality badge helper marks intrinsic width styles', () => {
  assert.equal(usesIntrinsicQualityBadgeWidths('media'), true);
  assert.equal(usesIntrinsicQualityBadgeWidths('silver'), true);
  assert.equal(usesIntrinsicQualityBadgeWidths('glass'), false);
});

test('image route quality badge builds media certification output', () => {
  const spec = buildQualityBadgeSvg({ key: 'certification', label: 'PG 13' }, 44, undefined, 'media');

  assert.ok(spec);
  assert.equal(spec.height, 40);
  assert.match(spec.svg, /AGE/);
  assert.match(spec.svg, /PG 13/);
});

test('image route quality badge builds asset backed plain output', () => {
  const spec = buildQualityBadgeSvg({ key: '4k', label: '4K' }, 46, undefined, 'plain');

  assert.ok(spec);
  assert.ok(spec.width > 0);
  assert.match(spec.svg, /<image /);
  assert.match(spec.svg, /quality-badge-logo-shadow/);
});

test('image route quality badge returns null for unsupported keys', () => {
  assert.equal(buildQualityBadgeSvg({ key: 'unknown', label: 'Unknown' }, 40, undefined, 'glass'), null);
});
