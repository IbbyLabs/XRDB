import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyProxyCatalogRules,
  decodeProxyCatalogRules,
  encodeProxyCatalogRules,
  normalizeProxyCatalogRules,
  readProxyCatalogDescriptors,
} from '../lib/proxyCatalogRules.ts';

test('proxy catalog rules read source manifest catalogs into XRDB descriptors', () => {
  const descriptors = readProxyCatalogDescriptors({
    catalogs: [
      {
        type: 'movie',
        id: 'top',
        name: 'Top',
        extra: [{ name: 'search', isRequired: false }],
      },
      {
        type: 'series',
        id: 'calendar',
        name: 'Calendar',
      },
    ],
  });

  assert.deepEqual(descriptors, [
    {
      key: 'movie:top',
      type: 'movie',
      id: 'top',
      name: 'Top',
      searchSupported: true,
      searchRequired: false,
    },
    {
      key: 'series:calendar',
      type: 'series',
      id: 'calendar',
      name: 'Calendar',
      searchSupported: false,
      searchRequired: false,
    },
  ]);
});

test('proxy catalog rules round trip through XRDB catalog plan encoding', () => {
  const encoded = encodeProxyCatalogRules([
    { key: 'movie:top', title: 'Cinema', hidden: false, searchEnabled: false },
    { key: 'series:calendar', hidden: true },
  ]);

  assert.deepEqual(decodeProxyCatalogRules(encoded), [
    { key: 'movie:top', title: 'Cinema', searchEnabled: false },
    { key: 'series:calendar', hidden: true },
  ]);
});

test('proxy catalog rules rewrite names, hide catalogs, and strip search when discover only is enabled', () => {
  const manifest = applyProxyCatalogRules(
    {
      catalogs: [
        {
          type: 'movie',
          id: 'top',
          name: 'Top',
          extra: [{ name: 'search', isRequired: false }],
        },
        {
          type: 'series',
          id: 'calendar',
          name: 'Calendar',
          extra: [{ name: 'search', isRequired: true }],
        },
        {
          type: 'anime',
          id: 'watchlist',
          name: 'Watchlist',
        },
      ],
    },
    normalizeProxyCatalogRules([
      { key: 'movie:top', title: 'Cinema Prime' },
      { key: 'series:calendar', discoverOnly: true },
      { key: 'anime:watchlist', hidden: true },
    ]),
  );

  assert.deepEqual(manifest.catalogs, [
    {
      type: 'movie',
      id: 'top',
      name: 'Cinema Prime',
      extra: [{ name: 'search', isRequired: false }],
    },
    {
      type: 'series',
      id: 'calendar',
      name: 'Calendar',
      extra: [],
    },
  ]);
});
