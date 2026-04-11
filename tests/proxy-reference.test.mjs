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
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-proxy-ref-'));
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

test('proxy references are reused by fingerprint and round-trip through storage', async (t) => {
  await withTempDataDir(t, async () => {
    const dbModule = await importFresh('../lib/dbCore.ts');

    const payload = {
      url: 'https://addon.example.com/manifest.json',
      tmdbKey: 'tmdb',
      mdblistKey: 'mdb',
      translateMeta: true,
    };

    const firstId = dbModule.createOrReuseProxyReference(payload);
    const secondId = dbModule.createOrReuseProxyReference(payload);

    assert.equal(firstId, secondId);
    assert.deepEqual(dbModule.getProxyReference(firstId), payload);
  });
});

test('proxy route plan resolves stored UUID references and still supports legacy base64 payloads', async (t) => {
  await withTempDataDir(t, async () => {
    const dbModule = await importFresh('../lib/dbCore.ts');
    const planModule = await importFresh('../lib/proxyRoutePlan.ts');

    const storedId = dbModule.createOrReuseProxyReference({
      url: 'https://addon.example.com/manifest.json',
      tmdbKey: 'tmdb',
      mdblistKey: 'mdb',
      posterArtworkSource: 'fanart',
    });

    const storedParsed = planModule.parseProxyRouteConfig(new URLSearchParams(), [
      storedId,
      'catalog',
      'movie',
      'top.json',
    ]);
    assert.equal(storedParsed.error, undefined);
    assert.equal(storedParsed.configSeed, storedId);
    assert.equal(storedParsed.config?.posterArtworkSource, 'fanart');
    assert.deepEqual(storedParsed.resourceSegments, ['catalog', 'movie', 'top.json']);

    const encoded = Buffer.from(
      JSON.stringify({
        url: 'https://addon.example.com/manifest.json',
        tmdbKey: 'tmdb',
        mdblistKey: 'mdb',
        proxyTypes: 'movie',
      }),
    ).toString('base64url');

    const legacyParsed = planModule.parseProxyRouteConfig(new URLSearchParams(), [
      encoded,
      'meta',
      'movie',
      'id.json',
    ]);
    assert.equal(legacyParsed.error, undefined);
    assert.equal(legacyParsed.config?.proxyTypes, 'movie');
  });
});
