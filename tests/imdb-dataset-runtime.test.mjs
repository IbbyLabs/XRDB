import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

const withTempImdbEnv = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ibbyimdb-'));
  const ratingsPath = join(tempDir, 'imdb', 'ratings.tsv');
  const episodesPath = join(tempDir, 'imdb', 'episodes.tsv');
  const previousEnv = {
    XRDB_DATA_DIR: process.env.XRDB_DATA_DIR,
    XRDB_DB_PATH: process.env.XRDB_DB_PATH,
    XRDB_IMDB_RATINGS_DATASET_PATH: process.env.XRDB_IMDB_RATINGS_DATASET_PATH,
    XRDB_IMDB_EPISODES_DATASET_PATH: process.env.XRDB_IMDB_EPISODES_DATASET_PATH,
    XRDB_IMDB_DATASET_AUTO_DOWNLOAD: process.env.XRDB_IMDB_DATASET_AUTO_DOWNLOAD,
    XRDB_IMDB_DATASET_AUTO_IMPORT: process.env.XRDB_IMDB_DATASET_AUTO_IMPORT,
    XRDB_IMDB_DATASET_IMPORT_BATCH: process.env.XRDB_IMDB_DATASET_IMPORT_BATCH,
    XRDB_IMDB_DATASET_IMPORT_PROGRESS: process.env.XRDB_IMDB_DATASET_IMPORT_PROGRESS,
    XRDB_IMDB_DATASET_LOG: process.env.XRDB_IMDB_DATASET_LOG,
  };

  mkdirSync(join(tempDir, 'imdb'), { recursive: true });

  writeFileSync(
    ratingsPath,
    'tconst\taverageRating\tnumVotes\ntt1000001\t7.4\t321\ntt1000002\t8.1\t654\n',
    'utf8',
  );
  writeFileSync(
    episodesPath,
    'tconst\tparentTconst\tseasonNumber\tepisodeNumber\ntt2000001\ttt1000001\t1\t2\ntt2000002\ttt1000001\t1\t3\n',
    'utf8',
  );

  process.env.XRDB_DATA_DIR = tempDir;
  delete process.env.XRDB_DB_PATH;
  process.env.XRDB_IMDB_RATINGS_DATASET_PATH = ratingsPath;
  process.env.XRDB_IMDB_EPISODES_DATASET_PATH = episodesPath;
  process.env.XRDB_IMDB_DATASET_AUTO_DOWNLOAD = 'false';
  process.env.XRDB_IMDB_DATASET_AUTO_IMPORT = 'true';
  process.env.XRDB_IMDB_DATASET_IMPORT_BATCH = '1';
  process.env.XRDB_IMDB_DATASET_IMPORT_PROGRESS = '0';
  process.env.XRDB_IMDB_DATASET_LOG = 'false';

  t.after(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    rmSync(tempDir, { recursive: true, force: true });
  });

  return callback({
    tempDir,
    dbPath: join(tempDir, 'xrdb.db'),
  });
};

test('IMDb dataset sync imports ratings and episodes into the configured sqlite file', async (t) => {
  await withTempImdbEnv(t, async ({ dbPath }) => {
    const syncModule = await importFresh('../lib/imdbDatasetScheduler.ts');
    const datasetModule = await importFresh('../lib/imdbDatasetLookup.ts');

    await syncModule.runImdbDatasetSync();

    assert.equal(existsSync(dbPath), true);
    assert.deepEqual(datasetModule.getImdbRatingFromDataset('tt1000001'), {
      rating: 7.4,
      votes: 321,
    });
    assert.deepEqual(datasetModule.getImdbEpisodeFromDataset('tt2000001'), {
      imdbId: 'tt2000001',
      seriesImdbId: 'tt1000001',
      seasonNumber: 1,
      episodeNumber: 2,
    });
    assert.deepEqual(datasetModule.findImdbEpisodeBySeriesSeasonEpisode('tt1000001', 1, 3), {
      imdbId: 'tt2000002',
      seriesImdbId: 'tt1000001',
      seasonNumber: 1,
      episodeNumber: 3,
    });
    assert.equal(datasetModule.getImdbRatingFromDataset('tt999'), null);
  });
});
