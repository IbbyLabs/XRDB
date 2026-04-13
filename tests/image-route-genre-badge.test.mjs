import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGenreBadgeSvg } from '../lib/imageRouteGenreBadge.ts';

test('image route genre badge builds plain icon and text output', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'anime',
      label: 'Anime',
      accentColor: '#7dd3fc',
      mode: 'both',
      style: 'plain',
    },
    'poster',
  );

  assert.ok(spec.width > spec.height);
  assert.match(spec.svg, /genreBadgeShadow/);
  assert.match(spec.svg, /ANIME/);
});

test('image route genre badge builds clean text style output', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'scifi',
      label: 'SCI FI',
      accentColor: '#22d3ee',
      mode: 'text',
      style: 'clean',
    },
    'poster',
  );

  assert.match(spec.svg, /Science Fiction/);
  assert.match(spec.svg, /fill="#ffffff"/);
  assert.doesNotMatch(spec.svg, /fill="rgba\(8,11,16,/);
  assert.match(spec.svg, /cleanStripShadow/);
  assert.match(spec.svg, /genreBadgeShadow/);
});

test('image route genre badge applies custom clean background opacity', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'anime',
      label: 'Anime',
      accentColor: '#7dd3fc',
      mode: 'text',
      style: 'clean',
      backgroundOpacity: 45,
    },
    'poster',
  );

  assert.match(spec.svg, /stop-color="rgba\(0,0,0,0\.24\)"/);
  assert.match(spec.svg, /stop-color="rgba\(0,0,0,0\.04\)"/);
});

test('image route genre badge applies no background outline for plain text style', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'anime',
      label: 'Anime',
      accentColor: '#7dd3fc',
      mode: 'text',
      style: 'plain',
      noBackgroundOutlineColor: '#111111',
      noBackgroundOutlineWidth: 2,
    },
    'poster',
  );

  assert.match(spec.svg, /stroke="#111111"/);
  assert.match(spec.svg, /stroke-width="2"/);
  assert.match(spec.svg, /paint-order="stroke fill"/);
});

test('image route genre badge builds square style output', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'crime',
      label: 'Crime',
      accentColor: '#fb7185',
      mode: 'icon',
      style: 'square',
      scalePercent: 120,
    },
    'backdrop',
  );

  assert.ok(spec.height >= 44);
  assert.match(spec.svg, /rgba\(8,11,16,0.88\)/);
});

test('image route genre badge centers the square cap over the label block', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'crime',
      label: 'Crime',
      accentColor: '#60a5fa',
      mode: 'both',
      style: 'square',
    },
    'poster',
  );

  const capMatch = spec.svg.match(/<rect x="(\d+)" y="6" width="(\d+)" height="\d+" rx="\d+" fill="#60a5fa"/);
  const textMatch = spec.svg.match(/<text x="(\d+)" y="\d+" text-anchor="middle" dominant-baseline="middle"[^>]*>CRIME<\/text>/);

  assert.ok(capMatch);
  assert.ok(textMatch);

  const capCenterX = Number.parseInt(capMatch[1], 10) + Number.parseInt(capMatch[2], 10) / 2;
  const textCenterX = Number.parseInt(textMatch[1], 10);

  assert.ok(Math.abs(capCenterX - textCenterX) <= 1);
});

test('image route genre badge builds glass style text output', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'documentary',
      label: 'Doc',
      accentColor: '#facc15',
      mode: 'text',
      style: 'glass',
    },
    'logo',
  );

  assert.ok(spec.width >= spec.height);
  assert.match(spec.svg, /stroke="#facc15"/);
  assert.match(spec.svg, /DOC/);
});

test('image route genre badge applies custom border width for glass style', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'documentary',
      label: 'Doc',
      accentColor: '#facc15',
      mode: 'text',
      style: 'glass',
      borderWidth: 0,
    },
    'poster',
  );

  assert.match(spec.svg, /stroke-width="0"/);
});

test('image route genre badge centers icon-only badges within the rendered width', () => {
  const spec = buildGenreBadgeSvg(
    {
      familyId: 'scifi',
      label: 'Sci Fi',
      accentColor: '#22d3ee',
      mode: 'icon',
      style: 'glass',
      scalePercent: 140,
    },
    'poster',
  );

  const translateMatch = spec.svg.match(/transform="translate\(([\d.]+) ([\d.]+)\) scale/);

  assert.ok(translateMatch);
  assert.ok(Math.abs(Number.parseFloat(translateMatch[1]) - spec.width / 2) <= 1);
});

test('genre badge at 4K scale produces taller badge than strict proportional equivalent', () => {
  const linearScale = Math.min(2000 / 580, 2926 / 859);
  const boostScale = Math.pow(linearScale, 1.15);
  const scalePercent = Math.max(1, Math.round(100 * boostScale));

  const specBoosted = buildGenreBadgeSvg(
    { familyId: 'anime', label: 'Anime', accentColor: '#7dd3fc', mode: 'both', style: 'glass', scalePercent },
    'poster',
  );
  const proportionalHeight = Math.round(40 * linearScale);
  assert.ok(
    specBoosted.height > proportionalHeight,
    `expected boosted height(${specBoosted.height}) > proportional(${proportionalHeight})`,
  );
});

test('BUG-66 genre badge icon padding scales proportionally at 4K scale', () => {
  const scalePercent = 350;
  const spec = buildGenreBadgeSvg(
    { familyId: 'anime', label: 'Anime', accentColor: '#7dd3fc', mode: 'both', style: 'glass', scalePercent },
    'poster',
  );
  const translateMatch = spec.svg.match(/transform="translate\(([\d.]+) ([\d.]+)\) scale/);
  assert.ok(translateMatch, 'icon transform should be present');
  const iconCenterX = Number.parseFloat(translateMatch[1]);
  const iconSize = Math.round(spec.height * 0.48);
  const iconX = iconCenterX - iconSize / 2;
  const minExpectedPadding = Math.round(spec.height * 0.25);
  assert.ok(
    iconX >= minExpectedPadding,
    `expected iconX (${iconX}) >= ${minExpectedPadding} for badge height ${spec.height} — icon is hugging the border`,
  );
});

test('BUG-66 genre badge icon gap stays proportional to badge height at 4K scale', () => {
  const normalSpec = buildGenreBadgeSvg(
    { familyId: 'action', label: 'Action', accentColor: '#f87171', mode: 'both', style: 'glass', scalePercent: 100 },
    'poster',
  );
  const largeSpec = buildGenreBadgeSvg(
    { familyId: 'action', label: 'Action', accentColor: '#f87171', mode: 'both', style: 'glass', scalePercent: 350 },
    'poster',
  );
  const normalPaddingRatio = (normalSpec.width - normalSpec.height) / normalSpec.height;
  const largePaddingRatio = (largeSpec.width - largeSpec.height) / largeSpec.height;
  assert.ok(
    Math.abs(largePaddingRatio - normalPaddingRatio) < 0.15,
    `expected width-to-height ratio to remain consistent across scales: normal ${normalPaddingRatio.toFixed(2)} vs 4K ${largePaddingRatio.toFixed(2)}`,
  );
});
