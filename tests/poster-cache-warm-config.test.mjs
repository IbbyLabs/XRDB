import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parsePosterWarmTargets,
  readPosterWarmSource,
  resolvePosterCacheWarmConfig,
} from '../lib/posterCacheWarmConfig.ts';

test('poster warm target parser accepts explicit ids and poster urls', () => {
  const targets = parsePosterWarmTargets([
    'tt0133093',
    'https://xrdb.example.com/poster/tmdb%3Amovie%3A603.jpg?cb=1',
    'tmdb:tv:1396',
  ].join('\n'));

  assert.deepEqual(targets, ['tt0133093', 'tmdb:movie:603', 'tmdb:tv:1396']);
});

test('poster warm source merges inline and file targets with dedupe', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-poster-warm-'));
  const sourceFile = join(tempDir, 'targets.txt');
  writeFileSync(sourceFile, 'tt0133093\ntmdb:movie:603\n', 'utf8');

  try {
    const targets = readPosterWarmSource({
      source: 'tmdb:movie:603,tmdb:tv:1396',
      sourceFilePath: sourceFile,
    });

    assert.deepEqual(targets, ['tmdb:movie:603', 'tmdb:tv:1396', 'tt0133093']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('poster warm config stays disabled without source input', () => {
  const previousEnabled = process.env.XRDB_POSTER_WARM_ENABLED;
  const previousSource = process.env.XRDB_POSTER_WARM_SOURCE;
  const previousFile = process.env.XRDB_POSTER_WARM_SOURCE_FILE;
  const previousTmdbEnabled = process.env.XRDB_POSTER_WARM_TMDB_ENABLED;
  const previousMdblistEnabled = process.env.XRDB_POSTER_WARM_MDBLIST_ENABLED;
  const previousImdbEnabled = process.env.XRDB_POSTER_WARM_IMDB_ENABLED;
  const previousRecentEnabled = process.env.XRDB_POSTER_WARM_RECENT_ENABLED;

  delete process.env.XRDB_POSTER_WARM_SOURCE;
  delete process.env.XRDB_POSTER_WARM_SOURCE_FILE;
  delete process.env.XRDB_POSTER_WARM_TMDB_ENABLED;
  delete process.env.XRDB_POSTER_WARM_MDBLIST_ENABLED;
  delete process.env.XRDB_POSTER_WARM_IMDB_ENABLED;
  delete process.env.XRDB_POSTER_WARM_RECENT_ENABLED;
  process.env.XRDB_POSTER_WARM_ENABLED = 'true';

  try {
    const config = resolvePosterCacheWarmConfig();
    assert.equal(config.enabled, false);
  } finally {
    if (previousEnabled === undefined) delete process.env.XRDB_POSTER_WARM_ENABLED;
    else process.env.XRDB_POSTER_WARM_ENABLED = previousEnabled;
    if (previousSource === undefined) delete process.env.XRDB_POSTER_WARM_SOURCE;
    else process.env.XRDB_POSTER_WARM_SOURCE = previousSource;
    if (previousFile === undefined) delete process.env.XRDB_POSTER_WARM_SOURCE_FILE;
    else process.env.XRDB_POSTER_WARM_SOURCE_FILE = previousFile;
    if (previousTmdbEnabled === undefined) delete process.env.XRDB_POSTER_WARM_TMDB_ENABLED;
    else process.env.XRDB_POSTER_WARM_TMDB_ENABLED = previousTmdbEnabled;
    if (previousMdblistEnabled === undefined) delete process.env.XRDB_POSTER_WARM_MDBLIST_ENABLED;
    else process.env.XRDB_POSTER_WARM_MDBLIST_ENABLED = previousMdblistEnabled;
    if (previousImdbEnabled === undefined) delete process.env.XRDB_POSTER_WARM_IMDB_ENABLED;
    else process.env.XRDB_POSTER_WARM_IMDB_ENABLED = previousImdbEnabled;
    if (previousRecentEnabled === undefined) delete process.env.XRDB_POSTER_WARM_RECENT_ENABLED;
    else process.env.XRDB_POSTER_WARM_RECENT_ENABLED = previousRecentEnabled;
  }
});

test('poster warm config enables scheduler when only dynamic sources are enabled', () => {
  const previousEnabled = process.env.XRDB_POSTER_WARM_ENABLED;
  const previousSource = process.env.XRDB_POSTER_WARM_SOURCE;
  const previousFile = process.env.XRDB_POSTER_WARM_SOURCE_FILE;
  const previousTmdbEnabled = process.env.XRDB_POSTER_WARM_TMDB_ENABLED;

  delete process.env.XRDB_POSTER_WARM_SOURCE;
  delete process.env.XRDB_POSTER_WARM_SOURCE_FILE;
  process.env.XRDB_POSTER_WARM_ENABLED = 'true';
  process.env.XRDB_POSTER_WARM_TMDB_ENABLED = 'true';

  try {
    const config = resolvePosterCacheWarmConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.tmdbEnabled, true);
    assert.equal(config.tmdbLimit, 100);
    assert.equal(config.mdblistEnabled, false);
    assert.equal(config.mdblistLimit, 200);
  } finally {
    if (previousEnabled === undefined) delete process.env.XRDB_POSTER_WARM_ENABLED;
    else process.env.XRDB_POSTER_WARM_ENABLED = previousEnabled;
    if (previousSource === undefined) delete process.env.XRDB_POSTER_WARM_SOURCE;
    else process.env.XRDB_POSTER_WARM_SOURCE = previousSource;
    if (previousFile === undefined) delete process.env.XRDB_POSTER_WARM_SOURCE_FILE;
    else process.env.XRDB_POSTER_WARM_SOURCE_FILE = previousFile;
    if (previousTmdbEnabled === undefined) delete process.env.XRDB_POSTER_WARM_TMDB_ENABLED;
    else process.env.XRDB_POSTER_WARM_TMDB_ENABLED = previousTmdbEnabled;
  }
});

test('poster warm config parses cache UUID list and caps to five entries', () => {
  const previousCacheUuids = process.env.XRDB_POSTER_CACHE_UUIDS;
  process.env.XRDB_POSTER_CACHE_UUIDS = 'a,b,c,d,e,f';

  try {
    const config = resolvePosterCacheWarmConfig();
    assert.deepEqual(config.cacheUuids, ['a', 'b', 'c', 'd', 'e']);
  } finally {
    if (previousCacheUuids === undefined) delete process.env.XRDB_POSTER_CACHE_UUIDS;
    else process.env.XRDB_POSTER_CACHE_UUIDS = previousCacheUuids;
  }
});