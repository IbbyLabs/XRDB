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
      posterTextPreference: 'clean',
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

test('image route artwork selection supports black bar background source', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: false,
    mediaType: 'movie',
    media: { id: 19, imdb_id: 'tt0099999' },
    details: null,
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
    backdrops: [],
    logos: [],
  });

  assert.equal(result.imgPath, '');
  assert.match(result.imgUrlOverride || '', /^data:image\/svg\+xml;base64,/);
});
