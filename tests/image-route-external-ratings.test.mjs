import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BROWSER_LIKE_USER_AGENT,
  SIMKL_APP_NAME,
  SIMKL_APP_VERSION,
  buildSimklRequiredQuery,
  decodeAllocinePathFromClassName,
  extractAllocineRatings,
  extractAllocineSearchCandidates,
  fetchAllocineRatings,
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

test('image route external ratings decode Allociné search paths and extract candidates', () => {
  assert.equal(
    decodeAllocinePathFromClassName('ACrL2ZACrpbG0vZmljaGVmaWxtX2dlbl9jZmlsbT0xOTc3Ni5odG1s meta-title-link'),
    '/film/fichefilm_gen_cfilm=19776.html',
  );

  const movieHtml = `
    <div class="meta">
      <h2 class="meta-title">
        <span class="ACrL2ZACrpbG0vZmljaGVmaWxtX2dlbl9jZmlsbT0xOTc3Ni5odG1s meta-title-link">Matrix</span>
      </h2>
      <div class="meta-body">
        <div class="meta-body-item meta-body-info">
          <span class="date">23 juin 1999</span>
        </div>
      </div>
    </div>
  `;
  const seriesHtml = `
    <div class="meta">
      <h2 class="meta-title">
        <span class="ACrL3NACrlcmllcy9maWNoZXNlcmllX2dlbl9jc2VyaWU9MzUxNy5odG1s meta-title-link">Breaking Bad</span>
      </h2>
    </div>
  `;

  assert.deepEqual(extractAllocineSearchCandidates(movieHtml, 'movie'), [
    {
      path: '/film/fichefilm_gen_cfilm=19776.html',
      title: 'Matrix',
      year: 1999,
    },
  ]);
  assert.deepEqual(extractAllocineSearchCandidates(seriesHtml, 'tv'), [
    {
      path: '/series/ficheserie_gen_cserie=3517.html',
      title: 'Breaking Bad',
      year: null,
    },
  ]);
});

test('image route external ratings extract Allociné audience and press values from detail pages', () => {
  const html = `
    <span class="rating-title"> Presse </span>
    <div class="stareval"><span class="stareval-note">3,4</span></div>
    <span class="rating-title"> Spectateurs </span>
    <div class="stareval"><span class="stareval-note">4,4</span></div>
  `;

  assert.deepEqual(extractAllocineRatings(html), {
    allocine: '4.4',
    allocinepress: '3.4',
  });
});

test('image route external ratings fetch Allociné search and detail pages through the text cache path', async () => {
  const requested = [];
  const metadata = new Map();
  const fetchImpl = async (url) => {
    requested.push(String(url));
    if (String(url).includes('/rechercher/movie/')) {
      return new Response(`
        <span class="ACrL2ZACrpbG0vZmljaGVmaWxtX2dlbl9jZmlsbT0xOTc3Ni5odG1s meta-title-link">Matrix</span>
        <span class="date">23 juin 1999</span>
      `, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      });
    }
    return new Response(`
      <span class="rating-title"> Presse </span>
      <span class="stareval-note">3,4</span>
      <span class="rating-title"> Spectateurs </span>
      <span class="stareval-note">4,4</span>
    `, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  };

  const ratings = await fetchAllocineRatings({
    mediaType: 'movie',
    title: 'Matrix',
    originalTitle: 'The Matrix',
    releaseDate: '1999-03-31',
    cacheTtlMs: 5000,
    phases,
    getMetadata: (key) => metadata.get(key),
    setMetadata: (key, value) => metadata.set(key, value),
    fetchImpl,
  });

  assert.deepEqual(ratings, {
    allocine: '4.4',
    allocinepress: '3.4',
  });
  assert.equal(requested.length, 2);
  assert.match(requested[0], /\/rechercher\/movie\/\?q=Matrix/);
  assert.match(requested[1], /\/film\/fichefilm_gen_cfilm=19776\.html$/);
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
