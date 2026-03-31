import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_BADGE_MIN_METRICS } from '../lib/imageRouteBadgeMetrics.ts';
import {
  fitBadgeMetricsToWidth,
  measureBadgeRowWidth,
  splitBadgesAcrossRowCount,
  splitBadgesIntoFittingRows,
} from '../lib/imageRouteBadgeRows.ts';

const sampleBadges = [
  { value: '84', label: 'IMDb', variant: 'standard', stackedWidthPercent: 100 },
  { value: '91%', label: 'RT', variant: 'summary', stackedWidthPercent: 100 },
  { value: '7.4', label: 'TMDB', variant: 'standard', stackedWidthPercent: 100 },
];

test('image route badge rows measure row widths using shared metrics', () => {
  const width = measureBadgeRowWidth(sampleBadges, DEFAULT_BADGE_MIN_METRICS, false, 'glass');

  assert.ok(width > 0);
});

test('image route badge rows split arrays across requested row counts', () => {
  const rows = splitBadgesAcrossRowCount(sampleBadges, 2);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], sampleBadges.slice(0, 2));
  assert.deepEqual(rows[1], sampleBadges.slice(2));
});

test('image route badge rows split badges into fitting rows when width is constrained', () => {
  const rows = splitBadgesIntoFittingRows(sampleBadges, 180, DEFAULT_BADGE_MIN_METRICS, false, 'glass');

  assert.ok(rows.length >= 2);
  assert.deepEqual(rows.flat(), sampleBadges);
});

test('image route badge rows shrink metrics to fit bounded widths', () => {
  const rows = [sampleBadges];
  const fitted = fitBadgeMetricsToWidth(rows, 180, {
    iconSize: 36,
    fontSize: 28,
    paddingX: 14,
    paddingY: 10,
    gap: 10,
  });

  assert.ok(fitted.iconSize <= 36);
  assert.ok(fitted.fontSize <= 28);
  assert.ok(fitted.paddingX <= 14);
});
