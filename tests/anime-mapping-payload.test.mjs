import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractAniListIdFromAnimemapping,
  extractAnimeSubtypeFromAnimemapping,
  extractKitsuIdFromAnimemapping,
  extractMalIdFromAnimemapping,
  extractTmdbIdFromAnimemapping,
  normalizeKitsuId,
  normalizeMalId,
  normalizeTmdbId,
} from '../lib/animeMappingPayload.ts';

test('anime mapping payload normalizes provider ids safely', () => {
  assert.equal(normalizeKitsuId('kitsu:1234'), '1234');
  assert.equal(normalizeKitsuId(' anime/5678 '), '5678');
  assert.equal(normalizeTmdbId('tmdb:999'), '999');
  assert.equal(normalizeMalId('myanimelist:42'), '42');
  assert.equal(normalizeMalId(0), null);
});

test('anime mapping payload extracts ids from nested payload variants', () => {
  const payload = {
    data: {
      requested: {
        resolvedKitsuId: 'kitsu:77',
        resolvedAniListId: '500',
        resolvedMyAnimeListId: 'mal:900',
      },
      mappings: {
        ids: {
          tmdb: '321',
        },
      },
    },
  };

  assert.equal(extractKitsuIdFromAnimemapping(payload), '77');
  assert.equal(extractAniListIdFromAnimemapping(payload), '500');
  assert.equal(extractMalIdFromAnimemapping(payload), '900');
  assert.equal(extractTmdbIdFromAnimemapping(payload), '321');
});

test('anime mapping payload extracts a normalized subtype', () => {
  assert.equal(
    extractAnimeSubtypeFromAnimemapping({
      data: {
        kitsu: {
          subtype: ' TV ',
        },
      },
    }),
    'tv',
  );
  assert.equal(extractAnimeSubtypeFromAnimemapping({}), null);
});
