import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLegacyConfiguratorProviderCredentialSessionCookie,
  describeConfiguratorProviderCredentialSession,
  migrateConfiguratorProviderCredentialSession,
  readConfiguratorProviderCredentialSession,
  updateConfiguratorProviderCredentialSession,
} from '../lib/configuratorProviderCredentialSession.ts';

const TEST_SESSION_ID = '11111111-1111-4111-8111-111111111111';

const createRequest = (cookieValue = '') => ({
  headers: new Headers(
    cookieValue
      ? {
          cookie: `xrdb_provider_credentials=${cookieValue}`,
        }
      : undefined,
  ),
});

const createStore = () => {
  const values = new Map();

  return {
    values,
    get: (sessionId) => values.get(sessionId) ?? null,
    set: (sessionId, encryptedValue) => {
      values.set(sessionId, encryptedValue);
    },
    delete: (sessionId) => {
      values.delete(sessionId);
    },
  };
};

test('configurator provider credential session stores personal keys on the server and sends only an opaque session cookie', () => {
  const store = createStore();
  const result = updateConfiguratorProviderCredentialSession(
    createRequest(),
    {
      tmdbKey: 'tmdb-user-key',
      mdblistKey: 'mdblist-user-key',
      fanartKey: 'fanart-user-key',
      simklClientId: 'simkl-user-key',
    },
    store,
    () => TEST_SESSION_ID,
  );

  assert.equal(result.cookie.value, TEST_SESSION_ID);
  assert.equal(result.cookie.value.includes('tmdb-user-key'), false);
  assert.equal(result.cookie.maxAge > 0, true);
  assert.equal(store.values.size, 1);

  const encryptedValue = store.values.get(TEST_SESSION_ID);
  assert.equal(typeof encryptedValue, 'string');
  assert.equal(encryptedValue.includes('tmdb-user-key'), false);

  const restored = readConfiguratorProviderCredentialSession(createRequest(TEST_SESSION_ID), store);
  assert.deepEqual(restored, {
    tmdbKey: 'tmdb-user-key',
    mdblistKey: 'mdblist-user-key',
    fanartKey: 'fanart-user-key',
    simklClientId: 'simkl-user-key',
  });

  const described = describeConfiguratorProviderCredentialSession(createRequest(TEST_SESSION_ID), store);
  assert.deepEqual(described.status, {
    tmdb: true,
    mdblist: true,
    fanart: true,
    simkl: true,
  });
  assert.deepEqual(described.maskedPreview, {
    tmdb: 'tmdb*****-key',
    mdblist: 'mdbl********-key',
    fanart: 'fana*******-key',
    simkl: 'simk******-key',
  });
});

test('configurator provider credential session merges partial updates into the existing server session', () => {
  const store = createStore();

  updateConfiguratorProviderCredentialSession(
    createRequest(),
    {
      tmdbKey: 'tmdb-user-key',
      mdblistKey: 'mdblist-user-key',
    },
    store,
    () => TEST_SESSION_ID,
  );

  const next = updateConfiguratorProviderCredentialSession(
    createRequest(TEST_SESSION_ID),
    {
      fanartKey: 'fanart-user-key',
      mdblistKey: '',
    },
    store,
    () => '22222222-2222-4222-8222-222222222222',
  );

  assert.equal(next.cookie.value, TEST_SESSION_ID);

  const restored = readConfiguratorProviderCredentialSession(createRequest(TEST_SESSION_ID), store);
  assert.deepEqual(restored, {
    tmdbKey: 'tmdb-user-key',
    mdblistKey: '',
    fanartKey: 'fanart-user-key',
    simklClientId: '',
  });

  assert.deepEqual(next.status, {
    tmdb: true,
    mdblist: false,
    fanart: true,
    simkl: false,
  });
  assert.deepEqual(next.maskedPreview, {
    tmdb: 'tmdb*****-key',
    mdblist: '',
    fanart: 'fana*******-key',
    simkl: '',
  });
});

test('configurator provider credential session upgrades legacy encrypted cookies to opaque server sessions', () => {
  const store = createStore();
  const legacyCookie = buildLegacyConfiguratorProviderCredentialSessionCookie({
    tmdbKey: 'tmdb-user-key',
    simklClientId: 'simkl-user-key',
  });

  const migrated = migrateConfiguratorProviderCredentialSession(
    createRequest(legacyCookie.value),
    store,
    () => TEST_SESSION_ID,
  );

  assert.notEqual(migrated, null);
  assert.equal(migrated.cookie.value, TEST_SESSION_ID);
  assert.equal(store.values.size, 1);
  assert.deepEqual(migrated.maskedPreview, {
    tmdb: 'tmdb*****-key',
    mdblist: '',
    fanart: '',
    simkl: 'simk******-key',
  });
  assert.deepEqual(readConfiguratorProviderCredentialSession(createRequest(TEST_SESSION_ID), store), {
    tmdbKey: 'tmdb-user-key',
    mdblistKey: '',
    fanartKey: '',
    simklClientId: 'simkl-user-key',
  });
});

test('configurator provider credential session clears cleanly when no keys remain', () => {
  const store = createStore();

  updateConfiguratorProviderCredentialSession(
    createRequest(),
    {
      tmdbKey: 'tmdb-user-key',
    },
    store,
    () => TEST_SESSION_ID,
  );

  const cleared = updateConfiguratorProviderCredentialSession(
    createRequest(TEST_SESSION_ID),
    {
      tmdbKey: '',
    },
    store,
    () => TEST_SESSION_ID,
  );

  assert.equal(cleared.cookie.value, '');
  assert.equal(cleared.cookie.maxAge, 0);
  assert.equal(store.values.size, 0);
  assert.deepEqual(cleared.maskedPreview, {
    tmdb: '',
    mdblist: '',
    fanart: '',
    simkl: '',
  });
  assert.deepEqual(readConfiguratorProviderCredentialSession(createRequest(), store), {
    tmdbKey: '',
    mdblistKey: '',
    fanartKey: '',
    simklClientId: '',
  });
});