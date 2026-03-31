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

test('IMDb dataset sync config resolves local defaults from the data directory', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ibbyimdb-config-'));
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousRatingsPath = process.env.XRDB_IMDB_RATINGS_DATASET_PATH;
  const previousEpisodesPath = process.env.XRDB_IMDB_EPISODES_DATASET_PATH;

  process.env.XRDB_DATA_DIR = tempDir;
  delete process.env.XRDB_IMDB_RATINGS_DATASET_PATH;
  delete process.env.XRDB_IMDB_EPISODES_DATASET_PATH;

  t.after(() => {
    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousRatingsPath === undefined) delete process.env.XRDB_IMDB_RATINGS_DATASET_PATH;
    else process.env.XRDB_IMDB_RATINGS_DATASET_PATH = previousRatingsPath;

    if (previousEpisodesPath === undefined) delete process.env.XRDB_IMDB_EPISODES_DATASET_PATH;
    else process.env.XRDB_IMDB_EPISODES_DATASET_PATH = previousEpisodesPath;

    rmSync(tempDir, { recursive: true, force: true });
  });

  const syncConfigModule = await importFresh('../lib/imdbDatasetLookupSchedulerConfig.ts');

  assert.deepEqual(syncConfigModule.resolveImdbDatasetPaths(), {
    ratingsPath: join(tempDir, 'imdb', 'title.ratings.tsv.gz'),
    episodesPath: join(tempDir, 'imdb', 'title.episode.tsv.gz'),
  });
});

test('IMDb dataset sync config clamps timings and builds dataset urls from the base url', async (t) => {
  const previousEnv = {
    XRDB_IMDB_DATASET_BASE_URL: process.env.XRDB_IMDB_DATASET_BASE_URL,
    XRDB_IMDB_DATASET_REFRESH_MS: process.env.XRDB_IMDB_DATASET_REFRESH_MS,
    XRDB_IMDB_DATASET_CHECK_INTERVAL_MS: process.env.XRDB_IMDB_DATASET_CHECK_INTERVAL_MS,
    XRDB_IMDB_DATASET_AUTO_DOWNLOAD: process.env.XRDB_IMDB_DATASET_AUTO_DOWNLOAD,
    XRDB_IMDB_DATASET_AUTO_IMPORT: process.env.XRDB_IMDB_DATASET_AUTO_IMPORT,
    XRDB_IMDB_DATASET_IMPORT_BATCH: process.env.XRDB_IMDB_DATASET_IMPORT_BATCH,
    XRDB_IMDB_DATASET_IMPORT_PROGRESS: process.env.XRDB_IMDB_DATASET_IMPORT_PROGRESS,
    XRDB_IMDB_DATASET_LOG: process.env.XRDB_IMDB_DATASET_LOG,
  };

  process.env.XRDB_IMDB_DATASET_BASE_URL = 'https://example.test/imdb/';
  process.env.XRDB_IMDB_DATASET_REFRESH_MS = '1';
  process.env.XRDB_IMDB_DATASET_CHECK_INTERVAL_MS = '999999999999';
  process.env.XRDB_IMDB_DATASET_AUTO_DOWNLOAD = 'no';
  process.env.XRDB_IMDB_DATASET_AUTO_IMPORT = 'yes';
  process.env.XRDB_IMDB_DATASET_IMPORT_BATCH = '20';
  process.env.XRDB_IMDB_DATASET_IMPORT_PROGRESS = '-10';
  process.env.XRDB_IMDB_DATASET_LOG = 'true';

  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const syncConfigModule = await importFresh('../lib/imdbDatasetLookupSchedulerConfig.ts');
  const config = syncConfigModule.resolveImdbDatasetSyncConfig();

  assert.equal(config.autoDownload, false);
  assert.equal(config.autoImport, true);
  assert.equal(config.logEnabled, true);
  assert.equal(config.refreshMs, 60 * 60 * 1000);
  assert.equal(config.checkIntervalMs, 24 * 60 * 60 * 1000);
  assert.equal(config.importBatchSize, 1000);
  assert.equal(config.importProgress, 0);
  assert.deepEqual(syncConfigModule.resolveImdbDatasetUrls(), {
    ratingsUrl: 'https://example.test/imdb/title.ratings.tsv.gz',
    episodesUrl: 'https://example.test/imdb/title.episode.tsv.gz',
  });
});
