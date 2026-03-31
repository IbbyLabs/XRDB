import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEditorialRatingOverlaySvg,
  computeEditorialRatingOverlayLayout,
} from '../lib/editorialRatingOverlay.ts';

test('editorial overlay keeps the score below the eyebrow and inside the poster safe zone', () => {
  const layout = computeEditorialRatingOverlayLayout({
    outputWidth: 500,
    outputHeight: 750,
    eyebrowText: 'Sci Fi',
    valueText: '8.3',
    accentColor: '#22d3ee',
  });

  assert.equal(layout.left >= 18, true);
  assert.equal(layout.top >= 16, true);
  assert.equal(layout.valueY > layout.eyebrowY, true);
  assert.equal(layout.width < 220, true);
  assert.equal(layout.height < 120, true);
});

test('editorial overlay svg renders text without requiring an eyebrow label', () => {
  const overlay = buildEditorialRatingOverlaySvg({
    outputWidth: 500,
    outputHeight: 750,
    valueText: '7.6',
    accentColor: '#a78bfa',
  });

  assert.equal(overlay.svg.includes('7.6'), true);
  assert.equal(overlay.svg.includes('editorial-score-shadow'), true);
  assert.equal(overlay.width > 0, true);
  assert.equal(overlay.height > 0, true);
});
