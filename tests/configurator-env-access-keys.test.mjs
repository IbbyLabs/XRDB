import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyConfiguratorEnvAccessKeys,
  getConfiguratorEnvAccessKeys,
  hasConfiguratorEnvAccessKeys,
} from '../lib/configuratorEnvAccessKeys.ts';

test('configurator env access keys prefer first MDBList pool key and trim values', () => {
  const result = getConfiguratorEnvAccessKeys({
    XRDB_FANART_API_KEY: '  fanart-key  ',
    MDBLIST_API_KEYS: '  first-mdb , second-mdb ',
    SIMKL_CLIENT_ID: ' simkl-client ',
  });

  assert.deepEqual(result, {
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: true,
    hasServerMdblistKey: true,
    hasServerSimklClientId: true,
    hasServerTmdbKey: false,
  });
});

test('configurator env access keys fall back to legacy aliases when primary vars are absent', () => {
  const result = getConfiguratorEnvAccessKeys({
    FANART_API_KEY: 'fanart-fallback',
    MDBLIST_KEY: 'mdb-fallback',
    XRDB_SIMKL_CLIENT_ID: 'simkl-fallback',
    TMDB_KEY: 'tmdb-fallback',
  });

  assert.deepEqual(result, {
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: true,
    hasServerMdblistKey: true,
    hasServerSimklClientId: true,
    hasServerTmdbKey: true,
  });
});

test('configurator env access keys never expose server side Simkl values', () => {
  const result = getConfiguratorEnvAccessKeys({
    SIMKL_CLIENT_ID: 'simkl-primary',
    SIMKL_API_KEY: 'simkl-alias',
    XRDB_SIMKL_CLIENT_ID: 'simkl-server',
  });

  assert.deepEqual(result, {
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: false,
    hasServerMdblistKey: false,
    hasServerSimklClientId: true,
    hasServerTmdbKey: false,
  });
});

test('configurator env access keys detect server side TMDB values without exposing them', () => {
  const result = getConfiguratorEnvAccessKeys({
    XRDB_TMDB_API_KEY: 'tmdb-primary',
    TMDB_API_KEY: 'tmdb-alias',
    TMDB_KEY: 'tmdb-legacy',
  });

  assert.deepEqual(result, {
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: false,
    hasServerMdblistKey: false,
    hasServerSimklClientId: false,
    hasServerTmdbKey: true,
  });
});

test('configurator env access keys treat a TMDB read access token as a server credential', () => {
  const result = getConfiguratorEnvAccessKeys({
    XRDB_TMDB_READ_ACCESS_TOKEN: 'tmdb-read-token',
  });

  assert.deepEqual(result, {
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: false,
    hasServerMdblistKey: false,
    hasServerSimklClientId: false,
    hasServerTmdbKey: true,
  });
});

test('configurator env access keys only fill empty user state', () => {
  const result = applyConfiguratorEnvAccessKeys(
    {
      fanartKey: '',
      mdblistKey: 'user-mdb',
      simklClientId: '   ',
    },
    {
      fanartKey: 'server-fanart',
      mdblistKey: 'server-mdb',
      simklClientId: 'server-simkl',
    },
  );

  assert.deepEqual(result, {
    fanartKey: 'server-fanart',
    mdblistKey: 'user-mdb',
    simklClientId: 'server-simkl',
  });
});

test('configurator env access keys seed all empty fields from server defaults', () => {
  const result = applyConfiguratorEnvAccessKeys(
    {
      fanartKey: '',
      mdblistKey: '',
      simklClientId: '',
    },
    {
      fanartKey: 'server-fanart',
      mdblistKey: 'server-mdb',
      simklClientId: 'server-simkl',
    },
  );

  assert.deepEqual(result, {
    fanartKey: 'server-fanart',
    mdblistKey: 'server-mdb',
    simklClientId: 'server-simkl',
  });
});

test('configurator env access keys do not clear existing state when defaults are blank', () => {
  const result = applyConfiguratorEnvAccessKeys(
    {
      fanartKey: 'user-fanart',
      mdblistKey: 'user-mdb',
      simklClientId: 'user-simkl',
    },
    {
      fanartKey: '',
      mdblistKey: '',
      simklClientId: '',
    },
  );

  assert.deepEqual(result, {
    fanartKey: 'user-fanart',
    mdblistKey: 'user-mdb',
    simklClientId: 'user-simkl',
  });
});

test('configurator env access keys detect when any default is present', () => {
  assert.equal(hasConfiguratorEnvAccessKeys({
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: false,
    hasServerMdblistKey: false,
    hasServerSimklClientId: false,
    hasServerTmdbKey: false,
  }), false);
  assert.equal(hasConfiguratorEnvAccessKeys({
    fanartKey: '',
    mdblistKey: '',
    simklClientId: '',
    hasServerFanartKey: false,
    hasServerMdblistKey: true,
    hasServerSimklClientId: false,
    hasServerTmdbKey: false,
  }), true);
});
