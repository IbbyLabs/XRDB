import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BACKDROP_RATING_LAYOUT_OPTIONS,
  isVerticalBackdropRatingLayout,
  normalizeBackdropRatingLayout,
} from '../lib/backdropLayoutOptions.ts';

test('backdrop layout normalization accepts aliases and falls back safely', () => {
  assert.equal(normalizeBackdropRatingLayout('right vertical'), 'right-vertical');
  assert.equal(normalizeBackdropRatingLayout('RIGHT_VERTICAL'), 'right-vertical');
  assert.equal(normalizeBackdropRatingLayout('noise'), 'center');
});

test('backdrop layout catalog exposes the vertical option', () => {
  assert.ok(BACKDROP_RATING_LAYOUT_OPTIONS.some((option) => option.id === 'right-vertical'));
  assert.equal(isVerticalBackdropRatingLayout('right-vertical'), true);
  assert.equal(isVerticalBackdropRatingLayout('center'), false);
});
