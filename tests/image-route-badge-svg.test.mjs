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

test('image route badge svg centers standard badge values for decimal provider scores', () => {
  const svg = buildBadgeSvg({
    width: 132,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#38bdf8',
    monogram: 'TM',
    iconDataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    iconKey: 'tmdb',
    value: '7.9/10',
    ratingStyle: 'glass',
  });

  assert.match(svg, /text-anchor="middle"/);
  assert.doesNotMatch(svg, /text-anchor="start"/);
});

test('image route badge svg centers summary badge values for glass badges', () => {
  const svg = buildBadgeSvg({
    width: 152,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#22c55e',
    monogram: 'CR',
    labelText: 'Critics',
    value: '8.3',
    badgeVariant: 'summary',
    ratingStyle: 'glass',
  });

  assert.equal((svg.match(/text-anchor="middle"/g) || []).length, 2);
  assert.doesNotMatch(svg, /text-anchor="end"/);
});

test('image route badge svg centers summary badge values for plain badges', () => {
  const svg = buildBadgeSvg({
    width: 152,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#38bdf8',
    monogram: 'AU',
    labelText: 'Audience',
    value: '7.6',
    badgeVariant: 'summary',
    ratingStyle: 'plain',
  });

  assert.equal((svg.match(/text-anchor="middle"/g) || []).length, 2);
  assert.doesNotMatch(svg, /text-anchor="end"/);
});

test('image route badge svg places the plain summary accent rail as an overline above the label', () => {
  const svg = buildBadgeSvg({
    width: 152,
    height: 42,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#38bdf8',
    monogram: 'AU',
    labelText: 'Audience',
    value: '8.5',
    badgeVariant: 'summary',
    ratingStyle: 'plain',
  });

  const accentRectMatch = svg.match(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="3"/);
  const labelTextMatch = svg.match(/<text x="([0-9.]+)" y="([0-9.]+)"[^>]*>AUDIENCE<\/text>/);

  assert.ok(accentRectMatch);
  assert.ok(labelTextMatch);

  const accentRailX = Number.parseFloat(accentRectMatch[1]);
  const accentRailY = Number.parseFloat(accentRectMatch[2]);
  const accentRailWidth = Number.parseFloat(accentRectMatch[3]);
  const labelX = Number.parseFloat(labelTextMatch[1]);
  const labelY = Number.parseFloat(labelTextMatch[2]);
  const accentRailCenterX = accentRailX + accentRailWidth / 2;

  assert.ok(Math.abs(accentRailCenterX - labelX) <= 1);
  assert.ok(accentRailY < labelY - 6);
  assert.ok(accentRailWidth >= 56);
  assert.ok(accentRailWidth <= 66);
});

test('image route badge svg keeps minimal accent rails centered across styles', () => {
  const plainSvg = buildBadgeSvg({
    width: 140,
    height: 44,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#38bdf8',
    monogram: 'AU',
    value: '8.5',
    badgeVariant: 'minimal',
    ratingStyle: 'plain',
  });
  const glassSvg = buildBadgeSvg({
    width: 140,
    height: 44,
    iconSize: 24,
    fontSize: 18,
    paddingX: 14,
    gap: 10,
    accentColor: '#38bdf8',
    monogram: 'AU',
    value: '8.5',
    badgeVariant: 'minimal',
    ratingStyle: 'glass',
  });

  const plainAccentRectMatch = plainSvg.match(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/);
  const glassAccentRectMatch = glassSvg.match(/<rect x="([0-9.]+)" y="([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/);

  assert.ok(plainAccentRectMatch);
  assert.ok(glassAccentRectMatch);

  const plainCenterX = Number.parseFloat(plainAccentRectMatch[1]) + Number.parseFloat(plainAccentRectMatch[3]) / 2;
  const glassCenterX = Number.parseFloat(glassAccentRectMatch[1]) + Number.parseFloat(glassAccentRectMatch[3]) / 2;

  assert.ok(Math.abs(plainCenterX - 70) <= 1);
  assert.ok(Math.abs(glassCenterX - 70) <= 1);
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
