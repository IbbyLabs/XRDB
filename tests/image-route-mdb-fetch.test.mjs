import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchMdbListRatings } from '../lib/imageRouteMdbFetch.ts';

const createPhases = () => ({
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
});

test('image route MDB fetch returns normalized ratings from a successful response', async () => {
  const phases = createPhases();
  const calls = [];

  const ratings = await fetchMdbListRatings({
    imdbId: 'tt0944947',
    mediaType: 'tv',
    cacheTtlMs: 60_000,
    phases,
    manualApiKey: 'demo',
    fetchJsonCached: async (key, url) => {
      calls.push({ key, url });
      return {
        ok: true,
        status: 200,
        data: {
          score: 84,
          score_average: 82,
          ratings: [
            { source: 'tmdb', value: 8.3 },
            { source: 'imdb', value: 9.2 },
          ],
        },
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.mdblist.com/imdb/show/tt0944947?apikey=demo');
  assert.equal(ratings.get('tmdb'), '8.3');
  assert.equal(ratings.get('imdb'), '9.2');
});

test('image route MDB fetch returns null when the request fails', async () => {
  const phases = createPhases();
  const calls = [];

  const ratings = await fetchMdbListRatings({
    imdbId: 'tt0111161',
    mediaType: 'movie',
    cacheTtlMs: 60_000,
    phases,
    manualApiKey: 'demo',
    fetchJsonCached: async (key, url) => {
      calls.push({ key, url });
      return {
        ok: false,
        status: 500,
        data: null,
      };
    },
    requestSource: undefined,
    imageType: undefined,
    cleanId: undefined,
  });

  assert.equal(ratings, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.mdblist.com/imdb/movie/tt0111161?apikey=demo');
});
