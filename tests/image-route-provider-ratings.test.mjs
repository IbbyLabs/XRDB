import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveImageRouteProviderRatings } from '../lib/imageRouteProviderRatings.ts';

const createEmptyResponse = () => ({
  ok: false,
  status: 404,
  data: null,
});

test('image route provider ratings resolve anime mapping and dataset ratings', async () => {
  const reverseMappingCalls = [];
  const renderedRatingTtlByProvider = new Map();

  const result = await resolveImageRouteProviderRatings(
    {
      cleanId: 'tmdb:tv:42:1:2',
      imageType: 'poster',
      mediaType: 'tv',
      media: {
        id: 42,
        imdb_id: 'tt1234567',
        first_air_date: '2024-01-01',
      },
      mediaId: '42',
      isTmdb: true,
      isKitsu: false,
      isAniListInput: false,
      idPrefix: 'tmdb',
      season: '1',
      mappedImdbId: null,
      inputAnimeMappingProvider: 'tmdb',
      inputAnimeMappingExternalId: '42',
      requestedExternalRatings: new Set(['imdb', 'kitsu']),
      shouldAttemptAnimeMapping: true,
      initialAllowAnimeOnlyRatings: false,
      initialHasConfirmedAnimeMapping: false,
      resolvedRatingMediaType: 'tv',
      releaseDate: '2024-01-01',
      mdblistKey: null,
      hasMdbListApiKey: false,
      simklClientId: '',
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getMetadata: () => null,
      setMetadata: () => {},
      detailsBundlePromise: null,
      renderedRatingTtlByProvider,
      undiciFetchImpl: async () => {
        throw new Error('unexpected undici fetch');
      },
    },
    {
      fetchMalIdFromReverseMapping: async (options) => {
        reverseMappingCalls.push(options);
        return null;
      },
      fetchKitsuIdFromReverseMapping: async (options) => {
        reverseMappingCalls.push(options);
        return 'kitsu-9000';
      },
      fetchAniListIdFromReverseMapping: async (options) => {
        reverseMappingCalls.push(options);
        return null;
      },
      fetchAniListRating: async () => null,
      fetchKitsuRating: async (kitsuId) => (kitsuId === 'kitsu-9000' ? '81' : null),
      fetchMyAnimeListRating: async () => null,
      fetchTraktRating: async () => null,
      fetchSimklRating: async () => null,
      fetchMdbListRatings: async () => null,
      getImdbRatingFromDataset: () => ({ rating: 8.4, votes: 1200 }),
      normalizeRatingValue: (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(1) : null;
      },
    },
  );

  assert.equal(result.allowAnimeOnlyRatings, true);
  assert.equal(result.hasConfirmedAnimeMapping, true);
  assert.equal(result.ratings.get('imdb'), '8.4');
  assert.equal(result.ratings.get('kitsu'), '81');
  assert.equal(reverseMappingCalls[0]?.provider, 'tmdb');
  assert.ok(renderedRatingTtlByProvider.has('imdb'));
  assert.ok(renderedRatingTtlByProvider.has('kitsu'));
});

test('image route provider ratings stay empty without identifiers', async () => {
  const result = await resolveImageRouteProviderRatings({
    cleanId: 'custom:missing',
    imageType: 'backdrop',
    mediaType: 'movie',
    media: null,
    mediaId: '',
    isTmdb: false,
    isKitsu: false,
    isAniListInput: false,
    idPrefix: '',
    season: null,
    mappedImdbId: null,
    inputAnimeMappingProvider: null,
    inputAnimeMappingExternalId: null,
    requestedExternalRatings: new Set(['imdb']),
    shouldAttemptAnimeMapping: false,
    initialAllowAnimeOnlyRatings: false,
    initialHasConfirmedAnimeMapping: false,
    resolvedRatingMediaType: 'movie',
    releaseDate: null,
    mdblistKey: null,
    hasMdbListApiKey: false,
    simklClientId: '',
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async () => createEmptyResponse(),
    getMetadata: () => null,
    setMetadata: () => {},
    detailsBundlePromise: null,
    renderedRatingTtlByProvider: new Map(),
    undiciFetchImpl: async () => {
      throw new Error('unexpected undici fetch');
    },
  });

  assert.equal(result.ratings.size, 0);
  assert.equal(result.allowAnimeOnlyRatings, false);
  assert.equal(result.hasConfirmedAnimeMapping, false);
});
