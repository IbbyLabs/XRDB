import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAniListIdFromReverseMapping,
  fetchAnimeReverseMappingPayload,
  fetchKitsuIdFromReverseMapping,
  fetchMalIdFromReverseMapping,
  fetchTmdbIdFromReverseMapping,
} from '../lib/imageRouteAnimeReverse.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

test('image route anime reverse builds payload requests and returns ids', async () => {
  const calls = [];
  const fetchJsonCached = async (key, url) => {
    calls.push({ key, url });
    return {
      ok: true,
      status: 200,
      data: {
        requested: {
          resolvedKitsuId: 'kitsu:77',
          resolvedAniListId: '88',
          resolvedMalId: '99',
        },
        mappings: {
          ids: {
            tmdb: '1234',
          },
        },
      },
    };
  };

  const payload = await fetchAnimeReverseMappingPayload({
    provider: 'mal',
    externalId: '456',
    season: '2',
    phases,
    fetchJsonCached,
  });
  const kitsuId = await fetchKitsuIdFromReverseMapping({
    provider: 'mal',
    externalId: '456',
    season: '2',
    phases,
    fetchJsonCached,
  });
  const aniListId = await fetchAniListIdFromReverseMapping({
    provider: 'mal',
    externalId: '456',
    season: '2',
    phases,
    fetchJsonCached,
  });
  const malId = await fetchMalIdFromReverseMapping({
    provider: 'mal',
    externalId: '456',
    season: '2',
    phases,
    fetchJsonCached,
  });
  const tmdbId = await fetchTmdbIdFromReverseMapping({
    provider: 'mal',
    externalId: '456',
    season: '2',
    phases,
    fetchJsonCached,
  });

  assert.equal(payload?.requested?.resolvedKitsuId, 'kitsu:77');
  assert.equal(kitsuId, '77');
  assert.equal(aniListId, '88');
  assert.equal(malId, '99');
  assert.equal(tmdbId, '1234');
  assert.equal(calls[0]?.key, 'anime:reverse:mal:456:s:2');
  assert.equal(calls.at(-1)?.key, 'tmdb:reverse:mal:456:s:2');
});

test('image route anime reverse returns null for blank ids and failed payloads', async () => {
  const fetchJsonCached = async () => ({
    ok: false,
    status: 404,
    data: null,
  });

  const blank = await fetchAnimeReverseMappingPayload({
    provider: 'mal',
    externalId: '   ',
    phases,
    fetchJsonCached,
  });
  const missing = await fetchKitsuIdFromReverseMapping({
    provider: 'mal',
    externalId: '1',
    phases,
    fetchJsonCached,
  });

  assert.equal(blank, null);
  assert.equal(missing, null);
});
