import test from 'node:test';
import assert from 'node:assert/strict';

import { loadProxyManifestPayload } from '../lib/proxySourceManifest.ts';

const makeJsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('proxy source manifest loader returns payload for direct query manifests', async () => {
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  process.env.NODE_ENV = 'test';

  try {
    const result = await loadProxyManifestPayload({
      sourceUrl: 'http://127.0.0.1:3000/manifest.json',
      fetchWithOneRedirectImpl: async () =>
        makeJsonResponse({ id: 'source.addon', name: 'Source Addon', description: 'Source description' }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.payload.id.startsWith('xrdb.proxy.'), true);
    assert.equal(result.payload.name, 'XRDB Proxy | Source Addon');
  } finally {
    delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
    delete process.env.NODE_ENV;
  }
});

test('proxy source manifest loader returns payload for stored UUID-backed manifests', async () => {
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  process.env.NODE_ENV = 'test';

  try {
    const result = await loadProxyManifestPayload({
      sourceUrl: 'http://127.0.0.1:3000/manifest.json',
      configSeed: '123e4567-e89b-12d3-a456-426614174000',
      fetchWithOneRedirectImpl: async () =>
        makeJsonResponse({ id: 'source.addon', name: 'Stored Addon', description: 'Stored description' }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.payload.id.startsWith('xrdb.proxy.'), true);
    assert.equal(result.payload.name, 'XRDB Proxy | Stored Addon');
  } finally {
    delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
    delete process.env.NODE_ENV;
  }
});

test('proxy source manifest loader rejects blocked private sources when test bypass is disabled', async () => {
  delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
  delete process.env.NODE_ENV;

  const result = await loadProxyManifestPayload({
    sourceUrl: 'http://127.0.0.1:3000/manifest.json',
    fetchWithOneRedirectImpl: async () => makeJsonResponse({ id: 'source.addon' }),
  });

  assert.deepEqual(result, { ok: false, error: 'invalid-source' });
});

test('proxy source manifest loader surfaces upstream manifest status failures', async () => {
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  process.env.NODE_ENV = 'test';

  try {
    const result = await loadProxyManifestPayload({
      sourceUrl: 'http://127.0.0.1:3000/manifest.json',
      fetchWithOneRedirectImpl: async () => makeJsonResponse({ error: 'nope' }, 502),
    });

    assert.deepEqual(result, { ok: false, error: 'bad-status', status: 502 });
  } finally {
    delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
    delete process.env.NODE_ENV;
  }
});