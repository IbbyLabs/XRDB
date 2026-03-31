import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
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
