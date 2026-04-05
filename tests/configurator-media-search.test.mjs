import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildImdbMediaIdForPreviewType,
  buildMediaIdForPreviewType,
  buildTmdbMultiSearchUrl,
  findSampleTitleByMediaId,
  isBuiltInSample,
  isMediaIdPattern,
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

test('findSampleTitleByMediaId returns title for exact match', () => {
  assert.equal(findSampleTitleByMediaId('tt0133093'), 'The Matrix');
  assert.equal(findSampleTitleByMediaId('tmdb:tv:1399'), 'Game of Thrones');
  assert.equal(findSampleTitleByMediaId('tmdb:movie:27205'), 'Inception');
});

test('findSampleTitleByMediaId returns title for episode-format sample IDs', () => {
  assert.equal(findSampleTitleByMediaId('tt0944947:1:1'), 'Game of Thrones S01E01');
  assert.equal(findSampleTitleByMediaId('tmdb:tv:1399:1:1'), 'Game of Thrones S01E01');
});

test('findSampleTitleByMediaId returns null for unknown IDs', () => {
  assert.equal(findSampleTitleByMediaId('tt9999999'), null);
  assert.equal(findSampleTitleByMediaId('tmdb:movie:99999'), null);
  assert.equal(findSampleTitleByMediaId(''), null);
});
});

test('isMediaIdPattern detects IMDb IDs', () => {
  assert.equal(isMediaIdPattern('tt0133093'), true);
  assert.equal(isMediaIdPattern('tt1234567'), true);
  assert.equal(isMediaIdPattern('TT0133093'), true);
});

test('isMediaIdPattern detects pure numeric TMDB IDs', () => {
  assert.equal(isMediaIdPattern('603'), true);
  assert.equal(isMediaIdPattern('1399'), true);
  assert.equal(isMediaIdPattern('550'), true);
});

test('isMediaIdPattern detects typed TMDB IDs', () => {
  assert.equal(isMediaIdPattern('tmdb:movie:603'), true);
  assert.equal(isMediaIdPattern('tmdb:tv:1399'), true);
  assert.equal(isMediaIdPattern('tv:1399'), true);
  assert.equal(isMediaIdPattern('tmdb:tv:1399:1:1'), true);
});

test('isMediaIdPattern detects other supported ID prefixes', () => {
  assert.equal(isMediaIdPattern('kitsu:7442'), true);
  assert.equal(isMediaIdPattern('mal:16498'), true);
  assert.equal(isMediaIdPattern('anilist:16498'), true);
  assert.equal(isMediaIdPattern('anidb:5114'), true);
  assert.equal(isMediaIdPattern('tvdb:121361'), true);
  assert.equal(isMediaIdPattern('imdb:tt0944947'), true);
  assert.equal(isMediaIdPattern('xrdbid:tt0944947'), true);
});

test('isMediaIdPattern detects episode targets', () => {
  assert.equal(isMediaIdPattern('tmdb:tv:1399:1:1'), true);
  assert.equal(isMediaIdPattern('mal:16498:1:1'), true);
  assert.equal(isMediaIdPattern('kitsu:7442:1'), true);
  assert.equal(isMediaIdPattern('kitsu:7442:1:1'), true);
});

test('isMediaIdPattern returns false for name queries', () => {
  assert.equal(isMediaIdPattern('The Matrix'), false);
  assert.equal(isMediaIdPattern('breaking bad'), false);
  assert.equal(isMediaIdPattern('game of thrones'), false);
  assert.equal(isMediaIdPattern(''), false);
  assert.equal(isMediaIdPattern('  '), false);
  assert.equal(isMediaIdPattern('attack on titan 2024'), false);
});
