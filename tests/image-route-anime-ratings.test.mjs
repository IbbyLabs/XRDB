import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAniListRating,
  fetchKitsuAnimeAttributes,
  fetchKitsuRating,
  fetchMyAnimeListRating,
} from '../lib/imageRouteAnimeRatings.ts';
import { KITSU_CACHE_TTL_MS, MYANIMELIST_CLIENT_ID } from '../lib/imageRouteConfig.ts';
import { BROWSER_LIKE_USER_AGENT } from '../lib/imageRouteExternalRatings.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

test('image route anime ratings loads Kitsu attributes and rating values', async () => {
  const requests = [];
  const fetchJsonCached = async (key, url, ttlMs, passedPhases, phase, init) => {
    requests.push({ key, url, ttlMs, passedPhases, phase, init });
    return {
      ok: true,
      status: 200,
      data: {
        data: {
          attributes: {
            averageRating: '81.2',
            canonicalTitle: 'Example',
          },
        },
      },
    };
  };

  const attributes = await fetchKitsuAnimeAttributes(' 42 ', phases, fetchJsonCached);
  const rating = await fetchKitsuRating('42', phases, fetchJsonCached);

  assert.equal(attributes?.canonicalTitle, 'Example');
  assert.equal(rating, '81.2');
  assert.deepEqual(requests[0], {
    key: 'kitsu:anime:42:details',
    url: 'https://kitsu.io/api/edge/anime/42',
    ttlMs: KITSU_CACHE_TTL_MS,
    passedPhases: phases,
    phase: 'mdb',
    init: {
      headers: {
        Accept: 'application/vnd.api+json',
        'User-Agent': BROWSER_LIKE_USER_AGENT,
      },
    },
  });
});

test('image route anime ratings posts the AniList query and normalizes the score', async () => {
  const requests = [];
  const fetchJsonCached = async (key, url, ttlMs, passedPhases, phase, init) => {
    requests.push({ key, url, ttlMs, passedPhases, phase, init });
    return {
      ok: true,
      status: 200,
      data: {
        data: {
          Media: {
            averageScore: 86,
          },
        },
      },
    };
  };

  const rating = await fetchAniListRating('99', phases, fetchJsonCached);

  assert.equal(rating, '86');
  assert.equal(requests[0].key, 'anilist:anime:99:rating');
  assert.equal(requests[0].url, 'https://graphql.anilist.co');
  assert.equal(requests[0].ttlMs, KITSU_CACHE_TTL_MS);
  assert.equal(requests[0].phase, 'mdb');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers['User-Agent'], BROWSER_LIKE_USER_AGENT);
  assert.match(String(requests[0].init.body), /averageScore/);
  assert.match(String(requests[0].init.body), /\"id\":99/);
});

test('image route anime ratings use MAL API when configured and fall back to Jikan otherwise', async () => {
  const requests = [];
  let malOk = true;
  const fetchJsonCached = async (key, url, _ttlMs, _phases, _phase, init) => {
    requests.push({ key, url, init });
    if (key.startsWith('mal:anime:')) {
      return {
        ok: malOk,
        status: malOk ? 200 : 503,
        data: malOk ? { mean: 7.9 } : null,
      };
    }
    return {
      ok: true,
      status: 200,
      data: {
        data: {
          score: 8.3,
        },
      },
    };
  };

  const malRating = await fetchMyAnimeListRating('mal:123', phases, fetchJsonCached);
  malOk = false;
  const jikanRating = await fetchMyAnimeListRating('123', phases, fetchJsonCached);

  assert.equal(malRating, MYANIMELIST_CLIENT_ID ? '7.9' : '8.3');
  assert.equal(jikanRating, '8.3');
  if (MYANIMELIST_CLIENT_ID) {
    assert.match(requests[0].key, /^mal:anime:123:rating:/);
    assert.equal(/^mal:anime:123:rating:/.test(requests[1].key), true);
    assert.equal(requests[0].init.headers['User-Agent'], BROWSER_LIKE_USER_AGENT);
    assert.deepEqual(requests[2], {
      key: 'jikan:anime:123:score',
      url: 'https://api.jikan.moe/v4/anime/123',
      init: {
        headers: {
          accept: 'application/json',
          'User-Agent': BROWSER_LIKE_USER_AGENT,
        },
      },
    });
    return;
  }

  assert.deepEqual(requests[0], {
    key: 'jikan:anime:123:score',
    url: 'https://api.jikan.moe/v4/anime/123',
    init: {
      headers: {
        accept: 'application/json',
        'User-Agent': BROWSER_LIKE_USER_AGENT,
      },
    },
  });
  assert.deepEqual(requests[1], {
    key: 'jikan:anime:123:score',
    url: 'https://api.jikan.moe/v4/anime/123',
    init: {
      headers: {
        accept: 'application/json',
        'User-Agent': BROWSER_LIKE_USER_AGENT,
      },
    },
  });
});
