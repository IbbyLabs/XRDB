import test from 'node:test';
import assert from 'node:assert/strict';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

test('quality badge controls resolve placement mode from preview type and poster layout', async () => {
  const controlsModule = await importFresh('../lib/qualityBadgeControls.ts');

  assert.equal(controlsModule.resolveQualityBadgePlacementControlMode('poster', 'top'), 'position');
  assert.equal(controlsModule.resolveQualityBadgePlacementControlMode('poster', 'bottom'), 'position');
  assert.equal(controlsModule.resolveQualityBadgePlacementControlMode('poster', 'top-bottom'), 'side');
  assert.equal(controlsModule.resolveQualityBadgePlacementControlMode('poster', 'left-right'), null);
  assert.equal(controlsModule.resolveQualityBadgePlacementControlMode('backdrop', 'top'), null);
});

test('quality badge controls return an isolated list of all badge preferences', async () => {
  const controlsModule = await importFresh('../lib/qualityBadgeControls.ts');
  const badgeCustomizationModule = await importFresh('../lib/badgeCustomization.ts');

  const first = controlsModule.getAllQualityBadgePreferenceIds();
  const second = controlsModule.getAllQualityBadgePreferenceIds();

  assert.deepEqual(first, badgeCustomizationModule.QUALITY_BADGE_OPTIONS.map(({ id }) => id));
  first.pop();
  assert.deepEqual(second, badgeCustomizationModule.QUALITY_BADGE_OPTIONS.map(({ id }) => id));
});