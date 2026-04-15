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

  delete process.env.XRDB_POSTER_WARM_SOURCE;
  delete process.env.XRDB_POSTER_WARM_SOURCE_FILE;
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
  }
});