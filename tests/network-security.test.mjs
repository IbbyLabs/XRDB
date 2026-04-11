import test from 'node:test';
import assert from 'node:assert/strict';

import { ProxyAgent } from 'undici';

import { fetchWithOneRedirect } from '../lib/networkSecurity.ts';

const makeBody = (text = '') => ({
  async arrayBuffer() {
    return new TextEncoder().encode(text).buffer;
  },
  async dump() {},
});

const makeUndiciMock = (responses) => {
  let callIndex = 0;
  return async (_url, _opts) => {
    const response = responses[callIndex++];
    if (!response) throw new Error('Unexpected undici call');
    return response;
  };
};

test('fetchWithOneRedirect returns non-redirect response directly', async () => {
  const callOptions = [];
  const mock = makeUndiciMock([
    { statusCode: 200, headers: { 'content-type': 'application/json' }, body: makeBody('{"ok":true}') },
  ]);

  const instrumentedMock = async (url, options) => {
    callOptions.push(options || {});
    return mock(url, options);
  };

  const response = await fetchWithOneRedirect('https://example.test/manifest.json', instrumentedMock);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.deepEqual(json, { ok: true });
  assert.equal(callOptions.length, 1);
  assert.ok(callOptions[0]?.dispatcher);
});

test('fetchWithOneRedirect follows a single valid redirect', async () => {
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  process.env.NODE_ENV = 'test';
  const callOptions = [];

  const mock = makeUndiciMock([
    {
      statusCode: 307,
      headers: { location: 'https://cdn.example.test/catalog.json' },
      body: makeBody(''),
    },
    {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: makeBody('{"metas":[]}'),
    },
  ]);
  const instrumentedMock = async (url, options) => {
    callOptions.push(options || {});
    return mock(url, options);
  };

  const response = await fetchWithOneRedirect('https://example.test/catalog.json', instrumentedMock);
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.deepEqual(json, { metas: [] });
  assert.equal(callOptions.length, 2);
  assert.ok(callOptions.every((options) => !options.dispatcher));

  delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
  delete process.env.NODE_ENV;
});

test('fetchWithOneRedirect throws when redirect has no Location header', async () => {
  const mock = makeUndiciMock([
    { statusCode: 307, headers: {}, body: makeBody('') },
  ]);

  await assert.rejects(
    () => fetchWithOneRedirect('https://example.test/manifest.json', mock),
    /Location/,
  );
});

test('fetchWithOneRedirect throws when redirect target also redirects (chained)', async () => {
  process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS = 'true';
  process.env.NODE_ENV = 'test';

  const mock = makeUndiciMock([
    {
      statusCode: 302,
      headers: { location: 'https://cdn.example.test/step2.json' },
      body: makeBody(''),
    },
    {
      statusCode: 301,
      headers: { location: 'https://cdn.example.test/step3.json' },
      body: makeBody(''),
    },
  ]);

  await assert.rejects(
    () => fetchWithOneRedirect('https://example.test/manifest.json', mock),
    /chain/i,
  );

  delete process.env.XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS;
  delete process.env.NODE_ENV;
});

test('fetchWithOneRedirect throws when redirect target is a non-http URL', async () => {
  const mock = makeUndiciMock([
    {
      statusCode: 301,
      headers: { location: 'file:///etc/passwd' },
      body: makeBody(''),
    },
  ]);

  await assert.rejects(
    () => fetchWithOneRedirect('https://example.test/manifest.json', mock),
    /http/i,
  );
});

test('fetchWithOneRedirect uses ProxyAgent when outbound proxy env is configured', async () => {
  const previousHttpsProxy = process.env.HTTPS_PROXY;
  const previousHttpProxy = process.env.HTTP_PROXY;
  const callOptions = [];

  process.env.HTTPS_PROXY = 'http://proxy.example.test:8080';
  delete process.env.HTTP_PROXY;

  const mock = makeUndiciMock([
    { statusCode: 200, headers: { 'content-type': 'application/json' }, body: makeBody('{"ok":true}') },
  ]);
  const instrumentedMock = async (url, options) => {
    callOptions.push(options || {});
    return mock(url, options);
  };

  try {
    const response = await fetchWithOneRedirect('https://example.test/manifest.json', instrumentedMock);
    assert.equal(response.status, 200);
    assert.equal(callOptions.length, 1);
    assert.ok(callOptions[0]?.dispatcher instanceof ProxyAgent);
  } finally {
    if (previousHttpsProxy === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = previousHttpsProxy;

    if (previousHttpProxy === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = previousHttpProxy;
  }
});
