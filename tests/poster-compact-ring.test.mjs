import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePosterCompactRingCenterOpacityPercent,
  normalizePosterCompactRingPriorityList,
  normalizePosterCompactRingSource,
  stringifyPosterCompactRingPriorityList,
} from '../lib/posterCompactRing.ts';

test('compact ring source normalization supports aggregate and priority aliases', () => {
  assert.equal(normalizePosterCompactRingSource('overall'), 'overall');
  assert.equal(normalizePosterCompactRingSource('critics'), 'critics');
  assert.equal(normalizePosterCompactRingSource('audience'), 'audience');
  assert.equal(normalizePosterCompactRingSource('priority-critics'), 'priority-critics');
  assert.equal(normalizePosterCompactRingSource('criticspriority'), 'priority-critics');
  assert.equal(normalizePosterCompactRingSource('priority_audience'), 'priority-audience');
});

test('compact ring priority list normalization dedupes and caps to three providers', () => {
  assert.deepEqual(
    normalizePosterCompactRingPriorityList('imdb,tmdb,imdb,tomatoes,metacritic', ['tmdb']),
    ['imdb', 'tmdb', 'tomatoes'],
  );
  assert.deepEqual(
    normalizePosterCompactRingPriorityList('', ['tomatoes', 'imdb', 'tmdb']),
    ['tomatoes', 'imdb', 'tmdb'],
  );
  assert.equal(
    stringifyPosterCompactRingPriorityList(['tomatoes', 'imdb', 'tmdb', 'metacritic']),
    'tomatoes,imdb,tmdb',
  );
});

test('compact ring center opacity normalization clamps and rounds to 0 through 100', () => {
  assert.equal(normalizePosterCompactRingCenterOpacityPercent(undefined), 86);
  assert.equal(normalizePosterCompactRingCenterOpacityPercent(null), 86);
  assert.equal(normalizePosterCompactRingCenterOpacityPercent('33.2'), 33);
  assert.equal(normalizePosterCompactRingCenterOpacityPercent('33.8'), 34);
  assert.equal(normalizePosterCompactRingCenterOpacityPercent('-5'), 0);
  assert.equal(normalizePosterCompactRingCenterOpacityPercent('150'), 100);
  assert.equal(normalizePosterCompactRingCenterOpacityPercent(''), 86);
});
