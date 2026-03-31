import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDefaultRatingRows,
  enabledOrderedToRows,
  rowsToEnabledOrdered,
} from '../lib/ratingProviderRows.ts';

test('default rating rows enable every provider in catalog order', () => {
  const rows = buildDefaultRatingRows();

  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.enabled));
  assert.equal(rows[0]?.id, 'tmdb');
});

test('enabled ordered preferences round-trip through row state', () => {
  const rows = enabledOrderedToRows(['imdb', 'anilist', 'kitsu']);

  assert.deepEqual(rowsToEnabledOrdered(rows), ['imdb', 'anilist', 'kitsu']);
  assert.equal(rows[0]?.id, 'imdb');
  assert.equal(rows[1]?.id, 'anilist');
  assert.equal(rows[2]?.id, 'kitsu');

  const disabledTail = rows.slice(3);
  assert.ok(disabledTail.every((row) => row.enabled === false));
});

test('empty enabled order keeps every provider available but disabled', () => {
  const rows = enabledOrderedToRows([]);

  assert.equal(rowsToEnabledOrdered(rows).length, 0);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.enabled === false));
});

test('unknown providers are never invented when rebuilding row state', () => {
  const rows = enabledOrderedToRows(['imdb', 'imdb', 'anilist']);

  assert.deepEqual(rowsToEnabledOrdered(rows), ['imdb', 'imdb', 'anilist']);
  assert.ok(rows.every((row) => typeof row.id === 'string'));
});
