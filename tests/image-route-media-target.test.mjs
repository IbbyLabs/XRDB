import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveImageRouteMediaTarget } from '../lib/imageRouteMediaTarget.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

const createTextResponse = (data = null, ok = false, status = ok ? 200 : 404) => ({
  ok,
  status,
  data,
});

test('image route media target resolves explicit TMDB movie targets', async () => {
  const requests = [];
  const result = await resolveImageRouteMediaTarget({
    imageType: 'poster',
    isThumbnailRequest: false,
    tmdbKey: 'tmdb-key',
    phases: { ...phases },
    fetchJsonCached: async (key, url) => {
      requests.push({ key, url });
      return {
        ok: true,
        status: 200,
        data: { id: 42, title: 'Example Movie' },
      };
    },
    fetchTextCached: async () => createTextResponse(),
    mediaId: '42',
    season: null,
    episode: null,
    isTmdb: true,
    isTvdb: false,
    isCanonId: false,
    isKitsu: false,
    inputAnimeMappingProvider: null,
    inputAnimeMappingExternalId: null,
    explicitTmdbMediaType: 'movie',
    tvdbSeriesId: null,
    hasNativeAnimeInput: false,
    allowAnimeOnlyRatings: false,
    hasConfirmedAnimeMapping: false,
  });

  assert.equal(result.mediaType, 'movie');
  assert.equal(result.media.id, 42);
  assert.equal(result.useRawKitsuFallback, false);
  assert.deepEqual(requests, [
    {
      key: 'tmdb:movie:42',
      url: 'https://api.themoviedb.org/3/movie/42?api_key=tmdb-key',
    },
  ]);
});

test('image route media target prefers TV matches for episodic IMDb lookups', async () => {
  const requests = [];
  const result = await resolveImageRouteMediaTarget({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    tmdbKey: 'tmdb-key',
    phases: { ...phases },
    fetchJsonCached: async (key, url) => {
      requests.push({ key, url });
      return {
        ok: true,
        status: 200,
        data: {
          movie_results: [{ id: 5, title: 'Movie Match' }],
          tv_results: [{ id: 9, name: 'Show Match' }],
        },
      };
    },
    fetchTextCached: async () => createTextResponse(),
    mediaId: 'tt1234567',
    season: '1',
    episode: '2',
    isTmdb: false,
    isTvdb: false,
    isCanonId: false,
    isKitsu: false,
    inputAnimeMappingProvider: null,
    inputAnimeMappingExternalId: null,
    explicitTmdbMediaType: null,
    tvdbSeriesId: null,
    hasNativeAnimeInput: false,
    allowAnimeOnlyRatings: false,
    hasConfirmedAnimeMapping: false,
  });

  assert.equal(result.mediaType, 'tv');
  assert.equal(result.media.id, 9);
  assert.deepEqual(requests, [
    {
      key: 'tmdb:find:tt1234567',
      url: 'https://api.themoviedb.org/3/find/tt1234567?api_key=tmdb-key&external_source=imdb_id',
    },
  ]);
});
