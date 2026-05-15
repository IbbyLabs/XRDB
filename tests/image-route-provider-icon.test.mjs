import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import { createProviderIconDataUriResolver } from '../lib/imageRouteProviderIcon.ts';
import { buildProviderIconMemoryCacheKey } from '../lib/imageRouteSourceUrls.ts';

const createSharpDouble = () => {
  const calls = [];
  const factory = () => ({
    resize(width, height, options) {
      calls.push({ method: 'resize', width, height, options });
      return this;
    },
    trim() {
      calls.push({ method: 'trim' });
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
    assertSafeSourceUrlImpl: async (value) => new URL(value),
    fetchSafeIconImpl: async () =>
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
  assert.ok(sharpDouble.calls.some((call) => call.method === 'trim'));
});

const measureOpaqueBounds = async (buffer) => {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { width: 0, height: 0 };
  }

  return {
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
};

test('image route provider icon normalizes transparent padding for consistent visual footprint', async () => {
  const getProviderIconDataUri = createProviderIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    readProviderIconFromStorage: async () => null,
    writeProviderIconToStorage: async () => {},
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => buffer,
    getSharpFactory: async () => sharp,
    assertSafeSourceUrlImpl: async (value) => new URL(value),
    fetchSafeIconImpl: async (url) => {
      const padded = url.includes('padded');
      const boxSize = padded ? 98 : 158;
      const offset = Math.round((192 - boxSize) / 2);
      const svg = `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"192\" height=\"192\" viewBox=\"0 0 192 192\"><rect width=\"192\" height=\"192\" fill=\"rgba(0,0,0,0)\"/><rect x=\"${offset}\" y=\"${offset}\" width=\"${boxSize}\" height=\"${boxSize}\" rx=\"20\" fill=\"#22c55e\"/></svg>`;
      return new Response(Buffer.from(svg), {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    },
  });

  const tightDataUri = await getProviderIconDataUri('https://img.example/tight.svg');
  const paddedDataUri = await getProviderIconDataUri('https://img.example/padded.svg');

  assert.ok(tightDataUri);
  assert.ok(paddedDataUri);

  const tightBuffer = Buffer.from(tightDataUri.split(',')[1], 'base64');
  const paddedBuffer = Buffer.from(paddedDataUri.split(',')[1], 'base64');

  const tightBounds = await measureOpaqueBounds(tightBuffer);
  const paddedBounds = await measureOpaqueBounds(paddedBuffer);

  const widthDelta = Math.abs(tightBounds.width - paddedBounds.width);
  const heightDelta = Math.abs(tightBounds.height - paddedBounds.height);

  assert.ok(widthDelta <= 4, `expected normalized width delta <= 4, got ${widthDelta}`);
  assert.ok(heightDelta <= 4, `expected normalized height delta <= 4, got ${heightDelta}`);
});

test('image route provider icon rejects unsafe hosts before fetching', async () => {
  const getProviderIconDataUri = createProviderIconDataUriResolver({
    getMetadata: () => null,
    setMetadata: () => {},
    readProviderIconFromStorage: async () => null,
    writeProviderIconToStorage: async () => {},
    stripCornerBackgroundFromIcon: async (_sharp, buffer) => buffer,
    getSharpFactory: async () => createSharpDouble().factory,
    fetchSafeIconImpl: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(await getProviderIconDataUri('http://localhost/icon.png'), null);
});
