import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_BADGE_MIN_METRICS } from '../lib/imageRouteBadgeMetrics.ts';
import {
  fitBadgeMetricsToHeight,
  getBackdropBadgeRegion,
  getMaxBadgeColumnCount,
  measureBadgeColumnHeight,
  resolveVerticalBadgeColumnStartY,
  splitPosterBadgesByLayout,
} from '../lib/imageRouteBadgeColumns.ts';

const sampleBadges = [
  { value: '84', label: 'IMDb', variant: 'standard', stackedWidthPercent: 100 },
  { value: '91%', label: 'RT', variant: 'summary', stackedWidthPercent: 100 },
  { value: '7.4', label: 'TMDB', variant: 'standard', stackedWidthPercent: 100 },
];

test('image route badge columns measure height and resolve vertical placement', () => {
  const height = measureBadgeColumnHeight(sampleBadges, DEFAULT_BADGE_MIN_METRICS, 'glass');
  const startY = resolveVerticalBadgeColumnStartY({
    outputHeight: 600,
    columnHeight: height,
    topOffset: 20,
    bottomOffset: 20,
    position: 'middle',
    customOffset: 50,
  });

  assert.ok(height > 0);
  assert.ok(startY >= 20);
});

test('image route badge columns derive max column counts and fitted metrics', () => {
  const maxCount = getMaxBadgeColumnCount(500, DEFAULT_BADGE_MIN_METRICS, 20, 20, 1, 'glass');
  const fitted = fitBadgeMetricsToHeight([sampleBadges], 180, {
    iconSize: 36,
    fontSize: 28,
    paddingX: 12,
    paddingY: 10,
    gap: 10,
  }, 12, 12);

  assert.ok(maxCount >= 1);
  assert.ok(fitted.iconSize <= 36);
  assert.ok(fitted.fontSize <= 28);
});

test('image route badge columns split poster layouts and backdrop regions predictably', () => {
  const leftRight = splitPosterBadgesByLayout(sampleBadges, 'left-right', 2);
  const region = getBackdropBadgeRegion(1200, 'right');

  assert.equal(leftRight.leftBadges.length + leftRight.rightBadges.length + leftRight.topBadges.length, 3);
  assert.ok(region.left > 0);
  assert.ok(region.width > 0);
});
