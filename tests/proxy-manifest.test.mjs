import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProxyCorsHeaders,
  buildProxyManifestPayload,
  parseAllowedProxyOrigins,
} from '../lib/proxyManifest.ts';

test('parseAllowedProxyOrigins normalizes comma separated values', () => {
  assert.deepEqual(parseAllowedProxyOrigins(' https://a.test, ,https://b.test '), [
    'https://a.test',
    'https://b.test',
  ]);
  assert.deepEqual(parseAllowedProxyOrigins(''), []);
});

test('buildProxyCorsHeaders prefers explicit origin matches', () => {
  const headers = buildProxyCorsHeaders({
    requestOrigin: 'https://allowed.test',
    allowedOriginsRaw: 'https://allowed.test,https://fallback.test',
  });

  assert.equal(headers['Access-Control-Allow-Origin'], 'https://allowed.test');
  assert.equal(headers['Access-Control-Allow-Methods'], 'GET, OPTIONS');
});

test('buildProxyCorsHeaders falls back to wildcard when configured', () => {
  const headers = buildProxyCorsHeaders({
    requestOrigin: 'https://random.test',
    allowedOriginsRaw: '*,https://fallback.test',
  });

  assert.equal(headers['Access-Control-Allow-Origin'], '*');
});

test('buildProxyManifestPayload stamps proxy identity onto a source manifest', () => {
  const payload = buildProxyManifestPayload(
    {
      id: 'source.addon',
      name: 'Source Addon',
      description: 'Source description',
    },
    'https://addon.example.com/manifest.json',
  );

  assert.match(payload.id, /^xrdb\.proxy\.[a-f0-9]{12}$/);
  assert.equal(payload.name, 'XRDB Proxy | Source Addon');
  assert.equal(payload.description, 'Source description (served through XRDB Proxy)');
});

test('buildProxyManifestPayload changes proxy identity when source manifest changes at a stable URL', () => {
  const first = buildProxyManifestPayload(
    {
      id: 'source.addon',
      name: 'Source Addon',
      description: 'age=top;color=amber',
    },
    'https://addon.example.com/manifest.json',
  );
  const second = buildProxyManifestPayload(
    {
      id: 'source.addon',
      name: 'Source Addon',
      description: 'age=bottom;color=cyan',
    },
    'https://addon.example.com/manifest.json',
  );

  assert.notEqual(first.id, second.id);
});

test('buildProxyManifestPayload keeps proxy identity stable across manifest key order changes', () => {
  const first = buildProxyManifestPayload(
    {
      id: 'source.addon',
      name: 'Source Addon',
      description: 'Source description',
      resources: ['catalog', 'meta'],
      types: ['movie'],
    },
    'https://addon.example.com/manifest.json',
  );
  const second = buildProxyManifestPayload(
    {
      types: ['movie'],
      resources: ['catalog', 'meta'],
      description: 'Source description',
      name: 'Source Addon',
      id: 'source.addon',
    },
    'https://addon.example.com/manifest.json',
  );

  assert.equal(first.id, second.id);
});

test('buildProxyManifestPayload changes proxy identity when catalog rules change on query manifests', () => {
  const basePayload = buildProxyManifestPayload(
    {
      id: 'source.addon',
      name: 'Source Addon',
      description: 'Source description',
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
    },
    'https://addon.example.com/manifest.json',
  );

  const payload = buildProxyManifestPayload(
    {
      id: 'source.addon',
      name: 'Source Addon',
      description: 'Source description',
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
    },
    'https://addon.example.com/manifest.json',
    {
      catalogPlan: Buffer.from(
        JSON.stringify([
          { key: 'movie:top', title: 'Cinema Prime', discoverOnly: true },
          { key: 'series:calendar', hidden: true },
        ]),
      ).toString('base64url'),
    },
  );

  assert.deepEqual(payload.catalogs, [
    {
      type: 'movie',
      id: 'top',
      name: 'Cinema Prime',
      extra: [],
    },
  ]);
  assert.notEqual(basePayload.id, payload.id);
});
