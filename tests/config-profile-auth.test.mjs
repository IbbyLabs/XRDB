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
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-config-auth-'));
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

test('protected config profiles store password metadata and use UUID identifiers', async (t) => {
  await withTempDataDir(t, async () => {
    const authModule = await importFresh('../lib/configProfileAuth.ts');
    const dbModule = await importFresh('../lib/dbCore.ts');

    const passwordHash = await authModule.hashConfigPassword('correct horse');
    const id = dbModule.createProtectedConfigProfile({ tmdbKey: 'tmdb', mdblistKey: 'mdb' }, passwordHash);

    assert.match(id, dbModule.PROTECTED_CONFIG_ID_RE);
    assert.deepEqual(dbModule.getConfigProfile(id), { tmdbKey: 'tmdb', mdblistKey: 'mdb' });
    assert.equal(await authModule.verifyConfigPassword('correct horse', dbModule.getConfigProfilePasswordHash(id)), true);
    assert.equal(dbModule.getConfigProfileMetadata(id)?.hasPassword, true);
    assert.equal(dbModule.getConfigProfileMetadata(id)?.failedAttempts, 0);
  });
});

test('legacy config rows remain readable after protected-profile schema changes', async (t) => {
  await withTempDataDir(t, async () => {
    const dbModule = await importFresh('../lib/dbCore.ts');

    dbModule.ensureDbInitialized();
    dbModule.getDb().prepare(
      `INSERT INTO config_profiles (id, params, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run('xr_deadbeef', JSON.stringify({ tmdbKey: 'legacy-tmdb', mdblistKey: 'legacy-mdb' }), Date.now(), Date.now());

    assert.deepEqual(dbModule.getConfigProfile('xr_deadbeef'), {
      tmdbKey: 'legacy-tmdb',
      mdblistKey: 'legacy-mdb',
    });
    assert.equal(dbModule.getConfigProfileMetadata('xr_deadbeef')?.isLegacy, true);
    assert.equal(dbModule.getConfigProfileMetadata('xr_deadbeef')?.hasPassword, false);
  });
});

test('failed unlock attempts lock the profile after five consecutive failures and unlock tokens round-trip', async (t) => {
  await withTempDataDir(t, async () => {
    const authModule = await importFresh('../lib/configProfileAuth.ts');
    const dbModule = await importFresh('../lib/dbCore.ts');

    const passwordHash = await authModule.hashConfigPassword('correct horse');
    const id = dbModule.createProtectedConfigProfile({ tmdbKey: 'tmdb', mdblistKey: 'mdb' }, passwordHash);

    let metadata = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      metadata = dbModule.recordConfigProfileUnlockFailure(
        id,
        authModule.resolveConfigProfileLockoutUntil(attempt, 1_000),
      );
    }

    assert.equal(metadata?.failedAttempts, 5);
    assert.equal(metadata?.lockedUntil, 901000);

    const reset = dbModule.clearConfigProfileUnlockFailures(id);
    assert.equal(reset?.failedAttempts, 0);
    assert.equal(reset?.lockedUntil, null);

    const token = authModule.createConfigUnlockToken({
      id,
      unlockVersion: reset?.unlockVersion ?? 0,
      expiresAt: Date.now() + 60_000,
    });

    assert.deepEqual(authModule.verifyConfigUnlockToken(token), {
      id,
      unlockVersion: reset?.unlockVersion ?? 0,
      expiresAt: authModule.verifyConfigUnlockToken(token)?.expiresAt,
    });
  });
});