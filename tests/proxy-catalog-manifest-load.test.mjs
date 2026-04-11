import test from 'node:test';
import assert from 'node:assert/strict';

import { loadProxyCatalogManifest } from '../lib/proxyCatalogManifestLoad.ts';

const makeJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('proxy catalog loader keeps generated URL when manifest fetch fails', async () => {
  const calls = [];
  const result = await loadProxyCatalogManifest(
    JSON.stringify({ url: 'https://source.example/manifest.json' }),
    async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) {
        return makeJsonResponse({ url: 'https://xrdb.example/proxy/abc/manifest.json' });
      }

      return new Response('Source manifest returned 502.', { status: 502 });
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(result.generatedProxyUrl, 'https://xrdb.example/proxy/abc/manifest.json');
  assert.equal(result.catalogLoadState, 'error');
  assert.equal(result.catalogLoadError, 'Source manifest returned 502.');
  assert.equal(result.catalogManifest, null);
});

test('proxy catalog loader returns ready state when proxy ref and manifest fetch succeed', async () => {
  const result = await loadProxyCatalogManifest(
    JSON.stringify({ url: 'https://source.example/manifest.json' }),
    async (url) => {
      if (url === '/api/proxy-ref') {
        return makeJsonResponse({ url: 'https://xrdb.example/proxy/abc/manifest.json' });
      }

      return makeJsonResponse({ id: 'proxy.addon', catalogs: [] });
    },
  );

  assert.equal(result.generatedProxyUrl, 'https://xrdb.example/proxy/abc/manifest.json');
  assert.equal(result.catalogLoadState, 'ready');
  assert.deepEqual(result.catalogManifest, { id: 'proxy.addon', catalogs: [] });
  assert.equal(result.catalogLoadError, '');
});

test('proxy catalog loader clears generated URL when proxy ref creation fails', async () => {
  const result = await loadProxyCatalogManifest(
    JSON.stringify({ url: 'https://source.example/manifest.json' }),
    async () => new Response('Missing tmdbKey', { status: 400 }),
  );

  assert.equal(result.generatedProxyUrl, '');
  assert.equal(result.catalogLoadState, 'error');
  assert.equal(result.catalogLoadError, 'Missing tmdbKey');
  assert.equal(result.catalogManifest, null);
});