import test from 'node:test';
import assert from 'node:assert/strict';

import { createProviderIconDataUriResolver } from '../lib/imageRouteProviderIcon.ts';
import { buildProviderIconMemoryCacheKey } from '../lib/imageRouteSourceUrls.ts';

const createSharpDouble = () => {
  const calls = [];
  const factory = () => ({
    resize(width, height, options) {
      calls.push({ method: 'resize', width, height, options });
      return this;
    },
    png(options) {
      calls.push({ method: 'png', options });
      return this;
    },
    composite(layers) {
      calls.push({ method: 'composite', layers });
      return this;
    },
    async toBuffer() {
      calls.push({ method: 'toBuffer' });
      return Buffer.from('icon-output');
    },
  });
  return { factory, calls };
};

test('image route provider icon returns inline data uris unchanged', async () => {
  const getProviderIconDataUri = createProviderIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    readProviderIconFromStorage: async () => null,
    writeProviderIconToStorage: async () => {},
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => buffer,
    getSharpFactory: async () => createSharpDouble().factory,
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
    getSharpFactory: async () => createSharpDouble().factory,
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
    getSharpFactory: async () => createSharpDouble().factory,
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
  const sharpDouble = createSharpDouble();
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
    getSharpFactory: async () => sharpDouble.factory,
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
  const resizeCall = sharpDouble.calls.find((call) => call.method === 'resize');
  assert.deepEqual(resizeCall, {
    method: 'resize',
    width: 192,
    height: 192,
    options: {
      fit: 'contain',
      kernel: 'lanczos3',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  const compositeCall = sharpDouble.calls.find((call) => call.method === 'composite');
  assert.equal(compositeCall?.layers.length, 1);
  const roundedMask = compositeCall?.layers[0]?.input.toString('utf8') || '';
  assert.match(roundedMask, /width="192"/);
  assert.match(roundedMask, /height="192"/);
  assert.match(roundedMask, /rx="24"/);
});
