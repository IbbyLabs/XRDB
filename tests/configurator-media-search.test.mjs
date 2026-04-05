import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImdbMediaIdForPreviewType,
  buildMediaIdForPreviewType,
  buildTmdbMultiSearchUrl,
  isBuiltInSample,
  mapOmdbSearchResultsForPreviewType,
  mapTmdbSearchResultsForPreviewType,
  MEDIA_TARGET_SAMPLE_IDS,
  pickShuffledMediaTarget,
  PINNED_TARGETS_MAX_PER_TYPE,
  readPinnedTargetsFromStorage,
  writePinnedTargetsToStorage,
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
      { id: 603, media_type: 'movie', title: 'The Matrix', release_date: '1999-03-30', poster_path: '/matrix.jpg' },
      { id: 1399, media_type: 'tv', name: 'Game of Thrones', first_air_date: '2011-04-17', poster_path: '/got.jpg' },
    ],
  });

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].mediaId, 'tmdb:tv:1399:1:1');
  assert.equal(mapped[0].title, 'Game of Thrones');
  assert.equal(mapped[0].subtitle, 'Series · 2011 · TMDB');
  assert.equal(mapped[0].source, 'tmdb');
  assert.equal(mapped[0].posterUrl, 'https://image.tmdb.org/t/p/w154/got.jpg');
});

test('buildTmdbMultiSearchUrl keeps the /3 path segment', () => {
  const url = new URL(
    buildTmdbMultiSearchUrl({
      tmdbKey: 'tmdb-key',
      query: 'Uncharted',
      language: 'en',
      apiBaseUrl: 'https://api.themoviedb.org/3',
    }),
  );

  assert.equal(url.origin, 'https://api.themoviedb.org');
  assert.equal(url.pathname, '/3/search/multi');
  assert.equal(url.searchParams.get('api_key'), 'tmdb-key');
  assert.equal(url.searchParams.get('query'), 'Uncharted');
});

test('buildImdbMediaIdForPreviewType returns imdb targets by preview type', () => {
  assert.equal(buildImdbMediaIdForPreviewType('poster', 'tt1464335'), 'imdb:tt1464335');
  assert.equal(buildImdbMediaIdForPreviewType('thumbnail', 'tt0944947'), 'imdb:tt0944947:1:1');
});

test('mapOmdbSearchResultsForPreviewType maps fallback items and filters thumbnail to series', () => {
  const posterMapped = mapOmdbSearchResultsForPreviewType({
    previewType: 'poster',
    results: [
      { Title: 'Uncharted', Year: '2022', imdbID: 'tt1464335', Type: 'movie' },
      { Title: 'Uncharted World', Year: '2024', imdbID: 'tt1234567', Type: 'series', Poster: 'https://m.media-amazon.com/images/test.jpg' },
    ],
  });
  const thumbnailMapped = mapOmdbSearchResultsForPreviewType({
    previewType: 'thumbnail',
    results: [
      { Title: 'Uncharted', Year: '2022', imdbID: 'tt1464335', Type: 'movie' },
      { Title: 'Uncharted World', Year: '2024', imdbID: 'tt1234567', Type: 'series', Poster: 'https://m.media-amazon.com/images/test.jpg' },
    ],
  });

  assert.equal(posterMapped.length, 2);
  assert.equal(posterMapped[0].mediaId, 'imdb:tt1464335');
  assert.equal(posterMapped[0].source, 'imdb');
  assert.equal(posterMapped[0].subtitle, 'Movie · 2022 · IMDb');
  assert.equal(posterMapped[0].posterUrl, '');
  assert.equal(thumbnailMapped.length, 1);
  assert.equal(thumbnailMapped[0].mediaId, 'imdb:tt1234567:1:1');
  assert.equal(thumbnailMapped[0].posterUrl, 'https://m.media-amazon.com/images/test.jpg');
});

test('pickShuffledMediaTarget avoids returning the current media target when alternatives exist', () => {
  const nextPoster = pickShuffledMediaTarget({
    previewType: 'poster',
    currentMediaId: 'tt0133093',
    randomValue: 0,
  });
  const nextLogo = pickShuffledMediaTarget({
    previewType: 'logo',
    currentMediaId: 'tmdb:movie:603',
    randomValue: 0.95,
  });

  assert.notEqual(nextPoster?.mediaId, 'tt0133093');
  assert.notEqual(nextLogo?.mediaId, 'tmdb:movie:603');
});

test('pickShuffledMediaTarget returns a result when current target is empty', () => {
  const nextBackdrop = pickShuffledMediaTarget({
    previewType: 'backdrop',
    currentMediaId: '',
    randomValue: 0.5,
  });

  assert.ok(nextBackdrop !== null);
  assert.equal(typeof nextBackdrop.mediaId, 'string');
  assert.ok(nextBackdrop.mediaId.length > 0);
  assert.equal(typeof nextBackdrop.title, 'string');
  assert.ok(nextBackdrop.title.length > 0);
});

test('MEDIA_TARGET_SAMPLE_IDS has 10 entries per preview type', () => {
  for (const type of ['poster', 'backdrop', 'thumbnail', 'logo']) {
    assert.equal(
      MEDIA_TARGET_SAMPLE_IDS[type].length,
      10,
      `Expected 10 sample IDs for ${type}`,
    );
  }
});

test('pickShuffledMediaTarget includes pinned targets in the pool', () => {
  const pinned = [{ mediaId: 'tmdb:tv:99999', title: 'Custom Pin' }];
  const results = new Set();
  for (let i = 0; i < 200; i++) {
    const result = pickShuffledMediaTarget({
      previewType: 'poster',
      currentMediaId: '',
      pinnedTargets: pinned,
      randomValue: i / 200,
    });
    if (result) results.add(result.mediaId);
  }
  assert.ok(results.has('tmdb:tv:99999'), 'Pinned target should appear in shuffle pool');
});

test('pickShuffledMediaTarget deduplicates pinned targets matching built-in samples', () => {
  const pinned = [{ mediaId: 'tt0133093', title: 'The Matrix (pinned)' }];
  const results = new Set();
  for (let i = 0; i < 200; i++) {
    const result = pickShuffledMediaTarget({
      previewType: 'poster',
      currentMediaId: '',
      pinnedTargets: pinned,
      randomValue: i / 200,
    });
    if (result) results.add(result.mediaId);
  }
  assert.equal(results.size, MEDIA_TARGET_SAMPLE_IDS.poster.length);
});

test('isBuiltInSample returns true for known sample IDs and false for unknown', () => {
  assert.equal(isBuiltInSample('tt0133093'), true);
  assert.equal(isBuiltInSample('tmdb:tv:1399'), true);
  assert.equal(isBuiltInSample('tmdb:tv:99999'), false);
  assert.equal(isBuiltInSample(''), false);
});
