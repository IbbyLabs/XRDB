import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';

import { fetchImdbTopRatedIds, fetchMdblistTrendingIds, fetchTmdbPopularIds } from '../lib/posterCacheWarmDynamicSources.ts';

test('poster warm TMDB source fetches 6 endpoints, maps ids, and enforces cap', async () => {
  const requestedUrls = [];
  const ids = await fetchTmdbPopularIds({
    config: { tmdbEnabled: true, tmdbLimit: 4, logEnabled: false },
    tmdbKey: 'tmdb-key',
    fetchImpl: async (input) => {
      requestedUrls.push(String(input));
      const url = String(input);
      if (url.includes('/movie/popular')) {
        return new Response(JSON.stringify({ results: [{ id: 603 }, { id: 299534 }] }), { status: 200 });
      }
      if (url.includes('/movie/now_playing')) {
        return new Response(JSON.stringify({ results: [{ id: 550 }] }), { status: 200 });
      }
      if (url.includes('/tv/popular')) {
        return new Response(JSON.stringify({ results: [{ id: 1396 }, { id: 94997 }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [{ id: 85271 }] }), { status: 200 });
    },
  });

  assert.deepEqual(requestedUrls, [
    'https://api.themoviedb.org/3/movie/popular?api_key=tmdb-key&language=en-US&page=1',
    'https://api.themoviedb.org/3/movie/popular?api_key=tmdb-key&language=en-US&page=2',
    'https://api.themoviedb.org/3/movie/now_playing?api_key=tmdb-key&language=en-US&page=1',
    'https://api.themoviedb.org/3/tv/popular?api_key=tmdb-key&language=en-US&page=1',
    'https://api.themoviedb.org/3/tv/popular?api_key=tmdb-key&language=en-US&page=2',
    'https://api.themoviedb.org/3/tv/on_the_air?api_key=tmdb-key&language=en-US&page=1',
  ]);
  assert.deepEqual(ids, ['tmdb:movie:603', 'tmdb:movie:299534', 'tmdb:movie:550', 'tmdb:tv:1396']);
});

test('poster warm TMDB source skips when key is absent', async () => {
  const ids = await fetchTmdbPopularIds({
    config: { tmdbEnabled: true, tmdbLimit: 100, logEnabled: false },
    tmdbKey: '',
    fetchImpl: async () => {
      throw new Error('should not fetch without key');
    },
  });

  assert.deepEqual(ids, []);
});

test('poster warm TMDB source fails gracefully', async () => {
  const ids = await fetchTmdbPopularIds({
    config: { tmdbEnabled: true, tmdbLimit: 100, logEnabled: false },
    tmdbKey: 'tmdb-key',
    fetchImpl: async () => new Response('{}', { status: 500 }),
  });

  assert.deepEqual(ids, []);
});

test('poster warm MDBList source extracts imdb ids and enforces cap', async () => {
  const requestedUrls = [];
  const ids = await fetchMdblistTrendingIds({
    config: { mdblistEnabled: true, mdblistLimit: 3, logEnabled: false },
    fetchImpl: async (input) => {
      requestedUrls.push(String(input));
      if (String(input).includes('top-movies-of-the-week')) {
        return new Response(JSON.stringify([{ imdb_id: 'tt0111161' }, { imdb_id: 'tt0068646' }]), { status: 200 });
      }
      return new Response(JSON.stringify([{ imdb_id: 'tt0944947' }, { imdb_id: 'tt0111161' }]), { status: 200 });
    },
  });

  assert.deepEqual(requestedUrls, [
    'https://mdblist.com/lists/garycrawfordgc/top-movies-of-the-week/json',
    'https://mdblist.com/lists/garycrawfordgc/latest-tv-shows/json',
  ]);
  assert.deepEqual(ids, ['tt0111161', 'tt0068646', 'tt0944947']);
});

test('poster warm MDBList source skips when disabled', async () => {
  const ids = await fetchMdblistTrendingIds({
    config: { mdblistEnabled: false, mdblistLimit: 100, logEnabled: false },
    fetchImpl: async () => {
      throw new Error('should not fetch when disabled');
    },
  });

  assert.deepEqual(ids, []);
});

test('poster warm MDBList source fails gracefully', async () => {
  const ids = await fetchMdblistTrendingIds({
    config: { mdblistEnabled: true, mdblistLimit: 100, logEnabled: false },
    fetchImpl: async () => new Response('[]', { status: 503 }),
  });

  assert.deepEqual(ids, []);
});

test('poster warm IMDb source reads top-rated ids from ratings file', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-imdb-warm-'));
  const tsv = [
    'tconst\taverageRating\tnumVotes',
    'tt0111161\t9.3\t2700000',
    'tt0068646\t9.2\t1900000',
    'tt0071562\t9.0\t1300000',
    'tt0050083\t9.0\t800000',
  ].join('\n');
  const ratingsPath = join(tempDir, 'title.ratings.tsv.gz');
  writeFileSync(ratingsPath, gzipSync(Buffer.from(tsv)));

  try {
    const ids = await fetchImdbTopRatedIds({
      config: { imdbEnabled: true, imdbLimit: 2, logEnabled: false },
      ratingsPath,
    });
    assert.deepEqual(ids, ['tt0111161', 'tt0068646']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('poster warm IMDb source skips when disabled', async () => {
  const ids = await fetchImdbTopRatedIds({
    config: { imdbEnabled: false, imdbLimit: 500, logEnabled: false },
    ratingsPath: '/nonexistent/path.tsv.gz',
  });

  assert.deepEqual(ids, []);
});

test('poster warm IMDb source returns empty when file is missing', async () => {
  const ids = await fetchImdbTopRatedIds({
    config: { imdbEnabled: true, imdbLimit: 500, logEnabled: false },
    ratingsPath: '/nonexistent/path.tsv.gz',
  });

  assert.deepEqual(ids, []);
});