import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAnimeMappingSeason } from '../lib/animeMapping.ts';

test('anime mapping season normalization accepts numeric values', () => {
  assert.equal(normalizeAnimeMappingSeason(2), '2');
  assert.equal(normalizeAnimeMappingSeason(' 3 '), '3');
  assert.equal(normalizeAnimeMappingSeason(null), '');
});
