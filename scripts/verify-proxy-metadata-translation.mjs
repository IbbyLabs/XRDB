import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const NEXT_PORT = 3217;

const jsonResponse = (res, payload, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const startMockServer = async () => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/upstream/manifest.json') {
      return jsonResponse(res, {
        id: 'org.example.mock',
        version: '1.0.0',
        name: 'Mock Addon',
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        idPrefixes: ['tt', 'tmdb', 'mal'],
      });
    }

    if (url.pathname === '/upstream/meta/movie/movie-fill.json') {
      return jsonResponse(res, {
        meta: {
          id: 'tmdb:movie:501',
          type: 'movie',
          title: 'N/A',
          overview: '   ',
        },
      });
    }

    if (url.pathname === '/upstream/meta/series/show-language.json') {
      return jsonResponse(res, {
        meta: {
          id: 'tt0701',
          type: 'series',
          name: 'Random English Show',
          description: 'Original show description',
          videos: [
            {
              id: 'show-language:1:1',
              season: 1,
              episode: 1,
              title: 'Pilot original',
              description: 'Original ep description',
            },
            {
              id: 'show-language:1:2',
              season: 1,
              episode: 2,
              title: 'N/A',
              description: '',
            },
          ],
        },
      });
    }

    if (url.pathname === '/upstream/meta/series/anime-fallback.json') {
      return jsonResponse(res, {
        meta: {
          id: 'mal:100',
          type: 'series',
          name: '',
          description: '',
        },
      });
    }

    if (url.pathname === '/upstream/catalog/series/mixed.json') {
      return jsonResponse(res, {
        metas: [
          {
            id: 'tmdb:movie:501',
            type: 'movie',
            title: 'N/A',
            overview: '',
          },
          {
            id: 'tt0701',
            type: 'series',
            name: 'Random English Show',
            description: 'Original show description',
          },
          {
            id: 'mal:100',
            type: 'series',
            name: '',
            description: '',
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/movie/501') {
      return jsonResponse(res, {
        title: 'Film Francais',
        overview: 'Resume film FR',
      });
    }

    if (url.pathname === '/tmdb/3/movie/501/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'fr',
            iso_3166_1: 'FR',
            data: {
              title: 'Film Francais',
              overview: 'Resume film FR',
            },
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/find/tt0701') {
      return jsonResponse(res, {
        movie_results: [],
        tv_results: [{ id: 701 }],
      });
    }

    if (url.pathname === '/tmdb/3/tv/701') {
      return jsonResponse(res, {
        name: 'Emission FR',
        overview: 'Resume serie FR',
      });
    }

    if (url.pathname === '/tmdb/3/tv/701/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'fr',
            iso_3166_1: 'FR',
            data: {
              name: 'Emission FR',
              overview: 'Resume serie FR',
            },
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/tv/701/season/1') {
      return jsonResponse(res, {
        episodes: [
          {
            episode_number: 1,
            name: 'Pilote FR',
            overview: 'Resume episode FR',
          },
          {
            episode_number: 2,
            name: 'Episode Deux FR',
            overview: 'Resume episode deux FR',
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/tv/701/season/1/episode/1/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'en',
            iso_3166_1: 'US',
            data: {
              name: 'Pilot',
              overview: 'English overview',
            },
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/tv/701/season/1/episode/2/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'fr',
            iso_3166_1: 'FR',
            data: {
              name: 'Episode Deux FR',
              overview: 'Resume episode deux FR',
            },
          },
        ],
      });
    }

    if (url.pathname === '/anime-mapping/mal/100') {
      return jsonResponse(res, {
        ok: true,
        requested: {
          provider: 'mal',
          externalId: '100',
          resolvedKitsuId: '200',
        },
        kitsu: {
          id: '200',
          subtype: 'TV',
          canonicalTitle: 'Random Anime',
          titles: {
            en: 'Random Anime',
            ja_jp: 'ランダムアニメ',
          },
        },
        mappings: {
          ids: {
            tmdb: '801',
            anilist: '300',
          },
        },
      });
    }

    if (url.pathname === '/tmdb/3/tv/801') {
      return jsonResponse(res, {
        name: '',
        overview: '',
      });
    }

    if (url.pathname === '/tmdb/3/tv/801/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'en',
            iso_3166_1: 'US',
            data: {
              name: 'Random Anime',
              overview: 'English anime overview',
            },
          },
        ],
      });
    }

    if (url.pathname === '/kitsu/anime/200') {
      return jsonResponse(res, {
        data: {
          attributes: {
            canonicalTitle: 'Random Anime',
            titles: {
              en: 'Random Anime',
              ja_jp: 'ランダムアニメ',
            },
            synopsis: 'Kitsu synopsis fallback',
          },
        },
      });
    }

    if (url.pathname === '/anilist') {
      const body = await new Promise((resolve) => {
        let raw = '';
        req.on('data', (chunk) => {
          raw += String(chunk);
        });
        req.on('end', () => resolve(raw));
      });
      const parsed = JSON.parse(String(body || '{}'));
      assert.equal(parsed?.variables?.id, 300);
      return jsonResponse(res, {
        data: {
          Media: {
            title: {
              english: 'Random Anime',
              native: 'ランダムアニメ',
              romaji: 'Random Anime',
              userPreferred: 'Random Anime',
            },
            description: 'AniList fallback description',
          },
        },
      });
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(`Unhandled mock path: ${url.pathname}`);
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
};

const waitForHttp = async (url, attempts = 80) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {}
    await delay(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const terminateProcess = async (child) => {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000),
  ]);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2_000),
    ]);
  }
};

const getJson = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}\n${body}`);
  }
  return JSON.parse(body);
};

const main = async () => {
  const mockServer = await startMockServer();
  const mockAddress = mockServer.address();
  const mockPort = typeof mockAddress === 'object' && mockAddress ? mockAddress.port : 0;
  const upstreamManifestUrl = `http://127.0.0.1:${mockPort}/upstream/manifest.json`;

  const nextProcess = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'dev', '-p', String(NEXT_PORT), '-H', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS: 'true',
        XRDB_ALLOW_PRIVATE_UPSTREAMS_FOR_TESTS: 'true',
        XRDB_TMDB_API_BASE_URL: `http://127.0.0.1:${mockPort}/tmdb/3`,
        XRDB_ANIME_MAPPING_BASE_URL: `http://127.0.0.1:${mockPort}/anime-mapping`,
        XRDB_KITSU_API_BASE_URL: `http://127.0.0.1:${mockPort}/kitsu`,
        XRDB_ANILIST_GRAPHQL_URL: `http://127.0.0.1:${mockPort}/anilist`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let nextLogs = '';
  nextProcess.stdout.on('data', (chunk) => {
    nextLogs += String(chunk);
  });
  nextProcess.stderr.on('data', (chunk) => {
    nextLogs += String(chunk);
  });

  try {
    await waitForHttp(`http://127.0.0.1:${NEXT_PORT}`);

    const buildProxyUrl = (resourcePath, params = {}) => {
      const url = new URL(`http://127.0.0.1:${NEXT_PORT}/proxy/${resourcePath}`);
      url.searchParams.set('url', upstreamManifestUrl);
      url.searchParams.set('tmdbKey', 'fake-tmdb-key');
      url.searchParams.set('mdblistKey', 'fake-mdblist-key');
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
      return url.toString();
    };

    const moviePayload = await getJson(
      buildProxyUrl('meta/movie/movie-fill.json', {
        translateMeta: 'true',
        translateMetaMode: 'fill-missing',
        debugMetaTranslation: 'true',
        lang: 'fr',
      }),
    );
    assert.equal(moviePayload.meta.title, 'Film Francais');
    assert.equal(moviePayload.meta.overview, 'Resume film FR');
    assert.equal(moviePayload.meta._xrdbMetaTranslation.mode, 'fill-missing');
    assert.equal(moviePayload.meta._xrdbMetaTranslation.fields.title.source, 'tmdb');
    assert.equal(moviePayload.meta._xrdbMetaTranslation.fields.overview.reason, 'filled-blank');

    const showPayload = await getJson(
      buildProxyUrl('meta/series/show-language.json', {
        translateMeta: 'true',
        translateMetaMode: 'prefer-requested-language',
        debugMetaTranslation: 'true',
        lang: 'fr-FR',
      }),
    );
    assert.equal(showPayload.meta.name, 'Emission FR');
    assert.equal(showPayload.meta.description, 'Resume serie FR');
    assert.equal(showPayload.meta._xrdbMetaTranslation.fields.title.reason, 'preferred-requested-language');
    assert.equal(showPayload.meta.videos[0].title, 'Pilot original');
    assert.equal(showPayload.meta.videos[0].description, 'Original ep description');
    assert.equal(showPayload.meta.videos[0]._xrdbMetaTranslation.fields.title.source, 'source');
    assert.deepEqual(showPayload.meta.videos[0]._xrdbMetaTranslation.tmdbTarget.requestedLanguage, {
      title: false,
      overview: false,
    });
    assert.equal(showPayload.meta.videos[1].title, 'Episode Deux FR');
    assert.equal(showPayload.meta.videos[1].description, 'Resume episode deux FR');
    assert.equal(showPayload.meta.videos[1]._xrdbMetaTranslation.fields.title.source, 'tmdb');
    assert.equal(
      showPayload.meta.videos[1]._xrdbMetaTranslation.fields.title.reason,
      'preferred-requested-language',
    );

    const animePayload = await getJson(
      buildProxyUrl('meta/series/anime-fallback.json', {
        translateMeta: 'true',
        translateMetaMode: 'fill-missing',
        debugMetaTranslation: 'true',
        lang: 'ja',
      }),
    );
    assert.equal(animePayload.meta.name, 'ランダムアニメ');
    assert.equal(animePayload.meta.description, 'Kitsu synopsis fallback');
    assert.equal(animePayload.meta._xrdbMetaTranslation.fields.title.source, 'kitsu');
    assert.equal(animePayload.meta._xrdbMetaTranslation.fields.title.reason, 'fallback-anime');

    const catalogPayload = await getJson(
      buildProxyUrl('catalog/series/mixed.json', {
        translateMeta: 'true',
        translateMetaMode: 'fill-missing',
        debugMetaTranslation: 'true',
        lang: 'ja',
      }),
    );
    assert.equal(Array.isArray(catalogPayload.metas), true);
    assert.equal(catalogPayload.metas[0].title, 'Film Francais');
    assert.equal(catalogPayload.metas[2].name, 'ランダムアニメ');

    console.log('Verified proxy metadata translation end to end against local mock services.');
  } catch (error) {
    console.error(nextLogs);
    throw error;
  } finally {
    await terminateProcess(nextProcess);
    await new Promise((resolve, reject) => {
      mockServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

await main();
