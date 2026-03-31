import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReverseMappedAnimeImageTarget } from '../lib/animeReverseMapping.ts';

test('reverse-mapped anime images fall back to Kitsu when TMDB details are missing', async () => {
  const calls = [];

  const result = await resolveReverseMappedAnimeImageTarget({
    imageType: 'poster',
    fetchTmdbId: async () => {
      calls.push('fetchTmdbId');
      return '1429';
    },
    fetchKitsuId: async () => {
      calls.push('fetchKitsuId');
      return '42';
    },
    fetchTmdbMedia: async (tmdbId, mediaType) => {
      calls.push(`fetchTmdbMedia:${tmdbId}:${mediaType}`);
      return null;
    },
    fetchKitsuFallbackAsset: async (kitsuId, imageType) => {
      calls.push(`fetchKitsuFallbackAsset:${kitsuId}:${imageType}`);
      return {
        imageUrl: 'https://cdn.example.com/poster.jpg',
        rating: '83',
        title: 'Spirited Away',
        logoAspectRatio: null,
      };
    },
  });

  assert.deepEqual(calls, [
    'fetchTmdbId',
    'fetchTmdbMedia:1429:tv',
    'fetchTmdbMedia:1429:movie',
    'fetchKitsuId',
    'fetchKitsuFallbackAsset:42:poster',
  ]);
  assert.deepEqual(result, {
    kind: 'kitsu-fallback',
    tmdbId: '1429',
    kitsuId: '42',
    fallbackAsset: {
      imageUrl: 'https://cdn.example.com/poster.jpg',
      rating: '83',
      title: 'Spirited Away',
      logoAspectRatio: null,
    },
  });
});

test('reverse-mapped anime images fall back to Kitsu when TMDB mapping is missing', async () => {
  const calls = [];

  const result = await resolveReverseMappedAnimeImageTarget({
    imageType: 'logo',
    fetchTmdbId: async () => {
      calls.push('fetchTmdbId');
      return null;
    },
    fetchKitsuId: async () => {
      calls.push('fetchKitsuId');
      return '99';
    },
    fetchTmdbMedia: async (tmdbId, mediaType) => {
      calls.push(`fetchTmdbMedia:${tmdbId}:${mediaType}`);
      return { unexpected: true };
    },
    fetchKitsuFallbackAsset: async (kitsuId, imageType) => {
      calls.push(`fetchKitsuFallbackAsset:${kitsuId}:${imageType}`);
      return {
        imageUrl: 'data:image/svg+xml;base64,abc',
        rating: '91',
        title: 'Cowboy Bebop',
        logoAspectRatio: 2.4,
      };
    },
  });

  assert.deepEqual(calls, [
    'fetchTmdbId',
    'fetchKitsuId',
    'fetchKitsuFallbackAsset:99:logo',
  ]);
  assert.deepEqual(result, {
    kind: 'kitsu-fallback',
    tmdbId: null,
    kitsuId: '99',
    fallbackAsset: {
      imageUrl: 'data:image/svg+xml;base64,abc',
      rating: '91',
      title: 'Cowboy Bebop',
      logoAspectRatio: 2.4,
    },
  });
});
