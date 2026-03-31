import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RATING_STYLE_OPTIONS,
  normalizeRatingStyle,
  QUALITY_BADGE_STYLE_OPTIONS,
  normalizeQualityBadgeStyle,
} from '../lib/ratingAppearance.ts';

test('rating style normalizer keeps supported styles and falls back on unknown values', () => {
  assert.equal(normalizeRatingStyle('stacked'), 'stacked');
  assert.equal(normalizeRatingStyle(' Plain '), 'plain');
  assert.equal(normalizeRatingStyle('noise'), 'glass');
});

test('rating style options keep the expected stacked entry', () => {
  assert.ok(
    RATING_STYLE_OPTIONS.some((option) => option.id === 'stacked' && option.label === 'Stacked'),
  );
});

test('quality badge style normalizer accepts silver marks', () => {
  assert.equal(normalizeQualityBadgeStyle('silver'), 'silver');
  assert.equal(normalizeQualityBadgeStyle(' Silver '), 'silver');
});

test('quality badge style options expose silver marks in the UI list', () => {
  assert.ok(
    QUALITY_BADGE_STYLE_OPTIONS.some((option) => option.id === 'silver' && option.label === 'Silver Marks'),
  );
});
