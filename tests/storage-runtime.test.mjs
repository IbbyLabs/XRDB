import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

const withTempDataDir = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ibbystorage-'));
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousDbPath = process.env.XRDB_DB_PATH;
  const previousObjectStorageDir = process.env.XRDB_OBJECT_STORAGE_DIR;

  process.env.XRDB_DATA_DIR = tempDir;
  delete process.env.XRDB_DB_PATH;
  delete process.env.XRDB_OBJECT_STORAGE_DIR;

  t.after(() => {
    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousDbPath === undefined) delete process.env.XRDB_DB_PATH;
    else process.env.XRDB_DB_PATH = previousDbPath;

    if (previousObjectStorageDir === undefined) delete process.env.XRDB_OBJECT_STORAGE_DIR;
    else process.env.XRDB_OBJECT_STORAGE_DIR = previousObjectStorageDir;

    rmSync(tempDir, { recursive: true, force: true });
  });

  return callback(tempDir);
};

test('db helpers use the configured data directory and support transactions', async (t) => {
  await withTempDataDir(t, async (tempDir) => {
    const dbModule = await importFresh('../lib/sqliteStore.ts');
    const now = Date.now();

    assert.equal(dbModule.getDbPath(), join(tempDir, 'xrdb.db'));

    await dbModule.dbQuery(
      'INSERT INTO metadata_cache (key, value, expires_at, last_accessed_at) VALUES ($1, $2, $3, $4)',
      ['alpha', '"ready"', now + 60_000, now],
    );

    await dbModule.dbTransaction(async (client) => {
      await client.query(
        'INSERT INTO metadata_cache (key, value, expires_at, last_accessed_at) VALUES ($1, $2, $3, $4)',
        ['beta', '"steady"', now + 60_000, now + 1],
      );
    });

    const result = await dbModule.dbQuery('SELECT key FROM metadata_cache ORDER BY key ASC');
    assert.deepEqual(result.rows.map((row) => row.key), ['alpha', 'beta']);
    assert.equal(existsSync(join(tempDir, 'xrdb.db')), true);
  });
});

test('metadata cache round trips values and prunes down to a target size', async (t) => {
  await withTempDataDir(t, async () => {
    const dbModule = await importFresh('../lib/sqliteStore.ts');
    const cacheModule = await importFresh('../lib/metadataStore.ts');

    cacheModule.setMetadata('object', { ready: true }, 60_000);
    cacheModule.setMetadata('text', 'plain', 60_000);
    cacheModule.setMetadata('expired', { gone: true }, -1);

    assert.deepEqual(cacheModule.getMetadata('object'), { ready: true });
    assert.equal(cacheModule.getMetadata('text'), 'plain');
    assert.equal(cacheModule.getMetadata('expired'), null);

    cacheModule.pruneOldestMetadata(1);

    const result = await dbModule.dbQuery('SELECT COUNT(*) as count FROM metadata_cache');
    assert.equal(Number(result.rows[0].count), 1);
  });
});

test('object storage writes, reads, and prunes expired images inside the configured data directory', async (t) => {
  await withTempDataDir(t, async (tempDir) => {
    const storageModule = await importFresh('../lib/imageObjectStorage.ts');
    const key = storageModule.buildObjectStorageImageKey('sample');
    const body = new Uint8Array([1, 2, 3, 4]).buffer;

    await storageModule.putCachedImageToObjectStorage(key, {
      body,
      contentType: 'image/png',
      cacheControl: 'public, max-age=1',
    });

    const cached = await storageModule.getCachedImageFromObjectStorage(key);
    assert.ok(cached);
    assert.equal(cached.contentType, 'image/png');
    assert.deepEqual(Array.from(new Uint8Array(cached.body)), [1, 2, 3, 4]);

    const filePath = join(tempDir, 'cache', 'images', 'final_sample.png');
    const metadataPath = `${filePath}.json`;
    const expiredAt = new Date(Date.now() - 5_000);

    utimesSync(filePath, expiredAt, expiredAt);
    storageModule.pruneExpiredObjectStorageImages();

    assert.equal(existsSync(filePath), false);
    assert.equal(existsSync(metadataPath), false);
    assert.equal(await storageModule.getCachedImageFromObjectStorage(key), null);
  });
});

test('object storage prunes oldest files when byte budget is exceeded', async (t) => {
  await withTempDataDir(t, async (tempDir) => {
    const storageModule = await importFresh('../lib/imageObjectStorage.ts');
    const firstKey = storageModule.buildObjectStorageImageKey('first');
    const secondKey = storageModule.buildObjectStorageImageKey('second');
    const thirdKey = storageModule.buildObjectStorageImageKey('third');

    const createPayload = (value) => ({
      body: new Uint8Array([value, value, value, value, value, value]).buffer,
      contentType: 'image/png',
      cacheControl: 'public, max-age=300',
    });

    await storageModule.putCachedImageToObjectStorage(firstKey, createPayload(1));
    await storageModule.putCachedImageToObjectStorage(secondKey, createPayload(2));
    await storageModule.putCachedImageToObjectStorage(thirdKey, createPayload(3));

    const cacheDir = join(tempDir, 'cache', 'images');
    const firstPath = join(cacheDir, 'final_first.png');
    const secondPath = join(cacheDir, 'final_second.png');
    const thirdPath = join(cacheDir, 'final_third.png');

    const older = new Date(Date.now() - 10_000);
    const old = new Date(Date.now() - 5_000);
    const newest = new Date(Date.now() - 1_000);
    utimesSync(firstPath, older, older);
    utimesSync(secondPath, old, old);
    utimesSync(thirdPath, newest, newest);

    storageModule.pruneObjectStorageCache({ dir: cacheDir, maxFiles: 10, maxBytes: 10 });

    assert.equal(existsSync(firstPath), false);
    assert.equal(existsSync(`${firstPath}.json`), false);
    assert.equal(existsSync(secondPath), false);
    assert.equal(existsSync(`${secondPath}.json`), false);
    assert.equal(existsSync(thirdPath), true);
    assert.equal(existsSync(`${thirdPath}.json`), true);
  });
});

test('object storage prunes oldest files when file budget is exceeded', async (t) => {
  await withTempDataDir(t, async (tempDir) => {
    const storageModule = await importFresh('../lib/imageObjectStorage.ts');
    const keys = ['alpha', 'beta', 'gamma'];

    for (const [index, key] of keys.entries()) {
      await storageModule.putCachedImageToObjectStorage(
        storageModule.buildObjectStorageImageKey(key),
        {
          body: new Uint8Array([index + 1]).buffer,
          contentType: 'image/png',
          cacheControl: 'public, max-age=300',
        },
      );
    }

    const cacheDir = join(tempDir, 'cache', 'images');
    const alphaPath = join(cacheDir, 'final_alpha.png');
    const betaPath = join(cacheDir, 'final_beta.png');
    const gammaPath = join(cacheDir, 'final_gamma.png');

    const older = new Date(Date.now() - 10_000);
    const old = new Date(Date.now() - 5_000);
    const newest = new Date(Date.now() - 1_000);
    utimesSync(alphaPath, older, older);
    utimesSync(betaPath, old, old);
    utimesSync(gammaPath, newest, newest);

    storageModule.pruneObjectStorageCache({ dir: cacheDir, maxFiles: 2, maxBytes: 1000 });

    assert.equal(existsSync(alphaPath), false);
    assert.equal(existsSync(betaPath), true);
    assert.equal(existsSync(gammaPath), true);

    const cachedFiles = readdirSync(cacheDir).filter((entry) => !entry.endsWith('.json'));
    assert.deepEqual(cachedFiles.sort(), ['final_beta.png', 'final_gamma.png']);
  });
});

test('metadata cache prunes oldest entries when count exceeds limit via direct call', async (t) => {
  await withTempDataDir(t, async () => {
    const cacheModule = await importFresh('../lib/metadataStore.ts');

    cacheModule.setMetadata('keep:a', 'a', 60_000);
    cacheModule.setMetadata('keep:b', 'b', 60_000);
    cacheModule.setMetadata('keep:c', 'c', 60_000);

    const { pruneOldestMetadata } = cacheModule;
    pruneOldestMetadata(2);

    assert.equal(cacheModule.getMetadata('keep:a'), null);
    assert.ok(cacheModule.getMetadata('keep:b') !== null || cacheModule.getMetadata('keep:c') !== null);
  });
});

test('metadata cache prunes expired entries on read and via first-write triggered prune', async (t) => {
  await withTempDataDir(t, async () => {
    const cacheModule = await importFresh('../lib/metadataStore.ts');

    cacheModule.setMetadata('live:x', 'x', 60_000);
    cacheModule.setMetadata('dead:y', 'y', -1);

    assert.equal(cacheModule.getMetadata('live:x'), 'x');
    assert.equal(cacheModule.getMetadata('dead:y'), null);

    cacheModule.setMetadata('trigger:z', 'z', 60_000);

    const { getDb, ensureDbInitialized } = await importFresh('../lib/sqliteStore.ts');
    ensureDbInitialized();
    const row = getDb().prepare('SELECT COUNT(*) as count FROM metadata_cache WHERE expires_at <= ?').get(Date.now());
    assert.equal(Number(row.count), 0);
  });
});

test('metadata cache first write triggers prune clearing expired entries when no prune has previously run', async (t) => {
  await withTempDataDir(t, async () => {
    const cacheModule = await importFresh('../lib/metadataStore.ts');
    const { getDb, ensureDbInitialized } = await importFresh('../lib/sqliteStore.ts');

    const db = getDb();
    ensureDbInitialized();
    const expired = Date.now() - 1_000;
    db.prepare('INSERT INTO metadata_cache (key, value, expires_at, last_accessed_at) VALUES (?, ?, ?, ?)').run('stale:a', '"x"', expired, expired);
    db.prepare('INSERT INTO metadata_cache (key, value, expires_at, last_accessed_at) VALUES (?, ?, ?, ?)').run('stale:b', '"y"', expired, expired);

    cacheModule.setMetadata('trigger:fresh', 'z', 60_000);

    const row = db.prepare('SELECT COUNT(*) as count FROM metadata_cache WHERE expires_at <= ?').get(Date.now());
    assert.equal(Number(row.count), 0);
  });
});

test('db initialization fails with a direct permission error when the data directory is not writable', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-db-perms-'));
  const lockedDir = join(tempDir, 'locked');
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousDbPath = process.env.XRDB_DB_PATH;

  mkdirSync(lockedDir, { recursive: true });
  chmodSync(lockedDir, 0o555);
  process.env.XRDB_DATA_DIR = lockedDir;
  delete process.env.XRDB_DB_PATH;

  t.after(() => {
    chmodSync(lockedDir, 0o755);

    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousDbPath === undefined) delete process.env.XRDB_DB_PATH;
    else process.env.XRDB_DB_PATH = previousDbPath;

    rmSync(tempDir, { recursive: true, force: true });
  });

  const dbModule = await importFresh('../lib/dbCore.ts');

  assert.throws(() => dbModule.ensureDbInitialized(), /Data directory is not writable: .*locked/);
});
