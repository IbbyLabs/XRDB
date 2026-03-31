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
