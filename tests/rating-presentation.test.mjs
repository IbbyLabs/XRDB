import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  DEFAULT_AGGREGATE_ACCENT_MODE,
  DEFAULT_AGGREGATE_DYNAMIC_STOPS,
  normalizeAggregateDynamicStops,
  normalizeAggregateAccentBarOffset,
  normalizeAggregateAccentMode,
  parseAggregateDynamicStops,
  resolveAggregateDynamicAccentColor,
  hasAggregateRatingProvidersForSource,
  normalizeAggregateRatingSource,
  normalizeRatingPresentation,
  preservesSelectedRatingLayout,
  resolveEffectiveRatingPresentation,
  resolveBackdropRatingLayoutForPresentation,
  resolveLogoRatingsMaxForPresentation,
  resolvePosterRatingLayoutForPresentation,
  resolvePosterRatingsMaxPerSideForPresentation,
  selectAggregateRatingProviders,
  usesAggregateAccentBar,
  usesDualAggregateRatingPresentation,
  usesAggregateRatingPresentation,
  usesAggregateRatingSource,
  usesCompactRingPresentation,
} from '../lib/ratingPresentation.ts';

test('presentation modes normalize to supported values', () => {
  assert.equal(normalizeRatingPresentation('minimal'), 'minimal');
  assert.equal(normalizeRatingPresentation('DUAL'), 'dual');
  assert.equal(normalizeRatingPresentation('dual-minimal'), 'dual-minimal');
  assert.equal(normalizeRatingPresentation('compact-dual'), 'dual-minimal');
  assert.equal(normalizeRatingPresentation('EDITORIAL'), 'editorial');
  assert.equal(normalizeRatingPresentation('BLOCKBUSTER'), 'blockbuster');
  assert.equal(normalizeRatingPresentation('RING'), 'ring');
  assert.equal(normalizeRatingPresentation('unknown'), 'standard');
});

test('aggregate rating sources normalize to supported values', () => {
  assert.equal(normalizeAggregateRatingSource('critics'), 'critics');
  assert.equal(normalizeAggregateRatingSource('AUDIENCE'), 'audience');
  assert.equal(normalizeAggregateRatingSource('bad-input'), 'overall');
});

test('aggregate source helpers distinguish summary modes and preferred providers', () => {
  assert.equal(usesAggregateRatingSource('standard'), false);
  assert.equal(usesAggregateRatingPresentation('dual'), true);
  assert.equal(usesAggregateRatingPresentation('dual-minimal'), true);
  assert.equal(usesAggregateRatingSource('dual'), false);
  assert.equal(usesAggregateRatingSource('dual-minimal'), false);
  assert.equal(usesAggregateAccentBar('dual'), true);
  assert.equal(usesAggregateAccentBar('dual-minimal'), true);
  assert.equal(usesDualAggregateRatingPresentation('dual'), true);
  assert.equal(usesDualAggregateRatingPresentation('dual-minimal'), true);
  assert.equal(usesDualAggregateRatingPresentation('minimal'), false);
  assert.equal(usesCompactRingPresentation('ring'), true);
  assert.equal(usesCompactRingPresentation('average'), false);
  assert.equal(usesAggregateRatingSource('minimal'), true);
  assert.equal(usesAggregateRatingSource('editorial'), true);
  assert.deepEqual(
    selectAggregateRatingProviders('critics', ['imdb', 'tomatoes', 'metacriticuser']),
    ['tomatoes'],
  );
  assert.deepEqual(
    selectAggregateRatingProviders('audience', ['rogerebert', 'metacritic']),
    ['rogerebert', 'metacritic'],
  );
  assert.equal(
    hasAggregateRatingProvidersForSource('audience', ['rogerebert', 'metacritic']),
    false,
  );
});

test('aggregate accent helpers normalize mode and clamp bar offsets', () => {
  assert.equal(normalizeAggregateAccentMode('genre'), 'genre');
  assert.equal(normalizeAggregateAccentMode('CUSTOM'), 'custom');
  assert.equal(normalizeAggregateAccentMode('dynamic'), 'dynamic');
  assert.equal(normalizeAggregateAccentMode('unknown'), DEFAULT_AGGREGATE_ACCENT_MODE);
  assert.equal(normalizeAggregateAccentBarOffset('-3'), -3);
  assert.equal(normalizeAggregateAccentBarOffset('-40'), -12);
  assert.equal(normalizeAggregateAccentBarOffset('40'), 12);
  assert.equal(
    normalizeAggregateAccentBarOffset('not-a-number'),
    DEFAULT_AGGREGATE_ACCENT_BAR_OFFSET,
  );
});

test('dynamic aggregate accent helpers normalize and resolve score stop colors', () => {
  const normalized = normalizeAggregateDynamicStops(
    '85:#16a34a, 40:#dc2626, 0:#7f1d1d, bad, 60:#f59e0b, 75:#84cc16',
  );
  assert.equal(normalized, DEFAULT_AGGREGATE_DYNAMIC_STOPS);
  const stops = parseAggregateDynamicStops(normalized);
  assert.equal(stops.length, 5);
  assert.equal(resolveAggregateDynamicAccentColor(12, stops), '#7f1d1d');
  assert.equal(resolveAggregateDynamicAccentColor(61, stops), '#f59e0b');
  assert.equal(resolveAggregateDynamicAccentColor(99, stops), '#16a34a');
});

test('non-blockbuster presentations preserve selected placement controls', () => {
  assert.equal(preservesSelectedRatingLayout('standard'), true);
  assert.equal(preservesSelectedRatingLayout('dual'), true);
  assert.equal(preservesSelectedRatingLayout('dual-minimal'), true);
  assert.equal(resolvePosterRatingLayoutForPresentation('minimal', 'top'), 'top');
  assert.equal(resolvePosterRatingLayoutForPresentation('dual', 'bottom'), 'bottom');
  assert.equal(resolvePosterRatingLayoutForPresentation('dual-minimal', 'bottom'), 'bottom');
  assert.equal(resolveBackdropRatingLayoutForPresentation('average', 'center'), 'center');
  assert.equal(resolveBackdropRatingLayoutForPresentation('dual', 'right'), 'right');
  assert.equal(resolveBackdropRatingLayoutForPresentation('dual-minimal', 'right'), 'right');
  assert.equal(resolvePosterRatingsMaxPerSideForPresentation('average', 5), 5);
  assert.equal(resolveLogoRatingsMaxForPresentation('minimal', 3), 3);
});

test('editorial keeps aggregate behavior but only renders as a unique poster mode', () => {
  assert.equal(preservesSelectedRatingLayout('editorial'), false);
  assert.equal(resolveEffectiveRatingPresentation('editorial', 'poster'), 'editorial');
  assert.equal(resolveEffectiveRatingPresentation('editorial', 'backdrop'), 'average');
  assert.equal(resolveEffectiveRatingPresentation('editorial', 'logo'), 'average');
  assert.equal(resolveEffectiveRatingPresentation('dual', 'poster'), 'dual');
  assert.equal(resolveEffectiveRatingPresentation('dual-minimal', 'poster'), 'dual-minimal');
});

test('compact ring keeps poster layout controls saved but only renders as a poster mode', () => {
  assert.equal(preservesSelectedRatingLayout('ring'), false);
  assert.equal(resolveEffectiveRatingPresentation('ring', 'poster'), 'ring');
  assert.equal(resolveEffectiveRatingPresentation('ring', 'backdrop'), 'average');
  assert.equal(resolveEffectiveRatingPresentation('ring', 'logo'), 'average');
  assert.equal(resolvePosterRatingLayoutForPresentation('ring', 'top'), 'top');
  assert.equal(resolvePosterRatingsMaxPerSideForPresentation('ring', 5), 5);
});

test('blockbuster uses fixed placement defaults', () => {
  assert.equal(preservesSelectedRatingLayout('blockbuster'), false);
  assert.equal(resolvePosterRatingLayoutForPresentation('blockbuster', 'bottom'), 'left-right');
  assert.equal(
    resolveBackdropRatingLayoutForPresentation('blockbuster', 'center'),
    'right-vertical',
  );
  assert.equal(resolvePosterRatingsMaxPerSideForPresentation('blockbuster', 5), null);
  assert.equal(resolveLogoRatingsMaxForPresentation('blockbuster', 3), null);
});
