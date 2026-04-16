import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPosterWarmSearchParams } from '../lib/posterCacheWarmSearchParams.ts';

test('poster warm search params default to lean poster ratings', () => {
  const params = buildPosterWarmSearchParams();

  assert.equal(params.get('posterRatings'), 'imdb,tmdb');
});

test('poster warm search params preserve explicit no-ratings requests', () => {
  const params = buildPosterWarmSearchParams(new URLSearchParams('posterRatings='));

  assert.equal(params.get('posterRatings'), '');
});

test('poster warm search params filter MDBList-backed providers and strip replay-only params', () => {
  const params = buildPosterWarmSearchParams(
    new URLSearchParams(
      'ratings=mdblist,tomatoes,trakt&posterRatings=tmdb,imdb,mdblist,tomatoes,letterboxd,trakt&config=cfg_123&cb=123&debugRatings=1&mdblistKey=secret',
    ),
  );

  assert.equal(params.get('posterRatings'), 'tmdb,imdb,trakt');
  assert.equal(params.get('ratings'), null);
  assert.equal(params.get('config'), null);
  assert.equal(params.get('cb'), null);
  assert.equal(params.get('debugRatings'), null);
  assert.equal(params.get('mdblistKey'), null);
});

test('poster warm search params fall back to lean providers when only MDBList-backed ratings are requested', () => {
  const params = buildPosterWarmSearchParams(new URLSearchParams('ratings=mdblist,tomatoes,letterboxd'));

  assert.equal(params.get('posterRatings'), 'imdb,tmdb');
});