import test from 'node:test';
import assert from 'node:assert/strict';

import {
  XRDB_REQUEST_KEY_QUERY_PARAM,
  XRDB_REQUEST_KEY_QUERY_PARAM_LEGACY,
  getXrdbRequestKeyFromHeaders,
  getXrdbRequestKeyFromSearchParams,
  isXrdbRequestAuthorized,
  parseXrdbRequestKeyList,
  resolveProvidedXrdbRequestKey,
} from '../lib/xrdbRequestKey.ts';

test('parseXrdbRequestKeyList normalizes separators and removes duplicates', () => {
  assert.deepEqual(
    parseXrdbRequestKeyList('  alpha, beta ; gamma', 'beta delta', undefined, 'alpha'),
    ['alpha', 'beta', 'gamma', 'delta'],
  );
});

test('getXrdbRequestKeyFromSearchParams reads primary and legacy query params', () => {
  const primary = new URLSearchParams(`${XRDB_REQUEST_KEY_QUERY_PARAM}=primary-key`);
  const legacy = new URLSearchParams(`${XRDB_REQUEST_KEY_QUERY_PARAM_LEGACY}=legacy-key`);

  assert.equal(getXrdbRequestKeyFromSearchParams(primary), 'primary-key');
  assert.equal(getXrdbRequestKeyFromSearchParams(legacy), 'legacy-key');
});

test('getXrdbRequestKeyFromHeaders reads explicit headers and bearer auth', () => {
  assert.equal(getXrdbRequestKeyFromHeaders(new Headers({ 'x-xrdb-key': 'header-key' })), 'header-key');
  assert.equal(getXrdbRequestKeyFromHeaders(new Headers({ 'x-api-key': 'api-key' })), 'api-key');
  assert.equal(
    getXrdbRequestKeyFromHeaders(new Headers({ authorization: 'Bearer bearer-key' })),
    'bearer-key',
  );
});

test('resolveProvidedXrdbRequestKey falls back from query to headers to embedded config', () => {
  assert.equal(
    resolveProvidedXrdbRequestKey({
      searchParams: new URLSearchParams(`${XRDB_REQUEST_KEY_QUERY_PARAM}=query-key`),
      headers: new Headers({ 'x-xrdb-key': 'header-key' }),
      fallbackKey: 'embedded-key',
    }),
    'query-key',
  );

  assert.equal(
    resolveProvidedXrdbRequestKey({
      searchParams: new URLSearchParams(),
      headers: new Headers({ 'x-xrdb-key': 'header-key' }),
      fallbackKey: 'embedded-key',
    }),
    'header-key',
  );

  assert.equal(
    resolveProvidedXrdbRequestKey({
      searchParams: new URLSearchParams(),
      headers: new Headers(),
      fallbackKey: 'embedded-key',
    }),
    'embedded-key',
  );
});

test('isXrdbRequestAuthorized bypasses checks when no keys are configured', () => {
  assert.equal(
    isXrdbRequestAuthorized({
      configuredKeys: [],
      searchParams: new URLSearchParams(),
      headers: new Headers(),
    }),
    true,
  );
});

test('isXrdbRequestAuthorized accepts matching keys from query header and fallback config', () => {
  const configuredKeys = ['match-me'];

  assert.equal(
    isXrdbRequestAuthorized({
      configuredKeys,
      searchParams: new URLSearchParams(`${XRDB_REQUEST_KEY_QUERY_PARAM}=match-me`),
      headers: new Headers(),
    }),
    true,
  );

  assert.equal(
    isXrdbRequestAuthorized({
      configuredKeys,
      searchParams: new URLSearchParams(),
      headers: new Headers({ authorization: 'Bearer match-me' }),
    }),
    true,
  );

  assert.equal(
    isXrdbRequestAuthorized({
      configuredKeys,
      searchParams: new URLSearchParams(),
      headers: new Headers(),
      fallbackKey: 'match-me',
    }),
    true,
  );
});

test('isXrdbRequestAuthorized rejects missing or incorrect keys', () => {
  const configuredKeys = ['match-me'];

  assert.equal(
    isXrdbRequestAuthorized({
      configuredKeys,
      searchParams: new URLSearchParams(),
      headers: new Headers(),
    }),
    false,
  );

  assert.equal(
    isXrdbRequestAuthorized({
      configuredKeys,
      searchParams: new URLSearchParams(`${XRDB_REQUEST_KEY_QUERY_PARAM}=wrong-key`),
      headers: new Headers(),
    }),
    false,
  );
});
