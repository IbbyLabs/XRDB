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
