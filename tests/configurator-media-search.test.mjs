import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImdbMediaIdForPreviewType,
  buildMediaIdForPreviewType,
  buildTmdbMultiSearchUrl,
  mapOmdbSearchResultsForPreviewType,
  mapTmdbSearchResultsForPreviewType,
  pickShuffledMediaTarget,
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
  assert.equal(mapped[0].subtitle, 'Series · 2011 · TMDB');
  assert.equal(mapped[0].source, 'tmdb');
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
      { Title: 'Uncharted World', Year: '2024', imdbID: 'tt1234567', Type: 'series' },
    ],
  });
  const thumbnailMapped = mapOmdbSearchResultsForPreviewType({
    previewType: 'thumbnail',
    results: [
      { Title: 'Uncharted', Year: '2022', imdbID: 'tt1464335', Type: 'movie' },
      { Title: 'Uncharted World', Year: '2024', imdbID: 'tt1234567', Type: 'series' },
    ],
  });

  assert.equal(posterMapped.length, 2);
  assert.equal(posterMapped[0].mediaId, 'imdb:tt1464335');
  assert.equal(posterMapped[0].source, 'imdb');
  assert.equal(posterMapped[0].subtitle, 'Movie · 2022 · IMDb');
  assert.equal(thumbnailMapped.length, 1);
  assert.equal(thumbnailMapped[0].mediaId, 'imdb:tt1234567:1:1');
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

  assert.notEqual(nextPoster, 'tt0133093');
  assert.notEqual(nextLogo, 'tmdb:movie:603');
});

test('pickShuffledMediaTarget returns a fallback value when current target is empty', () => {
  const nextBackdrop = pickShuffledMediaTarget({
    previewType: 'backdrop',
    currentMediaId: '',
    randomValue: 0.5,
  });

  assert.equal(typeof nextBackdrop, 'string');
  assert.ok(nextBackdrop.length > 0);
});
