import test from 'node:test';
import assert from 'node:assert/strict';

import { createRemoteImageAspectRatioReader } from '../lib/imageRouteAspectRatio.ts';

test('image route aspect ratio reader skips blank urls', async () => {
  const getRemoteImageAspectRatio = createRemoteImageAspectRatioReader({
    getSourceImagePayload: async () => {
      throw new Error('should not be called');
    },
    getSharpFactory: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(await getRemoteImageAspectRatio(''), null);
});

test('image route aspect ratio reader returns width divided by height', async () => {
  const getRemoteImageAspectRatio = createRemoteImageAspectRatioReader({
    getSourceImagePayload: async () => ({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=60',
    }),
    getSharpFactory: async () => {
      return () => ({
        metadata: async () => ({
          width: 300,
          height: 150,
        }),
      });
    },
  });

  assert.equal(await getRemoteImageAspectRatio('https://img.example/logo.png'), 2);
});

test('image route aspect ratio reader trims transparent borders before measuring logos', async () => {
  let trimBackground = null;
  const getRemoteImageAspectRatio = createRemoteImageAspectRatioReader({
    getSourceImagePayload: async () => ({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=60',
    }),
    getSharpFactory: async () => {
      return () => ({
        trim: (options) => {
          trimBackground = options?.background ?? null;
          return {
            metadata: async () => ({
              width: 240,
              height: 160,
            }),
          };
        },
        metadata: async () => ({
          width: 480,
          height: 160,
        }),
      });
    },
  });

  assert.equal(await getRemoteImageAspectRatio('https://img.example/logo.png'), 1.5);
  assert.deepEqual(trimBackground, { r: 0, g: 0, b: 0, alpha: 0 });
});

test('image route aspect ratio reader returns null for invalid metadata and source failures', async () => {
  const invalidReader = createRemoteImageAspectRatioReader({
    getSourceImagePayload: async () => ({
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=60',
    }),
    getSharpFactory: async () => {
      return () => ({
        metadata: async () => ({
          width: 120,
          height: 0,
        }),
      });
    },
  });
  const failingReader = createRemoteImageAspectRatioReader({
    getSourceImagePayload: async () => {
      throw new Error('boom');
    },
    getSharpFactory: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(await invalidReader('https://img.example/bad.png'), null);
  assert.equal(await failingReader('https://img.example/missing.png'), null);
});
