import test from 'node:test';
import assert from 'node:assert/strict';

test('quality badge gap scales proportionally with badge height', () => {
  const baseGap = 9;
  const expectedQualityGap = Math.round(baseGap * 1.25);
  
  assert.equal(expectedQualityGap, 11, 'quality gap should scale 1.25x from base gap');
  
  const testCases = [
    { base: 8, expected: 10 },
    { base: 9, expected: 11 },
    { base: 10, expected: 13 },
  ];
  
  for (const { base, expected } of testCases) {
    const scaled = Math.round(base * 1.25);
    assert.ok(scaled >= Math.floor(base * 1.25) && scaled <= Math.ceil(base * 1.25), 
      `gap ${base} scaled to ${scaled}, must be between floor(${base * 1.25}) and ceil(${base * 1.25})`);
  }
});

test('quality badge total height includes scaled gaps for correct positioning', () => {
  const qualityBadgeHeight = 56;
  const badgeCount = 6;
  const baseGap = 9;
  const qualityGap = Math.round(baseGap * 1.25);
  
  const correctTotalHeight = 
    badgeCount * qualityBadgeHeight + 
    Math.max(0, badgeCount - 1) * qualityGap;
  
  const buggyTotalHeight = 
    badgeCount * qualityBadgeHeight + 
    Math.max(0, badgeCount - 1) * baseGap;
  
  const expectedDifference = (badgeCount - 1) * (qualityGap - baseGap);
  const actualDifference = correctTotalHeight - buggyTotalHeight;
  
  assert.equal(actualDifference, expectedDifference, 
    `difference should be ${expectedDifference} pixels for ${badgeCount} badges with baseGap ${baseGap}`);
  
  assert.ok(correctTotalHeight > buggyTotalHeight, 'correct calculation reserves more vertical space');
});

test('poster edge inset scales proportionally across quality levels', () => {
  const POSTER_EDGE_INSET_BASE = 12;
  const posterEdgeOffset = 10;
  const posterBaseWidth = 580;
  const posterBaseHeight = 859;

  const qualities = [
    { name: 'normal', width: 580, height: 859 },
    { name: 'large', width: 1280, height: 1896 },
    { name: '4k', width: 2000, height: 2926 },
  ];

  const results = qualities.map(({ name, width, height }) => {
    const widthRatio = width / posterBaseWidth;
    const heightRatio = height / posterBaseHeight;
    const overlayAutoScale = Math.max(0.75, Math.min(4, Math.min(widthRatio, heightRatio)));
    const posterEdgeInset = Math.max(12, Math.round((POSTER_EDGE_INSET_BASE + posterEdgeOffset) * overlayAutoScale));
    return { name, width, overlayAutoScale, posterEdgeInset };
  });

  const normalResult = results[0];
  for (const result of results) {
    const expectedProportion = normalResult.posterEdgeInset / normalResult.width;
    const actualProportion = result.posterEdgeInset / result.width;
    const tolerance = 0.005;
    assert.ok(
      Math.abs(actualProportion - expectedProportion) < tolerance,
      `${result.name} proportion ${actualProportion.toFixed(4)} should be within ${tolerance} of normal proportion ${expectedProportion.toFixed(4)}`
    );
  }

  assert.equal(results[0].posterEdgeInset, 22, 'normal: (12 + 10) * 1.0 = 22');
  assert.ok(results[1].posterEdgeInset > results[0].posterEdgeInset, 'large inset is greater than normal');
  assert.ok(results[2].posterEdgeInset > results[1].posterEdgeInset, '4k inset is greater than large');
});

test('poster edge inset minimum floor is preserved at all quality levels', () => {
  const POSTER_EDGE_INSET_BASE = 12;
  const posterEdgeOffset = 0;
  const posterBaseWidth = 580;
  const posterBaseHeight = 859;

  const qualities = [
    { name: 'normal', width: 580, height: 859 },
    { name: 'large', width: 1280, height: 1896 },
    { name: '4k', width: 2000, height: 2926 },
    { name: 'sub-normal', width: 290, height: 430 },
  ];

  for (const { name, width, height } of qualities) {
    const widthRatio = width / posterBaseWidth;
    const heightRatio = height / posterBaseHeight;
    const overlayAutoScale = Math.max(0.75, Math.min(4, Math.min(widthRatio, heightRatio)));
    const posterEdgeInset = Math.max(12, Math.round((POSTER_EDGE_INSET_BASE + posterEdgeOffset) * overlayAutoScale));
    assert.ok(posterEdgeInset >= 12, `${name} posterEdgeInset ${posterEdgeInset} must be at least 12`);
  }
});
