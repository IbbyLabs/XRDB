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

test('quality badge controls expose age rating placement support only for supported poster layouts', async () => {
  const controlsModule = await importFresh('../lib/qualityBadgeControls.ts');

  assert.equal(controlsModule.supportsPosterAgeRatingBadgePlacement('left'), true);
  assert.equal(controlsModule.supportsPosterAgeRatingBadgePlacement('right'), true);
  assert.equal(controlsModule.supportsPosterAgeRatingBadgePlacement('left-right'), true);
  assert.equal(controlsModule.supportsPosterAgeRatingBadgePlacement('top'), true);
  assert.equal(controlsModule.supportsPosterAgeRatingBadgePlacement('bottom'), true);
  assert.equal(controlsModule.supportsPosterAgeRatingBadgePlacement('top-bottom'), true);
});

test('quality badge controls expose layout scoped age rating anchors and shared quality badge detection', async () => {
  const controlsModule = await importFresh('../lib/qualityBadgeControls.ts');

  assert.deepEqual(controlsModule.getSupportedPosterAgeRatingBadgePositions('top'), [
    'top-left',
    'top-center',
    'top-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ]);
  assert.equal(
    controlsModule.isSupportedPosterAgeRatingBadgePosition('left', 'left-center'),
    true,
  );
  assert.equal(
    controlsModule.isSupportedPosterAgeRatingBadgePosition('left', 'top-center'),
    false,
  );
  assert.equal(
    controlsModule.hasNonCertificationQualityBadgePreferences(['certification']),
    false,
  );
  assert.equal(
    controlsModule.hasNonCertificationQualityBadgePreferences(['certification', 'hdr']),
    true,
  );
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