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

test('image route provider ratings prefer episode IMDb dataset ratings for episodic requests', async () => {
  const result = await resolveImageRouteProviderRatings(
    {
      cleanId: 'tt0944947:1:2',
      imageType: 'backdrop',
      mediaType: 'tv',
      media: {
        id: 1399,
        imdb_id: 'tt0944947',
        first_air_date: '2011-04-17',
      },
      mediaId: 'tt0944947',
      isTmdb: false,
      isKitsu: false,
      isAniListInput: false,
      idPrefix: 'tt0944947',
      season: '1',
      episode: '2',
      mappedImdbId: null,
      inputAnimeMappingProvider: null,
      inputAnimeMappingExternalId: null,
      requestedExternalRatings: new Set(['imdb']),
      shouldAttemptAnimeMapping: false,
      initialAllowAnimeOnlyRatings: false,
      initialHasConfirmedAnimeMapping: false,
      resolvedRatingMediaType: 'tv',
      releaseDate: '2011-04-17',
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
    },
    {
      fetchAniListRating: async () => null,
      fetchKitsuRating: async () => null,
      fetchMyAnimeListRating: async () => null,
      fetchTraktRating: async () => null,
      fetchSimklRating: async () => null,
      fetchMdbListRatings: async () => null,
      findImdbEpisodeBySeriesSeasonEpisode: () => ({
        imdbId: 'tt1480055',
        seriesImdbId: 'tt0944947',
        seasonNumber: 1,
        episodeNumber: 2,
      }),
      getImdbRatingFromDataset: (imdbId) =>
        imdbId === 'tt1480055' ? { rating: 8.9, votes: 1200 } : { rating: 7.4, votes: 5000 },
      normalizeRatingValue: (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(1) : null;
      },
    },
  );

  assert.equal(result.ratings.get('imdb'), '8.9');
});

test('image route provider ratings resolve all anime providers for typed TMDB inputs', async () => {
  const result = await resolveImageRouteProviderRatings(
    {
      cleanId: 'tmdb:tv:1429',
      imageType: 'poster',
      mediaType: 'tv',
      media: {
        id: 1429,
        imdb_id: 'tt2560140',
        first_air_date: '2013-04-07',
      },
      mediaId: '1429',
      isTmdb: true,
      isKitsu: false,
      isAniListInput: false,
      idPrefix: 'tmdb',
      season: null,
      mappedImdbId: null,
      inputAnimeMappingProvider: 'tmdb',
      inputAnimeMappingExternalId: '1429',
      requestedExternalRatings: new Set(['myanimelist', 'anilist', 'kitsu', 'imdb']),
      shouldAttemptAnimeMapping: true,
      initialAllowAnimeOnlyRatings: false,
      initialHasConfirmedAnimeMapping: false,
      resolvedRatingMediaType: 'tv',
      releaseDate: '2013-04-07',
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
    },
    {
      fetchMalIdFromReverseMapping: async () => '16498',
      fetchKitsuIdFromReverseMapping: async () => '7442',
      fetchAniListIdFromReverseMapping: async () => '16498',
      fetchAniListRating: async () => '86',
      fetchKitsuRating: async () => '81.2',
      fetchMyAnimeListRating: async () => '8.6',
      fetchTraktRating: async () => null,
      fetchSimklRating: async () => null,
      fetchMdbListRatings: async () => null,
      getImdbRatingFromDataset: () => ({ rating: 9.0, votes: 2000 }),
      normalizeRatingValue: (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(1) : null;
      },
    },
  );

  assert.equal(result.allowAnimeOnlyRatings, true);
  assert.equal(result.hasConfirmedAnimeMapping, true);
  assert.equal(result.ratings.get('myanimelist'), '8.6');
  assert.equal(result.ratings.get('anilist'), '86');
  assert.equal(result.ratings.get('kitsu'), '81.2');
  assert.equal(result.ratings.get('imdb'), '9.0');
});

test('image route provider ratings resolve imdb dependent providers from bundled external ids', async () => {
  const mdbCalls = [];
  const traktCalls = [];
  const simklCalls = [];
  const renderedRatingTtlByProvider = new Map();

  const result = await resolveImageRouteProviderRatings(
    {
      cleanId: 'tt15239678',
      imageType: 'poster',
      mediaType: 'movie',
      media: {
        id: 693134,
        release_date: '2024-02-27',
      },
      mediaId: 'tt15239678',
      isTmdb: false,
      isKitsu: false,
      isAniListInput: false,
      idPrefix: 'imdb',
      season: null,
      mappedImdbId: null,
      inputAnimeMappingProvider: null,
      inputAnimeMappingExternalId: null,
      requestedExternalRatings: new Set([
        'imdb',
        'mdblist',
        'tomatoes',
        'letterboxd',
        'trakt',
        'simkl',
      ]),
      shouldAttemptAnimeMapping: false,
      initialAllowAnimeOnlyRatings: false,
      initialHasConfirmedAnimeMapping: false,
      resolvedRatingMediaType: 'movie',
      releaseDate: '2024-02-27',
      mdblistKey: 'mdblist-key',
      hasMdbListApiKey: false,
      simklClientId: 'simkl-client',
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getMetadata: () => null,
      setMetadata: () => {},
      detailsBundlePromise: Promise.resolve({
        bundledExternalIds: {
          imdb_id: 'tt15239678',
        },
      }),
      renderedRatingTtlByProvider,
      undiciFetchImpl: async () => {
        throw new Error('unexpected undici fetch');
      },
    },
    {
      fetchAniListRating: async () => null,
      fetchKitsuRating: async () => null,
      fetchMyAnimeListRating: async () => null,
      fetchTraktRating: async ({ imdbId }) => {
        traktCalls.push(imdbId);
        return '8.3';
      },
      fetchSimklRating: async ({ imdbId }) => {
        simklCalls.push(imdbId);
        return '8.4';
      },
      fetchMdbListRatings: async ({ imdbId }) => {
        mdbCalls.push(imdbId);
        return new Map([
          ['mdblist', '86'],
          ['tomatoes', '92'],
          ['letterboxd', '4.4'],
        ]);
      },
      getImdbRatingFromDataset: () => ({ rating: 8.4, votes: 1200 }),
      normalizeRatingValue: (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(1) : null;
      },
    },
  );

  assert.deepEqual(mdbCalls, ['tt15239678']);
  assert.deepEqual(traktCalls, ['tt15239678']);
  assert.deepEqual(simklCalls, ['tt15239678']);
  assert.equal(result.ratings.get('imdb'), '8.4');
  assert.equal(result.ratings.get('mdblist'), '86');
  assert.equal(result.ratings.get('tomatoes'), '92');
  assert.equal(result.ratings.get('letterboxd'), '4.4');
  assert.equal(result.ratings.get('trakt'), '8.3');
  assert.equal(result.ratings.get('simkl'), '8.4');
  assert.ok(renderedRatingTtlByProvider.has('imdb'));
  assert.ok(renderedRatingTtlByProvider.has('mdblist'));
  assert.ok(renderedRatingTtlByProvider.has('trakt'));
  assert.ok(renderedRatingTtlByProvider.has('simkl'));
});

test('image route provider ratings resolve Allociné audience and press values from title lookups', async () => {
  const renderedRatingTtlByProvider = new Map();

  const result = await resolveImageRouteProviderRatings(
    {
      cleanId: 'tmdb:movie:603',
      imageType: 'poster',
      mediaType: 'movie',
      media: {
        id: 603,
        title: 'Matrix',
        original_title: 'The Matrix',
        release_date: '1999-03-31',
      },
      mediaId: '603',
      isTmdb: true,
      isKitsu: false,
      isAniListInput: false,
      idPrefix: 'tmdb',
      season: null,
      mappedImdbId: null,
      inputAnimeMappingProvider: null,
      inputAnimeMappingExternalId: null,
      requestedExternalRatings: new Set(['allocine', 'allocinepress']),
      shouldAttemptAnimeMapping: false,
      initialAllowAnimeOnlyRatings: false,
      initialHasConfirmedAnimeMapping: false,
      resolvedRatingMediaType: 'movie',
      releaseDate: '1999-03-31',
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
      fetchAniListRating: async () => null,
      fetchKitsuRating: async () => null,
      fetchMyAnimeListRating: async () => null,
      fetchTraktRating: async () => null,
      fetchSimklRating: async () => null,
      fetchAllocineRatings: async ({ title, originalTitle }) =>
        title === 'Matrix' && originalTitle === 'The Matrix'
          ? {
              allocine: '4.4',
              allocinepress: '3.4',
            }
          : null,
      fetchMdbListRatings: async () => null,
      getImdbRatingFromDataset: () => null,
      normalizeRatingValue: (value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric.toFixed(1) : null;
      },
    },
  );

  assert.equal(result.ratings.get('allocine'), '4.4');
  assert.equal(result.ratings.get('allocinepress'), '3.4');
  assert.ok(renderedRatingTtlByProvider.has('allocine'));
  assert.ok(renderedRatingTtlByProvider.has('allocinepress'));
});
