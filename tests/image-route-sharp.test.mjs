import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSharpFactoryLoader,
  resolveSharpRuntimeOptions,
} from '../lib/imageRouteSharp.ts';

test('image route sharp resolves default runtime options', () => {
  assert.deepEqual(resolveSharpRuntimeOptions({}), {
    concurrency: 2,
    cacheOptions: {
      memory: 128,
      files: 200,
      items: 100,
    },
  });
});

test('image route sharp resolves explicit runtime options', () => {
  assert.deepEqual(
    resolveSharpRuntimeOptions({
      XRDB_SHARP_CONCURRENCY: '6',
      XRDB_SHARP_CACHE_MEMORY_MB: '256',
      XRDB_SHARP_CACHE_FILES: '300',
      XRDB_SHARP_CACHE_ITEMS: '500',
    }),
    {
      concurrency: 6,
      cacheOptions: {
        memory: 256,
        files: 300,
        items: 500,
      },
    },
  );
});

test('image route sharp configures and memoizes the sharp loader', async () => {
  const state = {
    concurrency: null,
    cacheOptions: null,
  };
  const sharp = {
    concurrency(value) {
      state.concurrency = value;
    },
    cache(value) {
      state.cacheOptions = value;
    },
  };
  let importerCalls = 0;
  const getSharpFactory = createSharpFactoryLoader({
    env: {
      XRDB_SHARP_CONCURRENCY: '4',
      XRDB_SHARP_CACHE_MEMORY_MB: '192',
      XRDB_SHARP_CACHE_FILES: '64',
      XRDB_SHARP_CACHE_ITEMS: '32',
    },
    importer: async () => {
      importerCalls += 1;
      return { default: sharp };
    },
  });

  const first = await getSharpFactory();
  const second = await getSharpFactory();

  assert.equal(importerCalls, 1);
  assert.equal(first, sharp);
  assert.equal(second, sharp);
  assert.equal(state.concurrency, 4);
  assert.deepEqual(state.cacheOptions, {
    memory: 192,
    files: 64,
    items: 32,
  });
});
