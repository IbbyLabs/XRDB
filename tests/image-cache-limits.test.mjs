import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

const countImages = (dir) =>
  readdirSync(dir).filter((name) => !name.endsWith('.json')).length;

const seedCache = (dir, count) => {
  for (let i = 0; i < count; i += 1) {
    const filePath = join(dir, `final_${i}.png`);
    writeFileSync(filePath, `img-${i}`);
    writeFileSync(`${filePath}.json`, JSON.stringify({
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    }));
  }
};

test('image cache limits default high and are overridable by env', async () => {
  const { resolveImageCacheLimits } = await importFresh('../lib/imageObjectStorage.ts');

  const defaults = resolveImageCacheLimits({});
  assert.equal(defaults.maxFiles, 20000);
  assert.equal(defaults.maxBytes, 8 * 1024 * 1024 * 1024);

  const overridden = resolveImageCacheLimits({
    XRDB_IMAGE_CACHE_MAX_FILES: '5',
    XRDB_IMAGE_CACHE_MAX_MB: '2',
  });
  assert.equal(overridden.maxFiles, 5);
  assert.equal(overridden.maxBytes, 2 * 1024 * 1024);

  // Zero or blank falls back to the default rather than disabling the cache.
  assert.equal(resolveImageCacheLimits({ XRDB_IMAGE_CACHE_MAX_FILES: '0' }).maxFiles, 20000);
});

test('prune trims to the env file cap and retains everything under the default', async (t) => {
  const previous = process.env.XRDB_IMAGE_CACHE_MAX_FILES;
  const cappedDir = mkdtempSync(join(tmpdir(), 'ibbycache-capped-'));
  const defaultDir = mkdtempSync(join(tmpdir(), 'ibbycache-default-'));

  t.after(() => {
    if (previous === undefined) delete process.env.XRDB_IMAGE_CACHE_MAX_FILES;
    else process.env.XRDB_IMAGE_CACHE_MAX_FILES = previous;
    rmSync(cappedDir, { recursive: true, force: true });
    rmSync(defaultDir, { recursive: true, force: true });
  });

  const { pruneObjectStorageCache } = await importFresh('../lib/imageObjectStorage.ts');

  process.env.XRDB_IMAGE_CACHE_MAX_FILES = '5';
  seedCache(cappedDir, 12);
  pruneObjectStorageCache({ dir: cappedDir });
  assert.equal(countImages(cappedDir), 5);

  delete process.env.XRDB_IMAGE_CACHE_MAX_FILES;
  seedCache(defaultDir, 12);
  pruneObjectStorageCache({ dir: defaultDir });
  assert.equal(countImages(defaultDir), 12);
});
