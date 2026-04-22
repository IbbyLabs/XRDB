import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTorrentioFilenames,
  fetchTorrentioBadges,
  getCachedTorrentioBadges,
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

test('image route torrentio keeps title and name when filename is generic', () => {
  const filenames = extractTorrentioFilenames({
    streams: [
      {
        behaviorHints: { filename: 'Movie.mkv' },
        title: 'Movie.2024.2160p.DV.HDR.REMUX.mkv',
        name: 'Torrentio\\n4k DV | HDR',
      },
    ],
  });

  assert.deepEqual(filenames, [
    'Movie.mkv',
    'Movie.2024.2160p.DV.HDR.REMUX.mkv',
    'Torrentio\\n4k DV | HDR',
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

test('image route torrentio skips fetches when torrentio is disabled', async () => {
  let fetchCalls = 0;
  const result = await fetchTorrentioBadges({
    type: 'movie',
    id: createUniqueId('disabled'),
    phases: createPhases(),
    baseUrl: null,
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('should not fetch when disabled');
    },
  });

  assert.equal(fetchCalls, 0);
  assert.deepEqual(result.badges, []);
  assert.ok(result.cacheTtlMs >= 60_000);
});

test('image route torrentio falls back to the configured secondary host on retryable failure', async () => {
  const id = createUniqueId('fallback');
  const requestedUrls = [];
  const result = await fetchTorrentioBadges({
    type: 'movie',
    id,
    phases: createPhases(),
    baseUrl: 'https://torrentio.primary.example',
    fallbackBaseUrl: 'https://torrentio.stremio.ru',
    fetchImpl: async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith('https://torrentio.primary.example')) {
        return new Response(JSON.stringify({ streams: [] }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ streams: [{ filename: 'Movie.2024.2160p.WEB-DL.mkv' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.deepEqual(requestedUrls, [
    `https://torrentio.primary.example/stream/movie/${encodeURIComponent(id)}.json`,
    `https://torrentio.stremio.ru/stream/movie/${encodeURIComponent(id)}.json`,
  ]);
  assert.equal(result.selectedBaseUrl, 'https://torrentio.stremio.ru');
  assert.deepEqual(result.badges.map((badge) => badge.key), ['4k']);
});

test('image route torrentio exposes cached badges for non-blocking poster renders', async () => {
  const id = createUniqueId('peek');
  await fetchTorrentioBadges({
    type: 'movie',
    id,
    phases: createPhases(),
    fetchImpl: async () =>
      new Response(JSON.stringify({ streams: [{ filename: 'Movie.2024.2160p.WEB-DL.mkv' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  const cached = getCachedTorrentioBadges({ type: 'movie', id });

  assert.ok(cached);
  assert.deepEqual(cached.badges.map((badge) => badge.key), ['4k']);
});
