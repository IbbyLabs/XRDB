import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeWeightedAverage,
  normalizeAggregateProviderWeights,
  stringifyAggregateProviderWeights,
  isDefaultAggregateProviderWeights,
} from '../lib/ratingPresentation.ts';

test('computeWeightedAverage returns 0 for empty entries', () => {
  assert.equal(computeWeightedAverage([], {}), 0);
  assert.equal(computeWeightedAverage([], { imdb: 50 }), 0);
});

test('computeWeightedAverage uses equal mean when weights map is empty', () => {
  const entries = [
    { provider: 'imdb', value: 80 },
    { provider: 'tmdb', value: 60 },
    { provider: 'metacritic', value: 70 },
  ];
  assert.equal(computeWeightedAverage(entries, {}), 70);
});

test('computeWeightedAverage applies custom weights correctly', () => {
  const entries = [
    { provider: 'imdb', value: 80 },
    { provider: 'tmdb', value: 60 },
  ];
  const weights = { imdb: 3, tmdb: 1 };
  assert.equal(computeWeightedAverage(entries, weights), (80 * 3 + 60 * 1) / 4);
});

test('computeWeightedAverage uses weight 1 for providers not in the weights map', () => {
  const entries = [
    { provider: 'imdb', value: 80 },
    { provider: 'tmdb', value: 60 },
  ];
  const weights = { imdb: 2 };
  assert.equal(computeWeightedAverage(entries, weights), (80 * 2 + 60 * 1) / 3);
});

test('computeWeightedAverage falls back to equal mean when all weights sum to 0', () => {
  const entries = [
    { provider: 'imdb', value: 80 },
    { provider: 'tmdb', value: 60 },
  ];
  const weights = { imdb: 0, tmdb: 0 };
  assert.equal(computeWeightedAverage(entries, weights), 70);
});

test('computeWeightedAverage handles single entry', () => {
  const entries = [{ provider: 'imdb', value: 75 }];
  assert.equal(computeWeightedAverage(entries, {}), 75);
  assert.equal(computeWeightedAverage(entries, { imdb: 50 }), 75);
});

test('normalizeAggregateProviderWeights parses valid string', () => {
  assert.deepEqual(normalizeAggregateProviderWeights('imdb:50,tmdb:30'), { imdb: 50, tmdb: 30 });
});

test('normalizeAggregateProviderWeights accepts plain object (saved profile format)', () => {
  assert.deepEqual(normalizeAggregateProviderWeights({ imdb: 50, tmdb: 30 }), { imdb: 50, tmdb: 30 });
});

test('normalizeAggregateProviderWeights returns empty object for empty or invalid input', () => {
  assert.deepEqual(normalizeAggregateProviderWeights(''), {});
  assert.deepEqual(normalizeAggregateProviderWeights(null), {});
  assert.deepEqual(normalizeAggregateProviderWeights(undefined), {});
  assert.deepEqual(normalizeAggregateProviderWeights(42), {});
});

test('normalizeAggregateProviderWeights clamps values to 0-1000', () => {
  assert.deepEqual(normalizeAggregateProviderWeights('imdb:-5,tmdb:2000'), { imdb: 0, tmdb: 1000 });
});

test('normalizeAggregateProviderWeights skips malformed parts', () => {
  assert.deepEqual(normalizeAggregateProviderWeights('imdb:50,badpart,tmdb:30'), { imdb: 50, tmdb: 30 });
});

test('stringifyAggregateProviderWeights serializes weights to string', () => {
  assert.equal(stringifyAggregateProviderWeights({ imdb: 50, tmdb: 30 }), 'imdb:50,tmdb:30');
});

test('stringifyAggregateProviderWeights returns empty string for empty map', () => {
  assert.equal(stringifyAggregateProviderWeights({}), '');
});

test('isDefaultAggregateProviderWeights returns true for empty map', () => {
  assert.equal(isDefaultAggregateProviderWeights({}), true);
});

test('isDefaultAggregateProviderWeights returns false for non-empty map', () => {
  assert.equal(isDefaultAggregateProviderWeights({ imdb: 50 }), false);
});
