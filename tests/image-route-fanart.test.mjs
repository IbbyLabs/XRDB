import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchFanartArtwork } from '../lib/imageRouteFanart.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

test('image route fanart returns null when required keys are missing', async () => {
  const fetchJsonCached = async () => {
    throw new Error('should not be called');
  };

  await assert.doesNotReject(async () => {
    assert.equal(
      await fetchFanartArtwork({
        mediaType: 'movie',
        tmdbId: '42',
        fanartKey: '',
        requestedLang: 'en',
        fallbackLang: 'en',
        phases,
        fetchJsonCached,
      }),
      null,
    );
  });

  await assert.doesNotReject(async () => {
    assert.equal(
      await fetchFanartArtwork({
        mediaType: 'tv',
        tmdbId: '42',
        tvdbId: '',
        fanartKey: 'fanart-key',
        requestedLang: 'en',
        fallbackLang: 'en',
        phases,
        fetchJsonCached,
      }),
      null,
    );
  });
});

test('image route fanart builds movie lookups and sorts artwork by language and likes', async () => {
  const requests = [];
  const fetchJsonCached = async (key, url, ttlMs, passedPhases, phase) => {
    requests.push({ key, url, ttlMs, passedPhases, phase });
    return {
      ok: true,
      status: 200,
      data: {
        movieposter: [
          { url: 'https://img.example/en-low.jpg', lang: 'en', likes: '1' },
          { url: 'https://img.example/fr.jpg', lang: 'fr', likes: '2' },
          { url: 'https://img.example/en-low.jpg', lang: 'en', likes: '9' },
        ],
        moviebackground: [
          { url: 'https://img.example/bg-en.jpg', lang: 'en', likes: '1' },
          { url: 'https://img.example/bg-fr.jpg', lang: 'fr', likes: '0' },
        ],
        hdmovielogo: [
          { url: 'https://img.example/logo-null.png', lang: '', likes: '4' },
        ],
        movielogo: [
          { url: 'https://img.example/logo-fr.png', lang: 'fr', likes: '1' },
        ],
      },
    };
  };

  const artwork = await fetchFanartArtwork({
    mediaType: 'movie',
    tmdbId: '42',
    fanartKey: 'fanart-key',
    fanartClientKey: 'client-key',
    requestedLang: 'fr',
    fallbackLang: 'en',
    phases,
    fetchJsonCached,
  });

  assert.match(requests[0].key, /^fanart:movie:42:key:[a-f0-9]{40}:client:[a-f0-9]{40}$/);
  assert.equal(
    requests[0].url,
    'https://webservice.fanart.tv/v3/movies/42?api_key=fanart-key&client_key=client-key',
  );
  assert.equal(requests[0].phase, 'fanart');
  assert.equal(artwork.posterUrls[0], 'https://img.example/fr.jpg');
  assert.deepEqual(artwork.backdropUrls, [
    'https://img.example/bg-fr.jpg',
    'https://img.example/bg-en.jpg',
  ]);
  assert.deepEqual(artwork.logoUrls, [
    'https://img.example/logo-fr.png',
    'https://img.example/logo-null.png',
  ]);
});

test('image route fanart uses tvdb ids for shows and returns null on invalid payloads', async () => {
  const requests = [];
  const fetchJsonCached = async (key, url) => {
    requests.push({ key, url });
    return {
      ok: false,
      status: 404,
      data: null,
    };
  };

  const artwork = await fetchFanartArtwork({
    mediaType: 'tv',
    tmdbId: '42',
    tvdbId: '9001',
    fanartKey: 'fanart-key',
    requestedLang: 'en',
    fallbackLang: 'en',
    phases,
    fetchJsonCached,
  });

  assert.equal(artwork, null);
  assert.match(requests[0].key, /^fanart:tv:9001:key:/);
  assert.equal(
    requests[0].url,
    'https://webservice.fanart.tv/v3/tv/9001?api_key=fanart-key',
  );
});
