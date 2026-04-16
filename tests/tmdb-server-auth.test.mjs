import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchTmdbServer,
  hasServerTmdbCredentials,
  prepareTmdbServerRequest,
} from '../lib/tmdbServerAuth.ts';

test('prepareTmdbServerRequest strips server api_key and adds bearer auth when a read token is configured', () => {
  const prepared = prepareTmdbServerRequest({
    url: 'https://api.themoviedb.org/3/movie/42?api_key=server-key&language=en-US',
    serverApiKey: 'server-key',
    serverReadAccessToken: 'server-token',
  });

  const target = new URL(prepared.url);

  assert.equal(target.searchParams.get('api_key'), null);
  assert.equal(target.searchParams.get('language'), 'en-US');
  assert.equal(new Headers(prepared.init?.headers).get('Authorization'), 'Bearer server-token');
});

test('prepareTmdbServerRequest preserves explicit override api_key values', () => {
  const prepared = prepareTmdbServerRequest({
    url: 'https://api.themoviedb.org/3/movie/42?api_key=user-key&language=en-US',
    serverApiKey: 'server-key',
    serverReadAccessToken: 'server-token',
  });

  const target = new URL(prepared.url);

  assert.equal(target.searchParams.get('api_key'), 'user-key');
  assert.equal(new Headers(prepared.init?.headers).get('Authorization'), null);
});

test('hasServerTmdbCredentials accepts a read access token without an api key', () => {
  assert.equal(
    hasServerTmdbCredentials({
      serverApiKey: '',
      serverReadAccessToken: 'server-token',
    }),
    true,
  );
});

test('fetchTmdbServer falls back to server credentials when a personal key is rejected', async () => {
  const requests = [];

  const response = await fetchTmdbServer(
    'https://api.themoviedb.org/3/movie/42?api_key=user-key&language=en-US',
    { cache: 'no-store' },
    async (url, init) => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ status_message: 'Invalid API key' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    {
      serverApiKey: 'server-key',
      serverReadAccessToken: 'server-token',
    },
  );

  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).searchParams.get('api_key'), 'user-key');
  assert.equal(new URL(requests[1].url).searchParams.get('api_key'), null);
  assert.equal(new Headers(requests[1].init?.headers).get('Authorization'), 'Bearer server-token');
});

test('fetchTmdbServer falls back to the server api key when no read token is configured', async () => {
  const requests = [];

  const response = await fetchTmdbServer(
    'https://api.themoviedb.org/3/movie/42?api_key=user-key&language=en-US',
    { cache: 'no-store' },
    async (url, init) => {
      requests.push({ url, init });
      if (requests.length === 1) {
        return new Response(JSON.stringify({ status_message: 'Invalid API key' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
    {
      serverApiKey: 'server-key',
      serverReadAccessToken: '',
    },
  );

  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get('api_key'), 'server-key');
  assert.equal(new Headers(requests[1].init?.headers).get('Authorization'), null);
});