import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDisplayRatingValue,
  normalizeRatingToHundredPointValue,
  normalizeRatingToTenPointValue,
  normalizeRatingValueMode,
} from '../lib/ratingDisplay.ts';

test('provider default rating display keeps native scales by default', () => {
  assert.equal(formatDisplayRatingValue('trakt', '9.2'), '9.2');
  assert.equal(formatDisplayRatingValue('trakt', '76'), '7.6');
  assert.equal(formatDisplayRatingValue('metacritic', '84'), '84');
  assert.equal(formatDisplayRatingValue('mdblist', '79'), '79');
  assert.equal(formatDisplayRatingValue('tomatoes', '93'), '93%');
  assert.equal(formatDisplayRatingValue('kitsu', '82'), '82%');
  assert.equal(formatDisplayRatingValue('letterboxd', '3.9'), '3.9');
  assert.equal(formatDisplayRatingValue('rogerebert', '3.5'), '3.5');
});

test('normalized display mode is opt in', () => {
  assert.equal(formatDisplayRatingValue('trakt', '73', { valueMode: 'normalized' }), '7.3');
  assert.equal(formatDisplayRatingValue('tomatoes', '93', { valueMode: 'normalized' }), '9.3');
  assert.equal(formatDisplayRatingValue('kitsu', '82', { valueMode: 'normalized' }), '8.2');
});

test('hundred point normalized display mode is opt in', () => {
  assert.equal(formatDisplayRatingValue('imdb', '7.8', { valueMode: 'normalized100' }), '78');
  assert.equal(formatDisplayRatingValue('tomatoes', '93', { valueMode: 'normalized100' }), '93');
  assert.equal(formatDisplayRatingValue('rogerebert', '3.5', { valueMode: 'normalized100' }), '88');
});

test('rating value mode normalization accepts supported options only', () => {
  assert.equal(normalizeRatingValueMode(undefined), 'native');
  assert.equal(normalizeRatingValueMode(' normalized '), 'normalized');
  assert.equal(normalizeRatingValueMode(' normalized-100 '), 'normalized100');
  assert.equal(normalizeRatingValueMode('unexpected', 'normalized'), 'normalized');
});

test('numeric normalization exports the 0 to 10 values used by aggregate modes', () => {
  assert.equal(normalizeRatingToTenPointValue('tomatoes', '93'), 9.3);
  assert.equal(normalizeRatingToTenPointValue('rogerebert', '3.5'), 8.75);
  assert.equal(normalizeRatingToTenPointValue('trakt', '76'), 7.6);
});

test('numeric normalization can export rounded 0 to 100 values for compact badges', () => {
  assert.equal(normalizeRatingToHundredPointValue('tomatoes', '93'), 93);
  assert.equal(normalizeRatingToHundredPointValue('rogerebert', '3.5'), 88);
  assert.equal(normalizeRatingToHundredPointValue('trakt', '76'), 76);
});
