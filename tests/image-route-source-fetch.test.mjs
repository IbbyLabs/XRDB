import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchSourceImageUncached,
  getSourceImagePayload,
  getSourceImagePayloadWithFallback,
  normalizeSafeFallbackImageUrl,
} from '../lib/imageRouteSourceFetch.ts';

test('image route source fetch reads uncached images and preserves response headers', async () => {
  const fetchImpl = async () =>
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: {
        'content-type': 'image/webp',
        'cache-control': 'public, max-age=90',
      },
    });

  const payload = await fetchSourceImageUncached('https://cdn.example.com/image.webp', 5000, fetchImpl);

  assert.deepEqual(Array.from(new Uint8Array(payload.body)), [1, 2, 3]);
  assert.equal(payload.contentType, 'image/webp');
  assert.equal(payload.cacheControl, 'public, max-age=90');
});

test('image route source fetch can fall back after a primary fetch failure', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url);
    if (String(url).includes('primary')) {
      return new Response(null, { status: 404 });
    }
    return new Response(new Uint8Array([9, 8, 7]), {
      status: 200,
      headers: {
        'content-type': 'image/png',
      },
    });
  };

  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  const payload = await getSourceImagePayloadWithFallback({
    imgUrl: 'https://cdn.example.com/primary.png',
    fallbackUrl: 'http://localhost/fallback.png',
    fallbackTtlMs: 6000,
    fetchImpl,
  });
  delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;

  assert.deepEqual(requested, [
    'https://cdn.example.com/primary.png',
    'http://localhost/fallback.png',
  ]);
  assert.deepEqual(Array.from(new Uint8Array(payload.body)), [9, 8, 7]);
  assert.equal(payload.contentType, 'image/png');
});

test('image route source fetch normalizes fallback urls and rejects blank values', async () => {
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  assert.equal(await normalizeSafeFallbackImageUrl('  http://localhost/image.png  '), 'http://localhost/image.png');
  delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
  assert.equal(await normalizeSafeFallbackImageUrl(''), null);
});

test('image route source fetch supports non TMDB direct fetches without object storage', async () => {
  const fetchImpl = async () =>
    new Response(new Uint8Array([4, 5, 6]), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
      },
    });

  const payload = await getSourceImagePayload('https://images.example.com/file.jpg', 7000, fetchImpl);

  assert.deepEqual(Array.from(new Uint8Array(payload.body)), [4, 5, 6]);
  assert.equal(payload.contentType, 'image/jpeg');
});
