import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveQualityBadgeColumnLayout,
  resolveQualityBadgeGap,
  resolveQualityBadgeHeight,
} from '../lib/qualityBadgeLayout.ts';

test('quality badge column keeps preferred size when there is enough room', () => {
  const result = resolveQualityBadgeColumnLayout({
    referenceBadgeHeight: 64,
    qualityBadgeScalePercent: 100,
    badgeGap: 9,
    badgeCount: 4,
    availableHeight: 400,
  });

  assert.equal(result.height, 64);
  assert.equal(result.gap, 10);
  assert.equal(result.totalHeight, 286);
});

test('quality badge column shrinks when the stack would overflow the poster', () => {
  const result = resolveQualityBadgeColumnLayout({
    referenceBadgeHeight: 82,
    qualityBadgeScalePercent: 100,
    badgeGap: 10,
    badgeCount: 7,
    availableHeight: 300,
  });

  assert.ok(result.height < 88);
  assert.ok(result.gap <= 13);
  assert.ok(result.totalHeight <= 300);
});

test('quality badge preferred height scales proportionally for larger poster metrics', () => {
  assert.equal(
    resolveQualityBadgeHeight({
      referenceBadgeHeight: 96,
      qualityBadgeScalePercent: 100,
      layout: 'column',
    }),
    96,
  );
  assert.equal(
    resolveQualityBadgeHeight({
      referenceBadgeHeight: 96,
      qualityBadgeScalePercent: 100,
      layout: 'row',
    }),
    98,
  );
});

test('quality badge row height follows the fitted rating badge height', () => {
  assert.equal(
    resolveQualityBadgeHeight({
      referenceBadgeHeight: 68,
      qualityBadgeScalePercent: 100,
      layout: 'row',
    }),
    69,
  );
});

test('quality badge gap stays compact for rows and columns', () => {
  assert.equal(resolveQualityBadgeGap({ badgeGap: 9, layout: 'column' }), 10);
  assert.equal(resolveQualityBadgeGap({ badgeGap: 9, layout: 'row' }), 11);
});
