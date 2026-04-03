import test from 'node:test';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server.js';

import { resolveImageRouteRequestState } from '../lib/imageRouteRequestState.ts';
import { HttpError } from '../lib/imageRouteRuntime.ts';

const createRequest = (url, headers = {}) =>
  new NextRequest(url, {
    headers: {
      accept: 'image/jpeg',
      ...headers,
    },
  });

test('image route request state rejects ambiguous strict TMDB ids for backdrop renders', async () => {
  await assert.rejects(
    () =>
      resolveImageRouteRequestState({
        request: createRequest('https://example.com/backdrop/tmdb:123.jpg?tmdbIdScope=strict&tmdbKey=tmdb-key'),
        imageType: 'backdrop',
        id: 'tmdb:123.jpg',
      }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      assert.equal(
        error.message,
        'Strict TMDB ID scope requires tmdb:movie:{tmdb_id} or tmdb:tv:{tmdb_id} for backdrop and logo requests.',
      );
      return true;
    },
  );
});

test('image route request state prefers thumbnail ratings for thumbnail backdrop requests', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&ratings=imdb,tomatoes&backdropRatings=tomatoes&thumbnailRatings=kitsu',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.equal(state.isCanonId, true);
  assert.equal(state.mediaId, 'tt1234567');
  assert.equal(state.season, '1');
  assert.equal(state.episode, '2');
  assert.deepEqual(state.effectiveRatingPreferences, ['kitsu']);
  assert.deepEqual([...state.selectedRatings], ['kitsu']);
});

test('image route request state defaults thumbnail backdrop requests to TMDB and IMDb ratings', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&ratings=tomatoes&backdropRatings=tomatoes',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.isThumbnailRequest, true);
  assert.deepEqual(state.effectiveRatingPreferences, ['tmdb', 'imdb']);
  assert.deepEqual([...state.selectedRatings], ['tmdb', 'imdb']);
  assert.equal(state.thumbnailEpisodeArtwork, 'still');
  assert.equal(state.backdropEpisodeArtwork, 'series');
});

test('image route request state keeps OMDb poster artwork poster only', async () => {
  const posterState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterArtworkSource=omdb',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const backdropState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/tt0133093.jpg?tmdbKey=tmdb-key&backdropArtworkSource=omdb',
    ),
    imageType: 'backdrop',
    id: 'tt0133093.jpg',
  });

  assert.equal(posterState.posterArtworkSource, 'omdb');
  assert.equal(backdropState.backdropArtworkSource, 'tmdb');
});

test('image route request state normalizes type scoped episode artwork overrides', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/backdrop/xrdbid:tt1234567:1:2.jpg?thumbnail=1&tmdbKey=tmdb-key&thumbnailEpisodeArtwork=series&backdropEpisodeArtwork=still',
    ),
    imageType: 'backdrop',
    id: 'xrdbid:tt1234567:1:2.jpg',
  });

  assert.equal(state.thumbnailEpisodeArtwork, 'series');
  assert.equal(state.backdropEpisodeArtwork, 'still');
});

test('image route request state requires a TMDB key', async () => {
  await assert.rejects(
    () =>
      resolveImageRouteRequestState({
        request: createRequest('https://example.com/poster/tt0133093.jpg'),
        imageType: 'poster',
        id: 'tt0133093.jpg',
      }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      assert.equal(error.message, 'TMDB API Key (tmdbKey) is required');
      return true;
    },
  );
});

test('image route request state resolves style scoped stack offsets for glass and square styles', async () => {
  const glassState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=glass&ratingXOffsetPillGlass=18&ratingYOffsetPillGlass=-7&ratingXOffsetSquare=99&ratingYOffsetSquare=99',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const squareState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=square&ratingXOffsetPillGlass=18&ratingYOffsetPillGlass=-7&ratingXOffsetSquare=-12&ratingYOffsetSquare=14',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });
  const plainState = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&ratingStyle=plain&ratingXOffsetPillGlass=18&ratingYOffsetPillGlass=-7',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(glassState.ratingStackOffsetX, 18);
  assert.equal(glassState.ratingStackOffsetY, -7);
  assert.equal(squareState.ratingStackOffsetX, -12);
  assert.equal(squareState.ratingStackOffsetY, 14);
  assert.equal(plainState.ratingStackOffsetX, 0);
  assert.equal(plainState.ratingStackOffsetY, 0);
});

test('image route request state parses random poster filter controls', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&imageText=random&randomPosterText=textless&randomPosterLanguage=requested&randomPosterMinVoteCount=12&randomPosterMinVoteAverage=6.5&randomPosterMinWidth=1000&randomPosterMinHeight=1500&randomPosterFallback=original',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterTextPreference, 'random');
  assert.equal(state.randomPosterTextMode, 'textless');
  assert.equal(state.randomPosterLanguageMode, 'requested');
  assert.equal(state.randomPosterMinVoteCount, 12);
  assert.equal(state.randomPosterMinVoteAverage, 6.5);
  assert.equal(state.randomPosterMinWidth, 1000);
  assert.equal(state.randomPosterMinHeight, 1500);
  assert.equal(state.randomPosterFallbackMode, 'original');
});

test('image route request state parses poster no background outline controls', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&posterNoBackgroundBadgeOutlineColor=%23112233&posterNoBackgroundBadgeOutlineWidth=2',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.posterNoBackgroundBadgeOutlineColor, '#112233');
  assert.equal(state.posterNoBackgroundBadgeOutlineWidth, 2);
});

test('image route request state normalizes dynamic aggregate accent stops', async () => {
  const state = await resolveImageRouteRequestState({
    request: createRequest(
      'https://example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&aggregateAccentMode=dynamic&aggregateDynamicStops=85:%2316A34A,0:%237f1d1d,60:%23f59e0b',
    ),
    imageType: 'poster',
    id: 'tt0133093.jpg',
  });

  assert.equal(state.aggregateAccentMode, 'dynamic');
  assert.equal(state.aggregateDynamicStops, '0:#7f1d1d,60:#f59e0b,85:#16a34a');
});
