import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchJsonCached, fetchTextCached } from '../lib/imageRouteCachedFetch.ts';
import { HttpError } from '../lib/imageRouteRuntime.ts';

const createPhases = () => ({
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
});

let testKeyCounter = 0;
const createUniqueKey = (label) => `image-route-cached-fetch:${label}:${process.pid}:${++testKeyCounter}`;

test('image route cached fetch reuses cached JSON responses', async () => {
  const phases = createPhases();
  const key = createUniqueKey('json');
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true, title: 'XRDB' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  };

  const first = await fetchJsonCached(
    key,
    'https://example.com/metadata',
    60_000,
    phases,
    'tmdb',
    undefined,
    undefined,
    fetchImpl,
  );
  const second = await fetchJsonCached(
    key,
    'https://example.com/metadata',
    60_000,
    phases,
    'tmdb',
    undefined,
    undefined,
    async () => {
      throw new Error('cache miss');
    },
  );

  assert.equal(fetchCalls, 1);
  assert.equal(first.ok, true);
  assert.deepEqual(second.data, { ok: true, title: 'XRDB' });
});

test('image route cached fetch throws a typed TMDB auth error', async () => {
  const phases = createPhases();

  await assert.rejects(
    () =>
      fetchJsonCached(
        createUniqueKey('tmdb-auth'),
        'https://api.themoviedb.org/3/find/tt0123456',
        60_000,
        phases,
        'tmdb',
        undefined,
        undefined,
        async () =>
          new Response(JSON.stringify({ status_message: 'Invalid API key: You must be granted a valid key.' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
      ),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 401);
      assert.match(error.message, /invalid or unauthorized/i);
      return true;
    },
  );
});

test('image route cached fetch reuses cached text responses', async () => {
  const phases = createPhases();
  const key = createUniqueKey('text');
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response('<html>ok</html>', {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  };

  try {
    const first = await fetchTextCached(
      key,
      'https://example.com/page',
      60_000,
      phases,
      'fanart',
    );
    const second = await fetchTextCached(
      key,
      'https://example.com/page',
      60_000,
      phases,
      'fanart',
    );

    assert.equal(fetchCalls, 1);
    assert.equal(first.ok, true);
    assert.equal(second.data, '<html>ok</html>');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
