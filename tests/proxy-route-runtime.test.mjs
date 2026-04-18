import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isTypeEnabled,
  normalizeProxyXrdbId,
  rewriteMetaImages,
} from '../lib/proxyRouteRuntime.ts';

const withTempDataDir = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-proxy-runtime-'));
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

test('proxy route normalization upgrades episodic ids for aiometadata style manifests', () => {
  const normalized = normalizeProxyXrdbId('tt0944947', 'series', {
    url: 'https://aiometadata.example.com/manifest.json',
    tmdbKey: 'tmdb',
    mdblistKey: 'mdblist',
    episodeIdMode: 'xrdbid',
  });

  assert.equal(normalized, 'xrdbid:tt0944947');
});

test('proxy route type toggles default on and respect explicit disables', () => {
  const config = {
    url: 'https://addon.example.com/manifest.json',
    tmdbKey: 'tmdb',
    mdblistKey: 'mdblist',
    posterEnabled: false,
  };

  assert.equal(isTypeEnabled(config, 'poster'), false);
  assert.equal(isTypeEnabled(config, 'backdrop'), true);
  assert.equal(isTypeEnabled(config, 'thumbnail'), true);
});

test('proxy route image rewriting updates artwork and video thumbnails from local config', async () => {
  const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
  const meta = {
    id: 'tt0944947',
    type: 'series',
    poster: 'https://images.example.com/poster.jpg',
    background: 'https://images.example.com/background.jpg',
    logo: 'https://images.example.com/logo.png',
    videos: [
      {
        season: 2,
        episode: 1,
        thumbnail: 'https://images.example.com/episode.jpg',
      },
    ],
  };
  const config = {
    url: 'https://aiometadata.example.com/manifest.json',
    tmdbKey: 'tmdb-key',
    mdblistKey: 'mdblist-key',
    episodeIdMode: 'xrdbid',
    simklClientId: 'simkl-id',
  };

  const rewritten = await rewriteMetaImages(meta, requestUrl, config);

  const posterUrl = new URL(rewritten.poster);
  const backdropUrl = new URL(rewritten.background);
  const logoUrl = new URL(rewritten.logo);
  const thumbnailUrl = new URL(rewritten.videos[0].thumbnail);

  assert.equal(posterUrl.pathname, '/poster/xrdbid%3Att0944947.jpg');
  assert.equal(
    posterUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/poster.jpg',
  );
  assert.equal(backdropUrl.pathname, '/backdrop/xrdbid%3Att0944947.jpg');
  assert.equal(
    backdropUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/background.jpg',
  );
  assert.equal(logoUrl.pathname, '/logo/xrdbid%3Att0944947.jpg');
  assert.equal(
    logoUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/logo.png',
  );
  assert.equal(thumbnailUrl.pathname, '/thumbnail/xrdbid%3Att0944947/S02E01.jpg');
  assert.equal(
    thumbnailUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/episode.jpg',
  );
});

test('proxy route media type selection skips series items when only movies are enabled', async () => {
  const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
  const meta = {
    id: 'tt0944947',
    type: 'series',
    poster: 'https://images.example.com/poster.jpg',
  };
  const config = {
    url: 'https://addon.example.com/manifest.json',
    tmdbKey: 'tmdb-key',
    mdblistKey: 'mdblist-key',
    proxyTypes: 'movie',
  };

  const rewritten = await rewriteMetaImages(meta, requestUrl, config);
  assert.equal(rewritten.poster, 'https://images.example.com/poster.jpg');
});

test('proxy route media type selection treats anime native IDs as anime', async () => {
  const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
  const meta = {
    id: 'mal:5114',
    type: 'series',
    poster: 'https://images.example.com/poster.jpg',
  };
  const config = {
    url: 'https://addon.example.com/manifest.json',
    tmdbKey: 'tmdb-key',
    mdblistKey: 'mdblist-key',
    proxyTypes: 'anime',
  };

  const rewritten = await rewriteMetaImages(meta, requestUrl, config);
  const posterUrl = new URL(rewritten.poster);

  assert.equal(posterUrl.pathname, '/poster/mal%3A5114.jpg');
  assert.equal(
    posterUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/poster.jpg',
  );
});

test('proxy route thumbnail rewriting emits anime-native episode hints without overloading season tokens', async () => {
  const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
  const meta = {
    id: 'kitsu:42765',
    type: 'series',
    videos: [
      {
        season: 42,
        episode: 7,
        thumbnail: 'https://images.example.com/episode.jpg',
      },
    ],
  };
  const config = {
    url: 'https://aiometadata.example.com/manifest.json',
    tmdbKey: 'tmdb-key',
    mdblistKey: 'mdblist-key',
    episodeIdMode: 'kitsu',
  };

  const rewritten = await rewriteMetaImages(meta, requestUrl, config);
  const thumbnailUrl = new URL(rewritten.videos[0].thumbnail);

  assert.equal(thumbnailUrl.pathname, '/thumbnail/kitsu%3A42765/S01E07.jpg');
  assert.equal(thumbnailUrl.searchParams.get('episodeSourceProvider'), 'kitsu');
  assert.equal(thumbnailUrl.searchParams.get('episodeSourceId'), '42765');
  assert.equal(thumbnailUrl.searchParams.get('episodeSourceSeason'), '42');
  assert.equal(thumbnailUrl.searchParams.get('episodeSourceEpisode'), '7');
  assert.equal(thumbnailUrl.searchParams.get('episodeAbsolute'), '7');
});

test('proxy route thumbnail rewriting resolves configured anime authority from canonical series mapping', async (t) => {
  await withTempDataDir(t, async () => {
    const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
    const meta = {
      id: 'tt12343534',
      type: 'series',
      videos: [
        {
          season: 42,
          episode: 7,
          thumbnail: 'https://images.example.com/episode.jpg',
        },
      ],
    };
    const config = {
      url: 'https://aiometadata.example.com/manifest.json',
      tmdbKey: 'tmdb-key',
      mdblistKey: 'mdblist-key',
      episodeIdMode: 'kitsu',
    };
    const originalFetch = global.fetch;

    global.fetch = async (input) => {
      const url = String(input);
      if (url === 'https://animemapping.stremio.dpdns.org/imdb/tt12343534') {
        return new Response(
          JSON.stringify({
            mappings: {
              ids: {
                kitsu: '42765',
                imdb: 'tt12343534',
              },
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url === 'https://animemapping.stremio.dpdns.org/kitsu/42765?ep=7&s=42') {
        return new Response(
          JSON.stringify({
            mappings: {
              ids: {
                kitsu: '42765',
                imdb: 'tt12343534',
              },
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    t.after(() => {
      global.fetch = originalFetch;
    });

    const rewritten = await rewriteMetaImages(meta, requestUrl, config);
    const thumbnailUrl = new URL(rewritten.videos[0].thumbnail);

    assert.equal(thumbnailUrl.pathname, '/thumbnail/xrdbid%3Att12343534/S01E07.jpg');
    assert.equal(thumbnailUrl.searchParams.get('episodeSourceProvider'), 'kitsu');
    assert.equal(thumbnailUrl.searchParams.get('episodeSourceId'), '42765');
    assert.equal(thumbnailUrl.searchParams.get('episodeSourceSeason'), '42');
    assert.equal(thumbnailUrl.searchParams.get('episodeSourceEpisode'), '7');
    assert.equal(thumbnailUrl.searchParams.get('episodeAbsolute'), '7');
  });
});

test('proxy route thumbnail rewriting de-duplicates concurrent canonical mapping fetches for duplicate videos', async (t) => {
  await withTempDataDir(t, async () => {
    const requestUrl = new URL('https://proxy.example.com/proxy/config/meta/series/id.json');
    const meta = {
      id: 'tt76543210',
      type: 'series',
      videos: [
        {
          season: 42,
          episode: 7,
          thumbnail: 'https://images.example.com/episode-a.jpg',
        },
        {
          season: 42,
          episode: 7,
          thumbnail: 'https://images.example.com/episode-b.jpg',
        },
      ],
    };
    const config = {
      url: 'https://aiometadata.example.com/manifest.json',
      tmdbKey: 'tmdb-key',
      mdblistKey: 'mdblist-key',
      episodeIdMode: 'kitsu',
    };
    const originalFetch = global.fetch;
    let imdbFetchCount = 0;
    let kitsuFetchCount = 0;

    global.fetch = async (input) => {
      const url = String(input);
      if (url === 'https://animemapping.stremio.dpdns.org/imdb/tt76543210') {
        imdbFetchCount += 1;
        return new Response(
          JSON.stringify({
            mappings: {
              ids: {
                kitsu: '999001',
                imdb: 'tt76543210',
              },
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url === 'https://animemapping.stremio.dpdns.org/kitsu/999001?ep=7&s=42') {
        kitsuFetchCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(
          JSON.stringify({
            mappings: {
              ids: {
                kitsu: '999001',
                imdb: 'tt76543210',
              },
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    t.after(() => {
      global.fetch = originalFetch;
    });

    const rewritten = await rewriteMetaImages(meta, requestUrl, config);

    assert.equal(imdbFetchCount, 1);
    assert.equal(kitsuFetchCount, 1);
    assert.equal(rewritten.videos.length, 2);
    assert.equal(
      new URL(rewritten.videos[0].thumbnail).searchParams.get('episodeSourceId'),
      '999001',
    );
    assert.equal(
      new URL(rewritten.videos[1].thumbnail).searchParams.get('episodeSourceId'),
      '999001',
    );
  });
});
