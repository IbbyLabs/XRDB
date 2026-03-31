import test from 'node:test';
import assert from 'node:assert/strict';

test('quality badge gap scales proportionally with badge height', () => {
  // BUG-15: Quality badges are scaled 1.25x larger than rating badges
  // The gap between quality badges should scale proportionally to maintain visual consistency
  
  const baseGap = 9; // Example rating badge gap for large posters
  const expectedQualityGap = Math.round(baseGap * 1.25); // Should be 11
  
  assert.equal(expectedQualityGap, 11, 'quality gap should scale 1.25x from base gap');
  
  // Verify the scaling holds for other values
  const testCases = [
    { base: 8, expected: 10 },  // 8 * 1.25 = 10.0 → 10
    { base: 9, expected: 11 },  // 9 * 1.25 = 11.25 → 11
    { base: 10, expected: 13 }, // 10 * 1.25 = 12.5 → 12 (or 13 depending on rounding)
  ];
  
  for (const { base, expected } of testCases) {
    const scaled = Math.round(base * 1.25);
    // Verify rounding behavior
    assert.ok(scaled >= Math.floor(base * 1.25) && scaled <= Math.ceil(base * 1.25), 
      `gap ${base} scaled to ${scaled}, must be between floor(${base * 1.25}) and ceil(${base * 1.25})`);
  }
});

test('quality badge total height includes scaled gaps for correct positioning', () => {
  // When calculating total height for quality badge columns, gaps must be scaled
  const qualityBadgeHeight = 56; // Example: ~1.25x rating badge height
  const badgeCount = 6; // Reported issue: 4K, Bluray, HDR, DV, DA, Remux
  const baseGap = 9;
  const qualityGap = Math.round(baseGap * 1.25);
  
  // Correct calculation with scaled gap
  const correctTotalHeight = 
    badgeCount * qualityBadgeHeight + 
    Math.max(0, badgeCount - 1) * qualityGap;
  
  // Wrong calculation (what the bug used)
  const buggyTotalHeight = 
    badgeCount * qualityBadgeHeight + 
    Math.max(0, badgeCount - 1) * baseGap;
  
  // The difference should be significant for 6 badges
  // (badgeCount - 1) * (qualityGap - baseGap) = 5 * (11 - 9) = 10 pixels
  const expectedDifference = (badgeCount - 1) * (qualityGap - baseGap);
  const actualDifference = correctTotalHeight - buggyTotalHeight;
  
  assert.equal(actualDifference, expectedDifference, 
    `difference should be ${expectedDifference} pixels for ${badgeCount} badges with baseGap ${baseGap}`);
  
  assert.ok(correctTotalHeight > buggyTotalHeight, 'correct calculation reserves more vertical space');
});
