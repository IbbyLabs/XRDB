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

test('object storage paths use the configured data directory and sanitize keys', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ibbystorage-paths-'));
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousObjectStorageDir = process.env.XRDB_OBJECT_STORAGE_DIR;

  process.env.XRDB_DATA_DIR = tempDir;
  delete process.env.XRDB_OBJECT_STORAGE_DIR;

  t.after(() => {
    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousObjectStorageDir === undefined) delete process.env.XRDB_OBJECT_STORAGE_DIR;
    else process.env.XRDB_OBJECT_STORAGE_DIR = previousObjectStorageDir;

    rmSync(tempDir, { recursive: true, force: true });
  });

  const storagePathsModule = await importFresh('../lib/imageObjectStoragePaths.ts');
  const cacheDir = join(tempDir, 'cache', 'images');

  assert.equal(storagePathsModule.resolveObjectStorageDir(), cacheDir);
  assert.deepEqual(storagePathsModule.getObjectStoragePaths('final/sample.png'), {
    cacheDir,
    filePath: join(cacheDir, 'final_sample.png'),
    metadataPath: join(cacheDir, 'final_sample.png.json'),
  });
  assert.equal(storagePathsModule.buildObjectStorageImageKey('abc123'), 'final/abc123.png');
  assert.equal(
    storagePathsModule.buildObjectStorageSourceImageKey('tt123/4', 'poster'),
    'source/tt123_4_poster.png',
  );
});

test('object storage paths honor the explicit storage directory override', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ibbystorage-override-'));
  const explicitDir = join(tempDir, 'imagespace');
  const previousObjectStorageDir = process.env.XRDB_OBJECT_STORAGE_DIR;

  process.env.XRDB_OBJECT_STORAGE_DIR = explicitDir;

  t.after(() => {
    if (previousObjectStorageDir === undefined) delete process.env.XRDB_OBJECT_STORAGE_DIR;
    else process.env.XRDB_OBJECT_STORAGE_DIR = previousObjectStorageDir;

    rmSync(tempDir, { recursive: true, force: true });
  });

  const storagePathsModule = await importFresh('../lib/imageObjectStoragePaths.ts');

  assert.equal(storagePathsModule.resolveObjectStorageDir(), explicitDir);
  assert.equal(storagePathsModule.ensureObjectStorageDir(), explicitDir);
});
