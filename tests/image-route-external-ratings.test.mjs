import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BROWSER_LIKE_USER_AGENT,
  SIMKL_APP_NAME,
  SIMKL_APP_VERSION,
  buildSimklRequiredQuery,
  fetchSimklId,
  fetchSimklRating,
  fetchTraktRating,
  resolveSimklSummaryType,
} from '../lib/imageRouteExternalRatings.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

test('image route external ratings build Simkl query metadata and choose summary type', () => {
  const query = buildSimklRequiredQuery('client-123');

  assert.equal(query.get('client_id'), 'client-123');
  assert.equal(query.get('app-name'), SIMKL_APP_NAME);
  assert.equal(query.get('app-version'), SIMKL_APP_VERSION);
  assert.equal(resolveSimklSummaryType({ mediaType: 'movie' }), 'movies');
  assert.equal(resolveSimklSummaryType({ mediaType: 'tv' }), 'tv');
  assert.equal(resolveSimklSummaryType({ mediaType: 'tv', anilistId: '1' }), 'anime');
});

test('image route external ratings fetch Trakt ratings through the cached fetch wrapper', async () => {
  const requests = [];
  const fetchJsonCached = async (key, url, ttlMs, passedPhases, phase, init, observer, fetchImpl) => {
    requests.push({ key, url, ttlMs, passedPhases, phase, init, observer, fetchImpl });
    return {
      ok: true,
      status: 200,
      data: {
        trakt: {
          rating: 7.8,
        },
      },
    };
  };
  const undiciFetchImpl = async () => {
    throw new Error('should not be called directly');
  };

  const rating = await fetchTraktRating({
    imdbId: 'tt1234567',
    mediaType: 'movie',
    phases,
    fetchJsonCached,
    undiciFetchImpl,
    traktClientId: 'trakt-key',
  });

  assert.equal(rating, '7.8');
  assert.match(requests[0].key, /^trakt:movies:tt1234567:ratings:/);
  assert.equal(requests[0].url, 'https://api.trakt.tv/movies/tt1234567/ratings');
  assert.equal(requests[0].phase, 'mdb');
  assert.equal(requests[0].init.headers['user-agent'], BROWSER_LIKE_USER_AGENT);
  assert.equal(requests[0].fetchImpl, undiciFetchImpl);
});

test('image route external ratings treat zero Trakt ratings as missing', async () => {
  const rating = await fetchTraktRating({
    imdbId: 'tt1234567',
    mediaType: 'movie',
    phases,
    fetchJsonCached: async () => ({
      ok: true,
      status: 200,
      data: {
        trakt: {
          rating: 0,
        },
      },
    }),
    undiciFetchImpl: async () => {
      throw new Error('should not be called directly');
    },
    traktClientId: 'trakt-key',
  });

  assert.equal(rating, null);
});

test('image route external ratings resolve and cache Simkl ids from redirects', async () => {
  const writes = [];
  const metadata = new Map();
  const fetchJsonCached = async () => ({
    ok: true,
    status: 200,
    data: null,
    location: 'https://simkl.com/tv/98765/example',
  });

  const simklId = await fetchSimklId({
    clientId: 'simkl-key',
    imdbId: 'tt1234567',
    mediaType: 'tv',
    cacheTtlMs: 1234,
    phases,
    fetchJsonCached,
    getMetadata: (key) => metadata.get(key),
    setMetadata: (key, value, ttlMs) => {
      writes.push({ key, value, ttlMs });
      metadata.set(key, value);
    },
  });

  assert.equal(simklId, '98765');
  assert.equal(writes.length, 1);
  assert.match(writes[0].key, /^simkl:id:v2:tt1234567:client:/);
  assert.equal(writes[0].ttlMs, 1234);
});

test('image route external ratings fetch Simkl summary ratings and reject negative values', async () => {
  const metadata = new Map();
  const requested = [];
  const fetchJsonCached = async (key, url) => {
    requested.push({ key, url });
    if (url.startsWith('https://api.simkl.com/redirect?')) {
      return {
        ok: true,
        status: 200,
        data: {
          id: '555',
        },
        location: null,
      };
    }
    return {
      ok: true,
      status: 200,
      data: {
        ratings: {
          simkl: {
            rating: 84,
          },
        },
      },
    };
  };

  const rating = await fetchSimklRating({
    clientId: 'simkl-key',
    tmdbId: '42',
    mediaType: 'movie',
    cacheTtlMs: 5000,
    phases,
    fetchJsonCached,
    getMetadata: (key) => metadata.get(key),
    setMetadata: (key, value) => metadata.set(key, value),
  });

  assert.equal(rating, '84');
  assert.match(requested[0].url, /https:\/\/api\.simkl\.com\/redirect\?/);
  assert.match(requested[1].url, /https:\/\/api\.simkl\.com\/movies\/555\?/);
});
