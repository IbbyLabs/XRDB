import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTorrentioFilenames,
  fetchTorrentioBadges,
} from '../lib/imageRouteTorrentio.ts';

const createPhases = () => ({
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
});

let testKeyCounter = 0;
const createUniqueId = (label) =>
  `tt${Date.now()}${process.pid}${++testKeyCounter}${label.length}`;

test('image route torrentio extracts filenames from common stream shapes', () => {
  const filenames = extractTorrentioFilenames({
    streams: [
      { filename: 'Movie.2024.2160p.BluRay.mkv' },
      { behaviorHints: { filename: 'Movie.2024.Atmos.mkv' } },
      { title: 'Movie.2024.DV.mkv' },
      { name: 'Movie.2024.REMUX.mkv' },
    ],
  });

  assert.deepEqual(filenames, [
    'Movie.2024.2160p.BluRay.mkv',
    'Movie.2024.Atmos.mkv',
    'Movie.2024.DV.mkv',
    'Movie.2024.REMUX.mkv',
  ]);
});

test('image route torrentio derives quality badges from stream filenames', async () => {
  const result = await fetchTorrentioBadges({
    type: 'movie',
    id: createUniqueId('quality'),
    phases: createPhases(),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          streams: [
            { filename: 'Movie.2024.2160p.BluRay.DoVi.Atmos.BDREMUX.mkv' },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
  });

  assert.deepEqual(
    result.badges.map((badge) => badge.key),
    ['4k', 'bdremux', 'dolbyvision', 'dolbyatmos'],
  );
  assert.ok(result.cacheTtlMs >= 60_000);
});

test('image route torrentio reuses cached badge results', async () => {
  const id = createUniqueId('cache');
  let fetchCalls = 0;
  const first = await fetchTorrentioBadges({
    type: 'series',
    id,
    phases: createPhases(),
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({
        streams: [
          { filename: 'Show.2024.2160p.WEB-DL.DV.mkv' },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
  });
  const second = await fetchTorrentioBadges({
    type: 'series',
    id,
    phases: createPhases(),
    fetchImpl: async () => {
      throw new Error('cache miss');
    },
  });

  assert.equal(fetchCalls, 1);
  assert.deepEqual(second.badges, first.badges);
});
