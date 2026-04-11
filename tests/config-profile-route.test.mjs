import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

const withTempDataDir = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-config-route-'));
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousDbPath = process.env.XRDB_DB_PATH;

  process.env.XRDB_DATA_DIR = tempDir;
  delete process.env.XRDB_DB_PATH;

  t.after(() => {
    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousDbPath === undefined) delete process.env.XRDB_DB_PATH;
    else process.env.XRDB_DB_PATH = previousDbPath;

    rmSync(tempDir, { recursive: true, force: true });
  });

  return callback();
};

test('config profile route helpers create protected profiles from body params and exclude password fields', async (t) => {
  await withTempDataDir(t, async () => {
    const routeModule = await importFresh('../lib/configProfileRoute.ts');
    const dbModule = await importFresh('../lib/dbCore.ts');

    const result = await routeModule.createProtectedConfigProfileFromBody({
      password: 'correct horse',
      tmdbKey: 'tmdb-key',
      mdblistKey: 'mdb-key',
      ignored: null,
    });

    assert.equal(result.ok, true);
    assert.match(result.id, dbModule.PROTECTED_CONFIG_ID_RE);
    assert.deepEqual(dbModule.getConfigProfile(result.id), {
      tmdbKey: 'tmdb-key',
      mdblistKey: 'mdb-key',
    });
  });
});

test('config profile route helpers unlock and authorize protected profile management', async (t) => {
  await withTempDataDir(t, async () => {
    const authModule = await importFresh('../lib/configProfileAuth.ts');
    const routeModule = await importFresh('../lib/configProfileRoute.ts');
    const dbModule = await importFresh('../lib/dbCore.ts');

    const passwordHash = await authModule.hashConfigPassword('correct horse');
    const id = dbModule.createProtectedConfigProfile({ tmdbKey: 'tmdb', mdblistKey: 'mdb' }, passwordHash);

    const unlock = await routeModule.unlockConfigProfileFromBody(id, { password: 'correct horse' });
    assert.equal(unlock.status, 200);
    assert.equal(typeof unlock.body.token, 'string');

    const headers = new Headers();
    headers.set(authModule.CONFIG_PROFILE_UNLOCK_HEADER, String(unlock.body.token));

    const authorized = routeModule.authorizeConfigProfileManagement(headers, id);
    assert.equal(authorized.ok, true);
  });
});

test('config profile route helpers require a valid unexpired unlock token for management access', async (t) => {
  await withTempDataDir(t, async () => {
    const authModule = await importFresh('../lib/configProfileAuth.ts');
    const routeModule = await importFresh('../lib/configProfileRoute.ts');
    const dbModule = await importFresh('../lib/dbCore.ts');

    const passwordHash = await authModule.hashConfigPassword('correct horse');
    const id = dbModule.createProtectedConfigProfile({ tmdbKey: 'tmdb', mdblistKey: 'mdb' }, passwordHash);

    const missing = routeModule.authorizeConfigProfileManagement(new Headers(), id);
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 401);

    const expiredHeaders = new Headers();
    expiredHeaders.set(
      authModule.CONFIG_PROFILE_UNLOCK_HEADER,
      authModule.createConfigUnlockToken({
        id,
        unlockVersion: dbModule.getConfigProfileMetadata(id)?.unlockVersion ?? 0,
        expiresAt: Date.now() - 60_000,
      }),
    );

    const expired = routeModule.authorizeConfigProfileManagement(expiredHeaders, id);
    assert.equal(expired.ok, false);
    assert.equal(expired.status, 401);
  });
});

test('config profile route helpers reject invalid passwords and expose lock state after repeated failures', async (t) => {
  await withTempDataDir(t, async () => {
    const authModule = await importFresh('../lib/configProfileAuth.ts');
    const routeModule = await importFresh('../lib/configProfileRoute.ts');
    const dbModule = await importFresh('../lib/dbCore.ts');

    const passwordHash = await authModule.hashConfigPassword('correct horse');
    const id = dbModule.createProtectedConfigProfile({ tmdbKey: 'tmdb', mdblistKey: 'mdb' }, passwordHash);

    let response = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      response = await routeModule.unlockConfigProfileFromBody(id, { password: 'wrong password' });
    }

    assert.equal(response?.status, 423);
    assert.equal(typeof response?.body.lockedUntil, 'number');
    assert.equal(response?.body.failedAttempts, 5);
  });
});

test('config profile route helpers migrate legacy profiles into protected UUID-backed profiles', async (t) => {
  await withTempDataDir(t, async () => {
    const routeModule = await importFresh('../lib/configProfileRoute.ts');
    const dbModule = await import('../lib/dbCore.ts');

    dbModule.upsertConfigProfile('xr_deadbeef', {
      tmdbKey: 'tmdb',
      mdblistKey: 'mdb',
    });

    const result = await routeModule.migrateLegacyConfigProfileFromBody('xr_deadbeef', {
      password: 'correct horse',
    });

    assert.equal(result.status, 200);
    assert.match(result.body.id, dbModule.PROTECTED_CONFIG_ID_RE);
    assert.equal(dbModule.getConfigProfile('xr_deadbeef'), null);
    assert.deepEqual(dbModule.getConfigProfile(result.body.id), {
      tmdbKey: 'tmdb',
      mdblistKey: 'mdb',
    });
  });
});