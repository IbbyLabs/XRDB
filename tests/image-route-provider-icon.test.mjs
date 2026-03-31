import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderIconDataUriResolver } from '../lib/imageRouteProviderIcon.ts';
import { buildProviderIconMemoryCacheKey } from '../lib/imageRouteSourceUrls.ts';

const createSharpDouble = () => {
  return () => ({
    resize() {
      return this;
    },
    png() {
      return this;
    },
    composite() {
      return this;
    },
    async toBuffer() {
      return Buffer.from('icon-output');
    },
  });
};

test('image route provider icon returns inline data uris unchanged', async () => {
  const getProviderIconDataUri = createProviderIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    readProviderIconFromStorage: async () => null,
    writeProviderIconToStorage: async () => {},
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => buffer,
    getSharpFactory: async () => createSharpDouble(),
  });

  assert.equal(
    await getProviderIconDataUri('data:image/png;base64,abc'),
    'data:image/png;base64,abc',
  );
});

test('image route provider icon prefers memory and storage caches before fetching', async () => {
  const memoryCacheKey = buildProviderIconMemoryCacheKey('https://img.example/a.png', 0);
  const memory = new Map([[memoryCacheKey, 'data:image/png;base64,mem']]);
  const getProviderIconDataUri = createProviderIconDataUriResolver({
    getMetadata: (key) => memory.get(key),
    setMetadata: () => {},
    readProviderIconFromStorage: async () => {
      throw new Error('should not be called');
    },
    writeProviderIconToStorage: async () => {},
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => buffer,
    getSharpFactory: async () => createSharpDouble(),
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(
    await getProviderIconDataUri('https://img.example/a.png'),
    'data:image/png;base64,mem',
  );

  const writes = [];
  const storageResolver = createProviderIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: (key, value, ttlMs) => writes.push({ key, value, ttlMs }),
    readProviderIconFromStorage: async () => 'data:image/png;base64,storage',
    writeProviderIconToStorage: async () => {},
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => buffer,
    getSharpFactory: async () => createSharpDouble(),
    fetchImpl: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(
    await storageResolver('https://img.example/b.png'),
    'data:image/png;base64,storage',
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].value, 'data:image/png;base64,storage');
});

test('image route provider icon fetches, rounds, caches, and writes processed icons', async () => {
  const writes = [];
  const stored = [];
  const strippedBuffers = [];
  const getProviderIconDataUri = createProviderIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: (key, value, ttlMs) => writes.push({ key, value, ttlMs }),
    readProviderIconFromStorage: async () => null,
    writeProviderIconToStorage: async (url, buffer, radius) => {
      stored.push({ url, buffer: buffer.toString('utf8'), radius });
    },
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => {
      strippedBuffers.push(buffer.toString('utf8'));
      return buffer;
    },
    getSharpFactory: async () => createSharpDouble(),
    fetchImpl: async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
      }),
  });

  const result = await getProviderIconDataUri('https://img.example/c.png', 12);

  assert.match(result, /^data:image\/png;base64,/);
  assert.equal(Buffer.from(result.split(',')[1], 'base64').toString('utf8'), 'icon-output');
  assert.deepEqual(strippedBuffers, ['icon-output']);
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0], {
    url: 'https://img.example/c.png',
    buffer: 'icon-output',
    radius: 12,
  });
  assert.equal(writes.length, 1);
});
