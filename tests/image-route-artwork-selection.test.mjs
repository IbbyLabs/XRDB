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

test('image route artwork selection prefers locale specific TMDB poster paths over generic image language matches', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'poster',
    isThumbnailRequest: false,
    mediaType: 'movie',
    media: { id: 19, poster_path: '/poster-spain.jpg' },
    details: { poster_path: '/poster-mexico.jpg' },
    requestedImageLang: 'es-MX',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'still',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: 'seed-es-mx',
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
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [
      { file_path: '/poster-spain.jpg', iso_639_1: 'es' },
      { file_path: '/poster-mexico.jpg', iso_639_1: 'es' },
      { file_path: '/poster-english.jpg', iso_639_1: 'en' },
    ],
    backdrops: [],
    logos: [],
  });

  assert.equal(result.imgPath, '/poster-mexico.jpg');
  assert.equal(result.imgUrlOverride, null);
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

test('image route artwork selection uses canonical TVDB ids for Fanart fallbacks when TMDB external ids are absent', async () => {
  let capturedTvdbId = null;

  const selectArtwork = createImageRouteArtworkSelector(
    {
      imageType: 'poster',
      isThumbnailRequest: false,
      mediaType: 'tv',
      media: { id: 95479 },
      details: { poster_path: '/tmdb-poster.jpg' },
      requestedImageLang: 'en',
      fallbackImageLang: 'en',
      posterTextPreference: 'original',
      posterArtworkSource: 'fanart',
      backdropArtworkSource: 'tmdb',
      logoArtworkSource: 'tmdb',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      artworkSelectionSeed: 'fanart-canonical-tvdb',
      cleanId: 'tmdb:tv:95479',
      season: '2',
      episode: '1',
      isKitsu: false,
      tmdbKey: 'tmdb-key',
      fanartKey: 'fanart-key',
      fanartClientKey: '',
      fanartTvdbId: null,
      phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
      fetchJsonCached: async () => createEmptyResponse(),
      getRemoteImageAspectRatio: async () => 2.2,
      resolveImdbId: async () => 'tt12343534',
      canonicalSeriesIdentity: {
        canonicalSeriesId: 'tmdb:95479',
        provider: 'tmdb',
        externalId: '95479',
        mediaType: 'tv',
        mappedIds: { imdb: 'tt12343534', tmdb: '95479', tvdb: '121361' },
        links: [],
        source: 'mapping',
        confidence: 0.92,
        sourceUpdatedAt: Date.now(),
      },
      canonicalEpisodeIdentity: {
        canonicalEpisodeId: 'tmdb:95479:ep2-1',
        canonicalSeriesId: 'tmdb:95479',
        season: '2',
        episode: '1',
        absoluteEpisode: '13',
        mappedIds: { imdb: 'tt12343534', tmdb: '95479', tvdb: '121361' },
        providerRefs: [],
        source: 'mapping',
        confidence: 0.92,
        sourceUpdatedAt: Date.now(),
      },
    },
    {
      fetchFanartArtwork: async ({ tvdbId }) => {
        capturedTvdbId = tvdbId;
        return {
          posterAssets: [{ url: 'https://fanart.example/tv-poster.png', lang: 'en', likes: '3' }],
          posterUrls: ['https://fanart.example/tv-poster.png'],
          backdropAssets: [],
          backdropUrls: [],
          logoUrls: [],
        };
      },
    },
  );

  const result = await selectArtwork({
    posters: [],
    backdrops: [],
    logos: [],
  });

  assert.equal(capturedTvdbId, '121361');
  assert.equal(result.imgUrlOverride, 'https://fanart.example/tv-poster.png');
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

test('image route artwork selection uses canonical AniList ids and absolute episode authority before reverse mapping fallback', async () => {
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
    cleanId: 'tmdb:tv:200:2:1',
    season: '2',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    canonicalSeriesIdentity: {
      canonicalSeriesId: 'imdb:tt12343534',
      provider: 'imdb',
      externalId: 'tt12343534',
      mediaType: 'tv',
      mappedIds: { imdb: 'tt12343534', anilist: '12345', tmdb: '200' },
      links: [],
      source: 'reverse-mapping',
      confidence: 0.9,
      sourceUpdatedAt: Date.now(),
    },
    canonicalEpisodeIdentity: {
      canonicalEpisodeId: 'imdb:tt12343534:ep13',
      canonicalSeriesId: 'imdb:tt12343534',
      season: '2',
      episode: '1',
      absoluteEpisode: '13',
      mappedIds: { imdb: 'tt12343534', anilist: '12345', tmdb: '200' },
      providerRefs: [],
      source: 'reverse-mapping',
      confidence: 0.9,
    },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      fetchCalls.push(key);
      if (key.startsWith('anilist:anime:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: Array.from({ length: 13 }, (_, index) => ({
                  title: `Episode ${index + 1}`,
                  thumbnail: `https://cdn.anilist.co/ep${index + 1}.jpg`,
                })),
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
    resolveImdbId: async () => 'tt12343534',
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/ep13.jpg');
  assert.equal(fetchCalls.some((key) => key.startsWith('anime:reverse:')), false);
});

test('image route artwork selection prefers episode AniList ids over broader series mappings', async () => {
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
    cleanId: 'tmdb:tv:200:2:1',
    season: '2',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    canonicalSeriesIdentity: {
      canonicalSeriesId: 'imdb:tt12343534',
      provider: 'imdb',
      externalId: 'tt12343534',
      mediaType: 'tv',
      mappedIds: { imdb: 'tt12343534', anilist: '99999', tmdb: '200' },
      links: [],
      source: 'reverse-mapping',
      confidence: 0.9,
      sourceUpdatedAt: Date.now(),
    },
    canonicalEpisodeIdentity: {
      canonicalEpisodeId: 'imdb:tt12343534:ep13',
      canonicalSeriesId: 'imdb:tt12343534',
      season: '2',
      episode: '1',
      absoluteEpisode: '13',
      mappedIds: { imdb: 'tt12343534', anilist: '12345', tmdb: '200' },
      providerRefs: [],
      source: 'reverse-mapping',
      confidence: 0.9,
    },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      fetchCalls.push(key);
      if (key.startsWith('anilist:anime:12345:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: Array.from({ length: 13 }, (_, index) => ({
                  title: `Episode ${index + 1}`,
                  thumbnail: `https://cdn.anilist.co/episode-first-${index + 1}.jpg`,
                })),
              },
            },
          },
        };
      }
      if (key.startsWith('anilist:anime:99999:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: Array.from({ length: 13 }, (_, index) => ({
                  title: `Episode ${index + 1}`,
                  thumbnail: `https://cdn.anilist.co/series-first-${index + 1}.jpg`,
                })),
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
    resolveImdbId: async () => 'tt12343534',
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/episode-first-13.jpg');
  assert.ok(fetchCalls.some((key) => key.startsWith('anilist:anime:12345:')));
  assert.equal(fetchCalls.some((key) => key.startsWith('anilist:anime:99999:')), false);
});

test('image route artwork selection prefers canonical episode provider refs over series ids for AniList fallback reverse mapping', async () => {
  const fetchCalls = [];
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 95479 },
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
    cleanId: 'tmdb:tv:95479',
    season: '2',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    canonicalSeriesIdentity: {
      canonicalSeriesId: 'tmdb:95479',
      provider: 'tmdb',
      externalId: '95479',
      mediaType: 'tv',
      mappedIds: { tmdb: '95479' },
      links: [],
      source: 'raw',
      confidence: 0.5,
      sourceUpdatedAt: Date.now(),
    },
    canonicalEpisodeIdentity: {
      canonicalEpisodeId: 'tmdb:95479:ep2-1',
      canonicalSeriesId: 'tmdb:95479',
      season: '2',
      episode: '1',
      absoluteEpisode: '13',
      mappedIds: { tmdb: '95479' },
      providerRefs: [
        {
          provider: 'mal',
          seriesExternalId: '11061',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '13',
          source: 'reverse-mapping',
          confidence: 0.9,
        },
      ],
      source: 'reverse-mapping',
      confidence: 0.9,
    },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      fetchCalls.push(key);
      if (key === 'anime:reverse:mal:11061:s:2:e:1') {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 12345 } } },
        };
      }
      if (key.startsWith('anilist:anime:12345:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: Array.from({ length: 13 }, (_, index) => ({
                  title: `Episode ${index + 1}`,
                  thumbnail: `https://cdn.anilist.co/ref-${index + 1}.jpg`,
                })),
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

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/ref-13.jpg');
  assert.ok(fetchCalls.includes('anime:reverse:mal:11061:s:2:e:1'));
  assert.ok(!fetchCalls.includes('anime:reverse:tmdb:95479:s:2:e:1'));
});

test('image route artwork selection treats Kitsu provider refs as valid reverse-mapping authority', async () => {
  const fetchCalls = [];
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 95479 },
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
    cleanId: 'tmdb:tv:95479',
    season: '2',
    episode: '7',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    canonicalSeriesIdentity: {
      canonicalSeriesId: 'tmdb:95479',
      provider: 'tmdb',
      externalId: '95479',
      mediaType: 'tv',
      mappedIds: { tmdb: '95479' },
      links: [],
      source: 'raw',
      confidence: 0.5,
      sourceUpdatedAt: Date.now(),
    },
    canonicalEpisodeIdentity: {
      canonicalEpisodeId: 'tmdb:95479:ep2-7',
      canonicalSeriesId: 'tmdb:95479',
      season: '2',
      episode: '7',
      absoluteEpisode: '7',
      mappedIds: { tmdb: '95479' },
      providerRefs: [
        {
          provider: 'kitsu',
          seriesExternalId: '42765',
          seasonNumber: '42',
          episodeNumber: '7',
          absoluteEpisodeNumber: '7',
          source: 'reverse-mapping',
          confidence: 0.9,
        },
      ],
      source: 'reverse-mapping',
      confidence: 0.9,
    },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      fetchCalls.push(key);
      if (key === 'anime:reverse:kitsu:42765:s:42:e:7') {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 12345 } } },
        };
      }
      if (key.startsWith('anilist:anime:12345:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: Array.from({ length: 7 }, (_, index) => ({
                  title: `Episode ${index + 1}`,
                  thumbnail: `https://cdn.anilist.co/kitsu-ref-${index + 1}.jpg`,
                })),
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

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/kitsu-ref-7.jpg');
  assert.ok(fetchCalls.includes('anime:reverse:kitsu:42765:s:42:e:7'));
  assert.ok(!fetchCalls.includes('anime:reverse:tmdb:95479:s:2:e:7'));
});

test('image route artwork selection keeps provider-native episode coordinates for reverse-mapping fallbacks', async () => {
  const fetchCalls = [];
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 95479 },
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
    cleanId: 'tmdb:tv:95479',
    season: '3',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    canonicalSeriesIdentity: {
      canonicalSeriesId: 'tmdb:95479',
      provider: 'tmdb',
      externalId: '95479',
      mediaType: 'tv',
      mappedIds: { tmdb: '95479' },
      links: [],
      source: 'raw',
      confidence: 0.5,
      sourceUpdatedAt: Date.now(),
    },
    canonicalEpisodeIdentity: {
      canonicalEpisodeId: 'tmdb:95479:ep3-1',
      canonicalSeriesId: 'tmdb:95479',
      season: '3',
      episode: '1',
      absoluteEpisode: '25',
      mappedIds: { tmdb: '95479' },
      providerRefs: [
        {
          provider: 'mal',
          seriesExternalId: '11061',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '25',
          source: 'override',
          confidence: 1,
        },
      ],
      source: 'override',
      confidence: 1,
    },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      fetchCalls.push(key);
      if (key === 'anime:reverse:mal:11061:s:2:e:1') {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 12345 } } },
        };
      }
      if (key.startsWith('anilist:anime:12345:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: Array.from({ length: 25 }, (_, index) => ({
                  title: `Episode ${index + 1}`,
                  thumbnail: `https://cdn.anilist.co/split-cour-${index + 1}.jpg`,
                })),
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

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/split-cour-25.jpg');
  assert.ok(fetchCalls.includes('anime:reverse:mal:11061:s:2:e:1'));
  assert.ok(!fetchCalls.includes('anime:reverse:mal:11061:s:3:e:1'));
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

test('image route artwork selection uses AniList streaming thumbnail first in streaming mode', async () => {
  let tmdbCalled = false;
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 300 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'streaming',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:300:1:3',
    season: '1',
    episode: '3',
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
          data: { mappings: { ids: { anilist: 500 } } },
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
                  { title: 'Episode 1 - Opening', thumbnail: 'https://cdn.anilist.co/s1.jpg' },
                  { title: 'Episode 2 - Rising', thumbnail: 'https://cdn.anilist.co/s2.jpg' },
                  { title: 'Episode 3 - Clash', thumbnail: 'https://cdn.anilist.co/s3.jpg' },
                ],
              },
            },
          },
        };
      }
      tmdbCalled = true;
      return { ok: true, status: 200, data: { still_path: '/tmdb-still.jpg' } };
    },
    getRemoteImageAspectRatio: async () => null,
    resolveImdbId: async () => null,
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgUrlOverride, 'https://cdn.anilist.co/s3.jpg');
  assert.equal(result.imgPath, '');
  assert.equal(tmdbCalled, false);
});

test('image route artwork selection prefers IMDb reverse mapping for AniList fallback when IMDb is available', async () => {
  const fetchCalls = [];
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 95479, imdb_id: 'tt12343534' },
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
    cleanId: 'tmdb:tv:95479',
    season: '3',
    episode: '1',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key, _url, _ttl, _phases, _phase, init) => {
      fetchCalls.push(key);
      if (key === 'anime:reverse:imdb:tt12343534:s:3:e:1') {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 172463 } } },
        };
      }
      if (key === 'anime:reverse:tmdb:95479:s:3:e:1') {
        return {
          ok: true,
          status: 200,
          data: { mappings: { ids: { anilist: 113415 } } },
        };
      }
      if (key.startsWith('anilist:anime:172463:') && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          data: {
            data: {
              Media: {
                streamingEpisodes: [],
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
    resolveImdbId: async () => 'tt12343534',
  });

  const result = await selectArtwork({
    posters: [],
    backdrops: [{ file_path: '/series-backdrop.jpg', iso_639_1: 'en' }],
    logos: [],
  });

  assert.equal(result.imgPath, '/series-backdrop.jpg');
  assert.equal(result.imgUrlOverride, null);
  assert.ok(fetchCalls.includes('anime:reverse:imdb:tt12343534:s:3:e:1'));
  assert.ok(!fetchCalls.includes('anime:reverse:tmdb:95479:s:3:e:1'));
});

test('image route artwork selection falls through to TMDB still in streaming mode when AniList returns nothing', async () => {
  const selectArtwork = createImageRouteArtworkSelector({
    imageType: 'backdrop',
    isThumbnailRequest: true,
    mediaType: 'tv',
    media: { id: 301 },
    details: null,
    requestedImageLang: 'en',
    fallbackImageLang: 'en',
    posterTextPreference: 'original',
    posterArtworkSource: 'tmdb',
    backdropArtworkSource: 'tmdb',
    logoArtworkSource: 'tmdb',
    thumbnailEpisodeArtwork: 'streaming',
    backdropEpisodeArtwork: 'series',
    artworkSelectionSeed: '',
    cleanId: 'tmdb:tv:301:1:2',
    season: '1',
    episode: '2',
    isKitsu: false,
    tmdbKey: 'tmdb-key',
    fanartKey: '',
    fanartClientKey: '',
    fanartTvdbId: null,
    phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
    fetchJsonCached: async (key) => {
      if (key.startsWith('anime:reverse:')) {
        return { ok: false, status: 404, data: null };
      }
      if (key === 'tmdb:tv:301:season:1:episode:2:en') {
        return { ok: true, status: 200, data: { still_path: '/tmdb-ep-still.jpg' } };
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

  assert.equal(result.imgPath, '/tmdb-ep-still.jpg');
  assert.equal(result.imgUrlOverride, null);
});
