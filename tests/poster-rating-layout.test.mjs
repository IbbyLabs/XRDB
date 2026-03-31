import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describePosterRatingLayoutLimit,
  getPosterRatingLayoutMaxBadges,
  isSinglePosterRatingLayout,
  isVerticalPosterRatingLayout,
  getPosterRatingLayoutLimit,
  normalizePosterRatingLayout,
  normalizePosterRatingsMaxPerSide,
} from '../lib/posterLayoutOptions.ts';
import { normalizeSavedUiConfig } from '../lib/uiConfig.ts';

test('poster layout rows no longer apply fixed hard badge caps', () => {
  assert.equal(getPosterRatingLayoutLimit('top'), null);
  assert.equal(getPosterRatingLayoutLimit('bottom'), null);
  assert.equal(getPosterRatingLayoutLimit('top-bottom'), null);
});

test('badge max normalization preserves larger explicit values', () => {
  assert.equal(normalizePosterRatingsMaxPerSide(50), 50);

  const config = normalizeSavedUiConfig({
    settings: {
      posterQualityBadgesMax: 50,
      backdropQualityBadgesMax: 40,
      posterRatingsMaxPerSide: 30,
      logoRatingsMax: 25,
    },
  });

  assert.equal(config.settings.posterQualityBadgesMax, 50);
  assert.equal(config.settings.backdropQualityBadgesMax, 40);
  assert.equal(config.settings.posterRatingsMaxPerSide, 30);
  assert.equal(config.settings.logoRatingsMax, 25);
});

test('poster layout normalization accepts readable aliases', () => {
  assert.equal(normalizePosterRatingLayout('left right'), 'left-right');
  assert.equal(normalizePosterRatingLayout('TOP_BOTTOM'), 'top-bottom');
  assert.equal(normalizePosterRatingLayout('noise'), 'top-bottom');
});

test('poster layout helpers expose vertical and single side behavior', () => {
  assert.equal(isSinglePosterRatingLayout('top'), true);
  assert.equal(isSinglePosterRatingLayout('left-right'), false);
  assert.equal(isVerticalPosterRatingLayout('right'), true);
  assert.equal(isVerticalPosterRatingLayout('top-bottom'), false);
});

test('poster layout badge counts and descriptions stay stable', () => {
  assert.equal(getPosterRatingLayoutMaxBadges('left-right', 3), 7);
  assert.equal(getPosterRatingLayoutMaxBadges('top-bottom', 3), 3);
  assert.equal(describePosterRatingLayoutLimit('left-right', 3), 'up to 3 per side, plus 1 top-center');
  assert.equal(describePosterRatingLayoutLimit('top-bottom', null), 'all that fit across the top and bottom rows');
});
