import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ANIME_MAPPING_BASE_URL,
  DEFAULT_KITSU_API_BASE_URL,
  DEFAULT_OMDB_API_BASE_URL,
  DEFAULT_TMDB_API_BASE_URL,
  resolveServiceBaseUrls,
} from '../lib/serviceBaseUrls.ts';

test('resolveServiceBaseUrls falls back to documented defaults when env vars are unset', () => {
  const baseUrls = resolveServiceBaseUrls({});

  assert.deepEqual(baseUrls, {
    tmdbApiBaseUrl: DEFAULT_TMDB_API_BASE_URL,
    animeMappingBaseUrl: DEFAULT_ANIME_MAPPING_BASE_URL,
    kitsuApiBaseUrl: DEFAULT_KITSU_API_BASE_URL,
    omdbApiBaseUrl: DEFAULT_OMDB_API_BASE_URL,
  });
});

test('resolveServiceBaseUrls trims overrides and strips trailing slashes', () => {
  const baseUrls = resolveServiceBaseUrls({
    XRDB_TMDB_API_BASE_URL: ' https://tmdb.example.com/root/ ',
    XRDB_ANIME_MAPPING_BASE_URL: 'https://mapping.example.com/api///',
    XRDB_KITSU_API_BASE_URL: ' https://kitsu.example.com/edge/ ',
    XRDB_OMDB_API_BASE_URL: ' https://omdb.example.com/api/ ',
  });

  assert.deepEqual(baseUrls, {
    tmdbApiBaseUrl: 'https://tmdb.example.com/root',
    animeMappingBaseUrl: 'https://mapping.example.com/api',
    kitsuApiBaseUrl: 'https://kitsu.example.com/edge',
    omdbApiBaseUrl: 'https://omdb.example.com/api',
  });
});
