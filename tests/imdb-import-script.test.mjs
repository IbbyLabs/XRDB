import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

test('IMDb import script loads ratings and episodes into a chosen sqlite file', async (t) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ibbyimdb-script-'));
  const ratingsPath = join(tempDir, 'ratings.tsv');
  const episodesPath = join(tempDir, 'episodes.tsv');
  const dbPath = join(tempDir, 'xrdb.db');
  const previousDataDir = process.env.XRDB_DATA_DIR;
  const previousDbPath = process.env.XRDB_DB_PATH;

  writeFileSync(
    ratingsPath,
    'tconst\taverageRating\tnumVotes\ntt3000001\t6.9\t123\n',
    'utf8',
  );
  writeFileSync(
    episodesPath,
    'tconst\tparentTconst\tseasonNumber\tepisodeNumber\ntt4000001\ttt3000001\t2\t5\n',
    'utf8',
  );

  process.env.XRDB_DATA_DIR = tempDir;

  t.after(() => {
    if (previousDataDir === undefined) delete process.env.XRDB_DATA_DIR;
    else process.env.XRDB_DATA_DIR = previousDataDir;

    if (previousDbPath === undefined) delete process.env.XRDB_DB_PATH;
    else process.env.XRDB_DB_PATH = previousDbPath;

    rmSync(tempDir, { recursive: true, force: true });
  });

  const result = spawnSync(
    process.execPath,
    [
      'scripts/imdb-dataset-import.js',
      '--ratings',
      ratingsPath,
      '--episodes',
      episodesPath,
      '--db',
      dbPath,
      '--batch',
      '1',
      '--progress',
      '0',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  process.env.XRDB_DB_PATH = dbPath;
  const datasetModule = await importFresh('../lib/imdbDatasetLookup.ts');

  assert.deepEqual(datasetModule.getImdbRatingFromDataset('tt3000001'), {
    rating: 6.9,
    votes: 123,
  });
  assert.deepEqual(datasetModule.getImdbEpisodeFromDataset('tt4000001'), {
    imdbId: 'tt4000001',
    seriesImdbId: 'tt3000001',
    seasonNumber: 2,
    episodeNumber: 5,
  });
});
