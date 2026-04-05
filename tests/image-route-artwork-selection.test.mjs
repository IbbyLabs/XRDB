import test from 'node:test';
import assert from 'node:assert/strict';

import { createImageRouteArtworkSelector } from '../lib/imageRouteArtworkSelection.ts';

const createEmptyResponse = () => ({
  ok: false,
  status: 404,
  data: null,
});

test('image route artwork selection prefers episode stills for thumbnail backdrops', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 77 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:77:1:2',
    season: '1',
    episode: '2',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) =>
      key.includes(':episode:2:')
        ? { ok: true, status: 200, data: { still_path: '/episode-still.jpg' } }
        : createEmptyResponse(),
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/episode-still.jpg');
  assert.equal(result.imgUrlOverride, null);
});

test('image route artwork selection keeps episodic backdrops on series art by default', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    mediaType: 'tv',
    media: { id: 77 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:77:1:2',
    season: '1',
    episode: '2',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async () => {
      throw new Error('episode still should not be fetched for default episodic backdrops');
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/series-backdrop.jpg');
  assert.equal(result.imgUrlOverride, null);
});

test('image route artwork selection can opt episodic backdrops into episode stills', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    mediaType: 'tv',
    media: { id: 77 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'still',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:77:1:2',
    season: '1',
    episode: '2',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) =>
      key.includes(':season:1:episode:2:details')
        ? { ok: true, status: 200, data: { still_path: '/episode-still.jpg' } }
        : createEmptyResponse(),
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/episode-still.jpg');
  assert.equal(result.imgUrlOverride, null);
});

test('image route artwork selection can opt thumbnails back to series backdrops', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 77 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'series',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:77:1:2',
    season: '1',
    episode: '2',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async () => {
      throw new Error('episode still should not be fetched when thumbnailEpisodeArtwork=series');
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/series-backdrop.jpg');
  assert.equal(result.imgUrlOverride, null);
});

test('image route artwork selection can source poster art from fanart', async () => {
  const selectArtwork = createImageRouteArtworkSelector(
    {
      imageType: 'poster',
      isThumbnailRequest: false,
      mediaType: 'movie',
      media: { id: 19, imdb_id: 'tt0099999' },
      details: { poster_path: '/tmdb-poster.jpg' },
      requestedImageLang: 'en',
      fallbackImageLang: 'en',
      posterTextPreference: 'clean',
      posterArtworkSource: 'fanart',
      backdropArtworkSource: 'tmdb',
      logoArtworkSource: 'tmdb',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      artworkSelectionSeed: 'seed-1',
      cleanId: 'tmdb:movie:19',
      season: null,
      episode: null,
      isKitsu: false,
      tmdbKey: 'tmdb-key',
      fanartKey: 'fanart-key',
      fanartClientKey: '',
      fanartTvdbId: null,
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getRemoteImageAspectRatio: async () => 2.2,
      resolveImdbId: async () => 'tt0099999',
    },
    {
      fetchFanartArtwork: async () => ({
        posterAssets: [{ url: 'https://fanart.example/poster.png', lang: 'en', likes: '3' }],
        posterUrls: ['https://fanart.example/poster.png'],
        backdropUrls: [],
        logoUrls: ['https://fanart.example/logo.png'],
      }),
    },
  );

  const result = await selectArtwork({
    posters: [],
    backdrops: [],
    logos: [{ file_path: '/tmdb-logo.png', iso_639_1: 'en', aspect_ratio: 2.0 }],
  });

  assert.equal(result.imgPath, '');
  assert.equal(result.imgUrlOverride, 'https://fanart.example/poster.png');
  assert.equal(result.logoPath, 'https://fanart.example/logo.png');
  assert.equal(result.posterIsTextless, false);
});

test('image route artwork selection marks fanart textless posters truthfully', async () => {
  const selectArtwork = createImageRouteArtworkSelector(
    {
      imageType: 'poster',
      isThumbnailRequest: false,
      mediaType: 'movie',
      media: { id: 19, imdb_id: 'tt0099999' },
      details: { poster_path: '/tmdb-poster.jpg' },
      requestedImageLang: 'en',
      fallbackImageLang: 'en',
      posterTextPreference: 'textless',
      posterArtworkSource: 'fanart',
      backdropArtworkSource: 'tmdb',
      logoArtworkSource: 'tmdb',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      artworkSelectionSeed: 'seed-1-textless',
      cleanId: 'tmdb:movie:19',
      season: null,
      episode: null,
      isKitsu: false,
      tmdbKey: 'tmdb-key',
      fanartKey: 'fanart-key',
      fanartClientKey: '',
      fanartTvdbId: null,
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getRemoteImageAspectRatio: async () => 2.2,
      resolveImdbId: async () => 'tt0099999',
    },
    {
      fetchFanartArtwork: async () => ({
        posterAssets: [
          { url: 'https://fanart.example/poster-text.png', lang: 'en', likes: '3' },
          { url: 'https://fanart.example/poster-textless.png', lang: '00', likes: '1' },
        ],
        posterUrls: [
          'https://fanart.example/poster-text.png',
          'https://fanart.example/poster-textless.png',
        ],
        backdropUrls: [],
        logoUrls: ['https://fanart.example/logo.png'],
      }),
    },
  );

  const result = await selectArtwork({
    posters: [],
    backdrops: [],
    logos: [{ file_path: '/tmdb-logo.png', iso_639_1: 'en', aspect_ratio: 2.0 }],
  });

  assert.equal(result.imgUrlOverride, 'https://fanart.example/poster-textless.png');
  assert.equal(result.posterIsTextless, true);
});

test('image route artwork selection can source poster art from OMDb', async () => {
  const selectArtwork = createImageRouteArtworkSelector(
    {
      imageType: 'poster',
      isThumbnailRequest: false,
      mediaType: 'movie',
      media: { id: 19, imdb_id: 'tt0099999' },
      details: { poster_path: '/tmdb-poster.jpg' },
      requestedImageLang: 'en',
      fallbackImageLang: 'en',
      posterTextPreference: 'original',
      posterArtworkSource: 'omdb',
      backdropArtworkSource: 'tmdb',
      logoArtworkSource: 'tmdb',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      artworkSelectionSeed: 'seed-omdb',
      cleanId: 'tmdb:movie:19',
      season: null,
      episode: null,
      isKitsu: false,
      tmdbKey: 'tmdb-key',
      fanartKey: '',
      fanartClientKey: '',
      fanartTvdbId: null,
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getRemoteImageAspectRatio: async () => 2.2,
      resolveImdbId: async () => 'tt0099999',
    },
    {
      resolveOmdbPosterUrl: async ({ imdbId }) =>
        imdbId === 'tt0099999' ? 'https://m.media-amazon.com/images/M/test.jpg' : null,
    },
  );

  const result = await selectArtwork({
    posters: [],
    backdrops: [],
    logos: [{ file_path: '/tmdb-logo.png', iso_639_1: 'en', aspect_ratio: 2.0 }],
  });

  assert.equal(result.imgPath, '');
  assert.equal(result.imgUrlOverride, 'https://m.media-amazon.com/images/M/test.jpg');
  assert.equal(result.logoPath, '/tmdb-logo.png');
  assert.equal(result.posterIsTextless, false);
});

test('image route artwork selection skips OMDb poster source when textless art is required', async () => {
  const selectArtwork = createImageRouteArtworkSelector(
    {
      imageType: 'poster',
      isThumbnailRequest: false,
      mediaType: 'movie',
      media: { id: 19, imdb_id: 'tt0099999' },
      details: { poster_path: '/tmdb-poster.jpg' },
      requestedImageLang: 'en',
      fallbackImageLang: 'en',
      posterTextPreference: 'textless',
      posterArtworkSource: 'omdb',
      backdropArtworkSource: 'tmdb',
      logoArtworkSource: 'tmdb',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      artworkSelectionSeed: 'seed-omdb-textless',
      cleanId: 'tmdb:movie:19',
      season: null,
      episode: null,
      isKitsu: false,
      tmdbKey: 'tmdb-key',
      fanartKey: '',
      fanartClientKey: '',
      fanartTvdbId: null,
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getRemoteImageAspectRatio: async () => 2.2,
      resolveImdbId: async () => 'tt0099999',
    },
    {
      resolveOmdbPosterUrl: async () => 'https://m.media-amazon.com/images/M/test.jpg',
    },
  );

  const result = await selectArtwork({
    posters: [{ file_path: '/tmdb-textless.jpg', iso_639_1: null }],
    backdrops: [],
    logos: [{ file_path: '/tmdb-logo.png', iso_639_1: 'en', aspect_ratio: 2.0 }],
  });

  assert.equal(result.imgPath, '/tmdb-textless.jpg');
  assert.equal(result.imgUrlOverride, null);
  assert.equal(result.posterIsTextless, true);
});

test('image route artwork selection skips Cinemeta backdrops when textless art is required', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    mediaType: 'movie',
    media: { id: 19, imdb_id: 'tt0099999', backdrop_path: '/fallback-backdrop.jpg' },
    details: { backdrop_path: '/details-backdrop.jpg' },
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'textless',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'cinemeta',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: 'seed-cinemeta-textless',
    cleanId: 'tmdb:movie:19',
    season: null,
    episode: null,
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async () => createEmptyResponse(),
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => 'tt0099999',
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/tmdb-textless-backdrop.jpg', iso_639_1: null }],
    logos: [],
  });

  assert.equal(result.imgPath, '/tmdb-textless-backdrop.jpg');
  assert.equal(result.imgUrlOverride, null);
});

test('image route artwork selection can source textless backdrops from fanart', async () => {
  const selectArtwork = createImageRouteArtworkSelector(
    {
      imageType: 'backdrop',
      isThumbnailRequest: false,
      mediaType: 'movie',
      media: { id: 19, imdb_id: 'tt0099999' },
      details: { backdrop_path: '/tmdb-backdrop.jpg' },
      requestedImageLang: 'en',
      fallbackImageLang: 'en',
      posterTextPreference: 'textless',
      posterArtworkSource: 'tmdb',
      backdropArtworkSource: 'fanart',
      logoArtworkSource: 'tmdb',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      artworkSelectionSeed: 'seed-fanart-backdrop-textless',
      cleanId: 'tmdb:movie:19',
      season: null,
      episode: null,
      isKitsu: false,
      tmdbKey: 'tmdb-key',
      fanartKey: 'fanart-key',
      fanartClientKey: '',
      fanartTvdbId: null,
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getRemoteImageAspectRatio: async () => null,
      resolveImdbId: async () => 'tt0099999',
    },
    {
      fetchFanartArtwork: async () => ({
        posterAssets: [],
        posterUrls: [],
        backdropAssets: [
          { url: 'https://fanart.example/backdrop-text.png', lang: 'en', likes: '3' },
          { url: 'https://fanart.example/backdrop-textless.png', lang: '00', likes: '1' },
        ],
        backdropUrls: [
          'https://fanart.example/backdrop-text.png',
          'https://fanart.example/backdrop-textless.png',
        ],
        logoUrls: ['https://fanart.example/logo.png'],
      }),
    },
  );

  const result = await selectArtwork({
    posters: [],
    backdrops: [],
    logos: [{ file_path: '/tmdb-logo.png', iso_639_1: 'en', aspect_ratio: 2.0 }],
  });

  assert.equal(result.imgPath, '');
  assert.equal(result.imgUrlOverride, 'https://fanart.example/backdrop-textless.png');
});

test('image route artwork selection measures TMDB logo aspect ratio from the visible logo image', async () => {
  const measuredLogoUrls = [];
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'logo',
    isThumbnailRequest: false,
    mediaType: 'movie',
    media: { id: 19, imdb_id: 'tt0099999' },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: 'seed-2',
    cleanId: 'tmdb:movie:19',
    season: null,
    episode: null,
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async () => createEmptyResponse(),
    getRemoteImageAspectRatio: async (url) => {
      measuredLogoUrls.push(url);
      return 2.25;
    },
    resolveImdbId: async () => 'tt0099999',
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [],
    logos: [{ file_path: '/tmdb-logo.png', iso_639_1: 'en', aspect_ratio: 5.5 }],
  });

  assert.equal(result.imgPath, '/tmdb-logo.png');
  assert.equal(result.imgUrlOverride, null);
  assert.equal(result.logoPath, '/tmdb-logo.png');
  assert.equal(result.logoAspectRatio, 2.25);
  assert.deepEqual(measuredLogoUrls, ['https://image.tmdb.org/t/p/w500/tmdb-logo.png']);
});

test('image route artwork selection keeps normal artwork when black bar source is selected', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    mediaType: 'movie',
    media: { id: 19, imdb_id: 'tt0099999', backdrop_path: '/fallback-backdrop.jpg' },
    details: { backdrop_path: '/details-backdrop.jpg' },
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'blackbar',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: 'seed-blackbar',
    cleanId: 'tmdb:movie:19',
    season: null,
    episode: null,
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async () => createEmptyResponse(),
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => 'tt0099999',
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/tmdb-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/tmdb-backdrop.jpg');
  assert.equal(result.imgUrlOverride, null);
});

test('image route artwork selection falls back to TMDB images endpoint when primary still is missing', async () => {
  const fetchCalls = [];
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 200 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:200:3:1',
    season: '3',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key, url) => {
      fetchCalls.push(key);
      if (key.includes(':images')) {
        return {
          ok: true,
          status: 200,
          data: { stills: [{ file_path: '/images-still.jpg', iso_639_1: null }] },
        };
      }
      return { ok: true, status: 200, data: { still_path: null } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/images-still.jpg');
  assert.ok(fetchCalls.some((k) => k.includes(':images')));
});

test('image route artwork selection falls back to null language TMDB query when images endpoint also empty', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 200 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:200:3:1',
    season: '3',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) => {
      if (key.includes(':nolang')) {
        return { ok: true, status: 200, data: { still_path: '/nolang-still.jpg' } };
      }
      if (key.includes(':images')) {
        return { ok: true, status: 200, data: { stills: [] } };
      }
      return { ok: true, status: 200, data: { still_path: null } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/nolang-still.jpg');
});

test('image route artwork selection falls back to series backdrop when all episode still sources fail', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 200 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:200:3:1',
    season: '3',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) => {
      if (key.includes(':images')) {
        return { ok: true, status: 200, data: { stills: [] } };
      }
      return { ok: true, status: 200, data: { still_path: null } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/series-backdrop.jpg');
});

test('image route artwork selection falls back to AniList episode thumbnail when all TMDB sources fail', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 200 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:200:2:5',
    season: '2',
    episode: '5',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      if (key.startsWith('anime:reverse:')) {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 12345 } } },
        };
      }
      if (key.startsWith('anilist:anime:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: [
                  { title: 'Episode 1 - Pilot', thumbnail: 'https://cdn.anilist.co/ep1.jpg' },
                  { title: 'Episode 2 - Next', thumbnail: 'https://cdn.anilist.co/ep2.jpg' },
                  { title: 'Episode 3 - Third', thumbnail: 'https://cdn.anilist.co/ep3.jpg' },
                  { title: 'Episode 4 - Fourth', thumbnail: 'https://cdn.anilist.co/ep4.jpg' },
                  { title: 'Episode 5 - Fifth', thumbnail: 'https://cdn.anilist.co/ep5.jpg' },
                ],
              },
            },
          },
        };
      }
      if (key.includes(':images')) {
        return { ok: true, status: 200, data: { stills: [] } };
      }
      return { ok: true, status: 200, data: { still_path: null } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/ep5.jpg');
  assert.equal(result.imgPath, '');
});

test('image route artwork selection uses AniList episode index fallback when title does not match', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 200 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:200:1:2',
    season: '1',
    episode: '2',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      if (key.startsWith('anime:reverse:')) {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 99 } } },
        };
      }
      if (key.startsWith('anilist:anime:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: [
                  { title: 'Untitled Ep 1', thumbnail: 'https://cdn.anilist.co/a.jpg' },
                  { title: 'Untitled Ep 2', thumbnail: 'https://cdn.anilist.co/b.jpg' },
                ],
              },
            },
          },
        };
      }
      if (key.includes(':images')) {
        return { ok: true, status: 200, data: { stills: [] } };
      }
      return { ok: true, status: 200, data: { still_path: null } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/b.jpg');
});

test('image route artwork selection degrades to series backdrop when AniList reverse mapping fails', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 200 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:200:3:1',
    season: '3',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) => {
      if (key.startsWith('anime:reverse:')) {
        return { ok: false, status: 500, data: null };
      }
      if (key.includes(':images')) {
        return { ok: true, status: 200, data: { stills: [] } };
      }
      return { ok: true, status: 200, data: { still_path: null } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/series-backdrop.jpg');
});
