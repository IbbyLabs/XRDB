import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProxyForwardUrl,
  parseProxyRouteConfig,
} from '../lib/proxyRoutePlan.ts';

test('proxy route handler strips reserved params when building the forward URL', () => {
  const searchParams = new URLSearchParams({
    tmdbKey: 'secret',
    mdblistKey: 'hidden',
    url: 'https://addon.example.com/manifest.json',
    xrdbKey: 'fallback',
    lang: 'en',
    posterRatings: 'imdb,tmdb',
  });

  const forwardUrl = buildProxyForwardUrl(
    'https://addon.example.com/base',
    ['catalog', 'movie', 'top', 'skip=0.json'],
    searchParams,
  );

  assert.equal(
    forwardUrl.toString(),
    'https://addon.example.com/base/catalog/movie/top/skip=0.json',
  );
});

test('proxy route handler parses query config without consuming the resource path', () => {
  const searchParams = new URLSearchParams({
    url: 'https://addon.example.com/manifest.json',
    tmdbKey: 'tmdb',
    mdblistKey: 'mdblist',
    translateMetaMode: 'hybrid',
    catalogPlan: 'ZXhhbXBsZQ',
  });

  const parsed = parseProxyRouteConfig(searchParams, ['meta', 'movie', 'tt123.json']);

  assert.equal(parsed.error, undefined);
  assert.equal(parsed.config?.url, 'https://addon.example.com/manifest.json');
  assert.equal(parsed.config?.tmdbKey, 'tmdb');
  assert.equal(parsed.config?.mdblistKey, 'mdblist');
  assert.equal(parsed.config?.translateMetaMode, 'fill-missing');
  assert.equal(parsed.config?.catalogPlan, 'ZXhhbXBsZQ');
  assert.deepEqual(parsed.resourceSegments, ['meta', 'movie', 'tt123.json']);
});

test('proxy route handler decodes path config and trims the config seed from resource segments', () => {
  const encoded = Buffer.from(
    JSON.stringify({
      url: 'https://addon.example.com/manifest.json',
      tmdbKey: 'tmdb',
      mdblistKey: 'mdblist',
      posterArtworkSource: 'fanart',
    }),
  ).toString('base64url');

  const parsed = parseProxyRouteConfig(
    new URLSearchParams(),
    [encoded, 'catalog', 'movie', 'top.json'],
  );

  assert.equal(parsed.error, undefined);
  assert.equal(parsed.configSeed, encoded);
  assert.equal(parsed.config?.posterArtworkSource, 'fanart');
  assert.deepEqual(parsed.resourceSegments, ['catalog', 'movie', 'top.json']);
});

test('proxy route handler reports missing required query keys clearly', () => {
  const searchParams = new URLSearchParams({
    url: 'https://addon.example.com/manifest.json',
    tmdbKey: 'tmdb',
  });

  const parsed = parseProxyRouteConfig(searchParams, ['meta', 'movie', 'tt123.json']);

  assert.equal(parsed.config, null);
  assert.equal(parsed.error?.message, 'Missing "tmdbKey" or "mdblistKey" query parameter.');
});
