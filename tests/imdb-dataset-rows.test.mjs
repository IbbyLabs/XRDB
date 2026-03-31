import test from 'node:test';
import assert from 'node:assert/strict';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

test('IMDb dataset rows normalize ids and shape rating rows safely', async () => {
  const rowsModule = await importFresh('../lib/imdbDatasetRows.ts');

  assert.equal(rowsModule.normalizeImdbId(' tt1234567 '), 'tt1234567');
  assert.equal(rowsModule.normalizeImdbId('movie'), null);
  assert.deepEqual(rowsModule.toImdbDatasetRating({ averageRating: 7.6, numVotes: 321 }), {
    rating: 7.6,
    votes: 321,
  });
  assert.equal(rowsModule.toImdbDatasetRating({ averageRating: Number.NaN, numVotes: 100 }), null);
});

test('IMDb dataset rows shape episode records and null out invalid numeric fields', async () => {
  const rowsModule = await importFresh('../lib/imdbDatasetRows.ts');

  assert.deepEqual(
    rowsModule.toImdbDatasetEpisode({
      tconst: 'tt2000001',
      parentTconst: 'tt1000001',
      seasonNumber: 1,
      episodeNumber: 2,
    }),
    {
      imdbId: 'tt2000001',
      seriesImdbId: 'tt1000001',
      seasonNumber: 1,
      episodeNumber: 2,
    },
  );
  assert.deepEqual(
    rowsModule.toImdbDatasetEpisode({
      tconst: 'tt2000002',
      parentTconst: 'tt1000001',
      seasonNumber: Number.NaN,
      episodeNumber: Number.NaN,
    }),
    {
      imdbId: 'tt2000002',
      seriesImdbId: 'tt1000001',
      seasonNumber: null,
      episodeNumber: null,
    },
  );
  assert.equal(rowsModule.toImdbDatasetEpisode({ tconst: 'tt2000003' }), null);
});
