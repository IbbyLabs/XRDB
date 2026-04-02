import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBadgeSvg } from '../lib/imageRouteBadgeSvg.ts';

test('image route badge svg builds a plain minimal badge', () => {
  const svg = buildBadgeSvg({
    width: 140,
    height: 44,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#f97316',
    monogram: 'XR',
    value: '8.7',
    badgeVariant: 'minimal',
    ratingStyle: 'plain',
  });

  assert.match(svg, /plain-variant-text-shadow/);
  assert.match(svg, />8\.7</);
});

test('image route badge svg builds a stacked badge with escaped content', () => {
  const svg = buildBadgeSvg({
    width: 148,
    height: 54,
    iconSize: 26,
    fontSize: 18,
    paddingX: 16,
    gap: 10,
    accentColor: '#22c55e',
    monogram: 'A&B',
    value: '8&7',
    ratingStyle: 'stacked',
    stackedAccentMode: 'logo',
  });

  assert.match(svg, /stacked-surface-fill/);
  assert.match(svg, /stacked-rail-fill/);
  assert.match(svg, /stacked-value-fill/);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /8&amp;7/);
});

test('image route badge svg builds a glass badge with an icon image', () => {
  const svg = buildBadgeSvg({
    width: 128,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#38bdf8',
    monogram: 'TM',
    iconDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    iconKey: 'tmdb',
    value: '7.9',
    ratingStyle: 'glass',
    preferNeutralGlassPlate: true,
  });

  assert.match(svg, /clipPath id="icon-clip"/);
  assert.match(svg, /data:image\/svg\+xml;base64,PHN2Zy8\+/);
});

test('image route badge svg keeps the default light square plate for rotten tomatoes badges', () => {
  const svg = buildBadgeSvg({
    width: 128,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#000000',
    monogram: 'RT',
    iconDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    iconKey: 'tomatoes',
    value: '93',
    ratingStyle: 'square',
  });

  assert.match(svg, /fill="rgba\(255,248,240,0\.96\)"/);
});

test('image route badge svg keeps custom square icon overrides on a dark plate', () => {
  const svg = buildBadgeSvg({
    width: 128,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#000000',
    monogram: 'CU',
    iconDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    hasCustomIconOverride: true,
    iconKey: 'tomatoes',
    value: '93',
    ratingStyle: 'square',
  });

  assert.match(svg, /fill="rgb\(10,10,10\)"/);
  assert.doesNotMatch(svg, /fill="rgba\(255,248,240,0\.96\)"/);
});
