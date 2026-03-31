import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_BADGE_MIN_METRICS,
  estimateRenderedBadgeWidth,
  estimateBadgeTextWidth,
  estimateBadgeWidth,
  estimateSummaryLabelWidth,
  getMinimumCompressedRenderedBadgeWidth,
  getBadgeHeightFromMetrics,
  getBadgeTextRightInset,
  getSummaryBadgeHorizontalMetrics,
  resolveBadgeIconRenderSize,
  scaleBadgeMetrics,
} from '../lib/imageRouteBadgeMetrics.ts';

test('image route badge metrics scale and clamp minimum values', () => {
  const scaled = scaleBadgeMetrics(DEFAULT_BADGE_MIN_METRICS, 50, 0.5);

  assert.deepEqual(scaled, {
    iconSize: 18,
    fontSize: 14,
    paddingX: 6,
    paddingY: 5,
    gap: 4,
  });
});

test('image route badge metrics derive stacked and standard heights', () => {
  assert.equal(getBadgeHeightFromMetrics(DEFAULT_BADGE_MIN_METRICS, 'glass'), 36);
  assert.ok(getBadgeHeightFromMetrics(DEFAULT_BADGE_MIN_METRICS, 'stacked') > 36);
});

test('image route badge metrics size icons and right insets predictably', () => {
  assert.equal(resolveBadgeIconRenderSize({ iconSlotSize: 24, badgeHeight: 36, iconScalePercent: 200 }), 32);
  assert.equal(getBadgeTextRightInset('84%', 18, 8, false), 25);
});

test('image route badge metrics estimate text widths conservatively', () => {
  assert.ok(estimateBadgeTextWidth('84', 18, false) >= 29);
  assert.ok(estimateBadgeTextWidth('84%', 18, false) > estimateBadgeTextWidth('84', 18, false));
  assert.ok(estimateBadgeTextWidth('', 18, true) >= 21);
});

test('image route badge metrics estimate stacked and standard badge widths', () => {
  const standardWidth = estimateBadgeWidth('84%', 18, 8, 24, 6, false, 'glass');
  const stackedWidth = estimateBadgeWidth('84%', 18, 8, 24, 6, false, 'stacked');

  assert.ok(standardWidth > stackedWidth);
  assert.ok(stackedWidth >= Math.round(18 * 2.45));
});

test('image route badge metrics build summary label metrics and rendered widths', () => {
  const summary = getSummaryBadgeHorizontalMetrics('IMDb', 18, 8);
  const standardWidth = estimateRenderedBadgeWidth(
    { value: '84', label: 'IMDb', variant: 'standard', stackedWidthPercent: 100 },
    18,
    8,
    24,
    6,
    false,
    'glass',
  );
  const summaryWidth = estimateRenderedBadgeWidth(
    { value: '84', label: 'IMDb', variant: 'summary', stackedWidthPercent: 100 },
    18,
    8,
    24,
    6,
    false,
    'glass',
  );

  assert.equal(summary.summaryLabel, 'IMDB');
  assert.ok(estimateSummaryLabelWidth('IMDb', 12) > 0);
  assert.ok(summaryWidth > standardWidth);
});

test('image route badge metrics derive compressed widths for standard and minimal badges', () => {
  const standard = getMinimumCompressedRenderedBadgeWidth(
    { value: '84', label: 'IMDb', variant: 'standard', stackedWidthPercent: 100 },
    18,
    8,
    24,
    6,
    false,
    'stacked',
  );
  const minimal = getMinimumCompressedRenderedBadgeWidth(
    { value: '84', label: 'IMDb', variant: 'minimal', stackedWidthPercent: 100 },
    18,
    8,
    24,
    6,
    false,
    'glass',
  );

  assert.ok(standard >= Math.round(18 * 1.72));
  assert.ok(minimal >= 24);
});
