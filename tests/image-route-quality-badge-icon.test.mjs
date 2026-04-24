import test from 'node:test';
import assert from 'node:assert/strict';

import { createQualityBadgeIconDataUriResolver } from '../lib/imageRouteQualityBadgeIcon.ts';

test('quality badge icon returns inline data uris unchanged', async () => {
  const getQualityBadgeIconDataUri = createQualityBadgeIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
  });

  assert.equal(
    await getQualityBadgeIconDataUri('data:image/svg+xml;base64,PHN2Zy8+'),
    'data:image/svg+xml;base64,PHN2Zy8+',
  );
});

test('quality badge icon rejects unsafe hosts before fetching', async () => {
  const getQualityBadgeIconDataUri = createQualityBadgeIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    fetchSafeIconImpl: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(await getQualityBadgeIconDataUri('http://localhost/icon.png'), null);
});

test('quality badge icon rasterizes svg to png when sharp is available', async () => {
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>');
  const stored = [];
  const getQualityBadgeIconDataUri = createQualityBadgeIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: (key, value) => stored.push({ key, value }),
    assertSafeSourceUrlImpl: async (url) => new URL(url),
    fetchSafeIconImpl: async () => new Response(svgBuffer, {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }),
    getSharpFactory: async () => {
      const sharp = (await import('sharp')).default;
      return sharp;
    },
  });

  const result = await getQualityBadgeIconDataUri('https://example.com/icon.svg');
  assert.ok(result !== null, 'expected non-null result');
  assert.ok(result.startsWith('data:image/png;base64,'), `expected png data uri, got: ${result?.slice(0, 50)}`);
  assert.equal(stored.length, 1, 'expected one cache entry');
  assert.ok(stored[0].key.includes('example.com/icon.svg'), 'cache key should include url');
});

test('quality badge icon falls back to raw data uri when sharp fails', async () => {
  const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const getQualityBadgeIconDataUri = createQualityBadgeIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    assertSafeSourceUrlImpl: async (url) => new URL(url),
    fetchSafeIconImpl: async () => new Response(svgBuffer, {
      status: 200,
      headers: { 'content-type': 'image/svg+xml' },
    }),
    getSharpFactory: async () => {
      return () => { throw new Error('sharp unavailable'); };
    },
  });

  const result = await getQualityBadgeIconDataUri('https://example.com/icon.svg');
  assert.ok(result !== null, 'expected non-null result');
  assert.ok(result.startsWith('data:image/svg+xml;base64,'), `expected svg data uri fallback, got: ${result?.slice(0, 50)}`);
});