import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMediaIdForPreviewType,
  mapTmdbSearchResultsForPreviewType,
} from '../lib/configuratorMediaSearch.ts';

test('buildMediaIdForPreviewType returns typed tmdb IDs for poster and backdrop', () => {
  assert.equal(buildMediaIdForPreviewType('poster', 'movie', 603), 'tmdb:movie:603');
  assert.equal(buildMediaIdForPreviewType('backdrop', 'tv', 1399), 'tmdb:tv:1399');
});

test('buildMediaIdForPreviewType returns episode seed IDs for thumbnails', () => {
  assert.equal(buildMediaIdForPreviewType('thumbnail', 'tv', 1399), 'tmdb:tv:1399:1:1');
  assert.equal(buildMediaIdForPreviewType('thumbnail', 'movie', 603), 'tmdb:tv:603:1:1');
});

test('mapTmdbSearchResultsForPreviewType keeps only tv results for thumbnail previews', () => {
  const mapped = mapTmdbSearchResultsForPreviewType({
    previewType: 'thumbnail',
    results: [
      { id: 603, media_type: 'movie', title: 'The Matrix', release_date: '1999-03-30' },
      { id: 1399, media_type: 'tv', name: 'Game of Thrones', first_air_date: '2011-04-17' },
    ],
  });

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].mediaId, 'tmdb:tv:1399:1:1');
  assert.equal(mapped[0].title, 'Game of Thrones');
  assert.equal(mapped[0].subtitle, 'Series · 2011');
});
