import test from 'node:test';
import assert from 'node:assert/strict';

import {
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