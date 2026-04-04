import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import sharp from 'sharp';

import {
  DOC_STATIC_ASSET_PATHS,
} from './doc-static-asset-manifest.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const RENDER_ORIGIN_OVERRIDE = process.env.DOC_SCREENSHOT_ORIGIN || '';
const RENDER_NEXT_PORT = Number.parseInt(process.env.DOC_RENDER_PORT || '3216', 10);
const FIXTURE_NEXT_PORT = Number.parseInt(process.env.DOC_METADATA_FIXTURE_PORT || '3217', 10);
const CAPTURE_NEXT_PORT = Number.parseInt(process.env.DOC_CAPTURE_PORT || '3218', 10);
const PLAYWRIGHT_WAIT_TIMEOUT_MS = Number.parseInt(process.env.DOC_CAPTURE_WAIT_MS || '1800', 10);
const PLAYWRIGHT_COMMAND_TIMEOUT_MS = Number.parseInt(process.env.DOC_CAPTURE_COMMAND_TIMEOUT_MS || '300000', 10);
const DOC_USE_TURBOPACK = process.env.DOC_USE_TURBOPACK !== 'false';
const CAPTURE_DATE = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const tmdbKey = process.env.XRDB_README_PREVIEW_TMDB_KEY || process.env.TMDB_KEY || '';
const mdblistKey = process.env.XRDB_README_PREVIEW_MDBLIST_KEY || process.env.MDBLIST_KEY || '';

const ensureDir = async (targetPath) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};

const resolveDocAssetPath = (assetPath) => path.join(ROOT_DIR, assetPath);

const logRefreshStep = (message) => {
  console.log(`[docs:refresh-assets] ${message}`);
};

const readPreviewEnvKeys = () => {
  if (!tmdbKey) {
    throw new Error('Missing TMDB key. Set TMDB_KEY or XRDB_README_PREVIEW_TMDB_KEY in your shell, .env, or .env.local before running.');
  }

  return { tmdbKey, mdblistKey };
};

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const wrapLine = (line, maxChars) => {
  if (!line) return [''];
  if (line.length <= maxChars) return [line];

  const indentMatch = line.match(/^\s*/);
  const indent = indentMatch?.[0] || '';
  const available = Math.max(12, maxChars - indent.length);
  const output = [];
  let remaining = line.trimStart();

  while (remaining.length > available) {
    let slice = remaining.slice(0, available + 1);
    let splitAt = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf(','), slice.lastIndexOf('}'));
    if (splitAt < Math.floor(available * 0.6)) {
      splitAt = available;
    }
    output.push(`${indent}${remaining.slice(0, splitAt).trimEnd()}`);
    remaining = remaining.slice(splitAt).trimStart();
  }

  output.push(`${indent}${remaining}`);
  return output;
};

const wrapText = (text, maxChars) =>
  String(text)
    .split('\n')
    .flatMap((line) => wrapLine(line, maxChars));

const createRoundedImage = async ({
  input,
  width,
  height,
  radius,
  fit = 'cover',
  background = '#1b1330',
}) => {
  const resized = await sharp(input)
    .resize(width, height, { fit, background, withoutEnlargement: false })
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );

  return sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
};

const createMonospacePng = async ({
  text,
  outputPath,
  width = 1440,
  height = 1400,
  padding = 24,
  fontSize = 14,
  lineHeight = 19,
}) => {
  const lines = wrapText(text, 122);
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${padding}" y="${padding + 24 + index * lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text xml:space="preserve" font-family="Menlo, SFMono-Regular, Consolas, monospace" font-size="${fontSize}" fill="#111827">
        ${tspans}
      </text>
    </svg>
  `;

  await ensureDir(outputPath);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
};

const RETRYABLE_DOC_FETCH_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_DOC_FETCH_BODY_PATTERNS = [
  /Unexpected end of JSON input/i,
  /__NEXT_DATA__/i,
  /Loading initial props cancelled/i,
];

const buildRetriableFetchError = ({ url, status = 0, body = '', error = null }) => {
  const nextError = new Error(
    error ? `${url} -> ${String(error)}` : `${url} -> ${status}\n${body}`,
  );
  nextError.retryable = Boolean(error)
    || RETRYABLE_DOC_FETCH_STATUS_CODES.has(status)
    || RETRYABLE_DOC_FETCH_BODY_PATTERNS.some((pattern) => pattern.test(body));
  return nextError;
};

const fetchWithRetries = async (url, readResponse, { attempts = 6 } = {}) => {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      let response;

      try {
        response = await fetch(url, { cache: 'no-store' });
      } catch (error) {
        throw buildRetriableFetchError({ url, error });
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw buildRetriableFetchError({
          url,
          status: response.status,
          body,
        });
      }

      try {
        return await readResponse(response);
      } catch (error) {
        const body = typeof error?.body === 'string' ? error.body : '';
        throw buildRetriableFetchError({ url, body, error });
      }
    } catch (error) {
      lastError = error;

      if (!error?.retryable || attempt === attempts) {
        throw error;
      }

      await delay(300 * attempt);
    }
  }

  throw lastError;
};

const fetchBuffer = async (url) =>
  fetchWithRetries(url, async (response) => Buffer.from(await response.arrayBuffer()));

const buildRenderUrl = ({ origin, type, id, params }) => {
  const previewKeys = readPreviewEnvKeys();
  const url = new URL(`/${type}/${encodeURIComponent(id)}.jpg`, origin);
  url.searchParams.set('tmdbKey', previewKeys.tmdbKey);
  if (previewKeys.mdblistKey) {
    url.searchParams.set('mdblistKey', previewKeys.mdblistKey);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('cb', 'doc-refresh-20260323');
  return url.toString();
};

const createBoard = async ({
  outputPath,
  width,
  height,
  title,
  subtitle,
  stamp,
  cards,
  imageHeight,
  imageFit = 'cover',
}) => {
  const pagePadding = 140;
  const cardGap = 40;
  const headerHeight = 182;
  const headerY = 80;
  const cardsY = 300;
  const cardWidth = Math.floor((width - pagePadding * 2 - cardGap * 2) / 3);
  const cardPadding = 28;
  const cardHeight = imageHeight + 172;

  const backgroundSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="page-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2d1450"/>
          <stop offset="52%" stop-color="#160d28"/>
          <stop offset="100%" stop-color="#101a45"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#page-bg)"/>
      <rect x="${pagePadding}" y="${headerY}" width="${width - pagePadding * 2}" height="${headerHeight}" rx="36" fill="#19122a" stroke="#3c2a63"/>
      ${cards
        .map((_, index) => {
          const x = pagePadding + index * (cardWidth + cardGap);
          return `
            <rect x="${x}" y="${cardsY}" width="${cardWidth}" height="${cardHeight}" rx="32" fill="#2a1f49" stroke="#4c377a"/>
            <rect x="${x + cardPadding}" y="${cardsY + cardPadding}" width="${cardWidth - cardPadding * 2}" height="${imageHeight}" rx="24" fill="#140d23"/>
          `;
        })
        .join('')}
    </svg>
  `;

  const composites = [{ input: Buffer.from(backgroundSvg), top: 0, left: 0 }];
  for (const [index, card] of cards.entries()) {
    const x = pagePadding + index * (cardWidth + cardGap);
    const imageBuffer = await createRoundedImage({
      input: card.image,
      width: cardWidth - cardPadding * 2,
      height: imageHeight,
      radius: 24,
      fit: imageFit,
    });

    composites.push({
      input: imageBuffer,
      top: cardsY + cardPadding,
      left: x + cardPadding,
    });
  }

  const textSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${pagePadding + 34}" y="${headerY + 66}" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700" fill="#f8f7ff">${escapeXml(title)}</text>
      <text x="${pagePadding + 34}" y="${headerY + 108}" font-family="Helvetica, Arial, sans-serif" font-size="21" font-weight="600" fill="#bdb6d3">${escapeXml(subtitle)}</text>
      <text x="${pagePadding + 34}" y="${headerY + 146}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#938ca7">${escapeXml(stamp)}</text>
      ${cards
        .map((card, index) => {
          const x = pagePadding + index * (cardWidth + cardGap) + 24;
          const titleY = cardsY + cardPadding + imageHeight + 54;
          const captionLines = wrapText(card.caption, 43);
          const caption = captionLines
            .map(
              (line, lineIndex) =>
                `<tspan x="${x}" y="${titleY + 34 + lineIndex * 23}">${escapeXml(line)}</tspan>`,
            )
            .join('');
          return `
            <text x="${x}" y="${titleY}" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="#f8f7ff">${escapeXml(card.title)}</text>
            <text font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#c3bdd6">${caption}</text>
          `;
        })
        .join('')}
    </svg>
  `;

  await ensureDir(outputPath);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#120b24',
    },
  })
    .composite([...composites, { input: Buffer.from(textSvg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
};

const waitForHttp = async (url, attempts = 90) => {
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

const runCommand = async ({
  command,
  args,
  cwd = ROOT_DIR,
  env = {},
  timeoutMs = 0,
  label = `${command} ${args.join(' ')}`,
}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let settled = false;
    let timeoutId = null;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      callback(value);
    };
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (child.exitCode !== null) {
          return;
        }
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL');
          }
        }, 5_000);
        finish(reject, new Error(`${label} timed out after ${timeoutMs}ms\n\n${output}`));
      }, timeoutMs);
    }
    child.on('error', (error) => {
      finish(reject, error);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        finish(resolve, output);
        return;
      }
      finish(reject, new Error(`${label} exited with code ${String(code)}\n\n${output}`));
    });
  });

const startNextDevServer = async ({
  port,
  env = {},
}) => {
  logRefreshStep(`Starting local Next dev server on port ${port}${DOC_USE_TURBOPACK ? ' with Turbopack' : ''}`);
  const nextProcess = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['next', 'dev', ...(DOC_USE_TURBOPACK ? ['--turbo'] : []), '-p', String(port), '-H', '127.0.0.1'],
    {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...env,
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

  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(origin);
  } catch (error) {
    await terminateProcess(nextProcess);
    throw new Error(`${String(error)}\n\n${nextLogs}`);
  }

  logRefreshStep(`Next dev server ready on ${origin}`);
  return {
    origin,
    nextProcess,
    getLogs: () => nextLogs,
  };
};

const terminateProcess = async (child) => {
  if (!child || child.exitCode !== null || child.killed) return;

  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(5_000)]);
  if (child.exitCode !== null) return;

  child.kill('SIGKILL');
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(2_000)]);
};

const captureScreenshot = async ({
  url,
  outputPath,
  width,
  height,
  waitForSelector = '.xrdb-page',
  waitTimeoutMs = PLAYWRIGHT_WAIT_TIMEOUT_MS,
}) => {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const captureName = path.basename(outputPath);
  const captureCommandTimeoutMs = Math.max(waitTimeoutMs + 30_000, PLAYWRIGHT_COMMAND_TIMEOUT_MS);
  await ensureDir(outputPath);
  logRefreshStep(`Capturing ${captureName}`);
  await runCommand({
    command: npxCommand,
    args: [
      '--yes',
      'playwright',
      'screenshot',
      `--viewport-size=${width},${height}`,
      `--wait-for-timeout=${waitTimeoutMs}`,
      `--wait-for-selector=${waitForSelector}`,
      url,
      outputPath,
    ],
    timeoutMs: captureCommandTimeoutMs,
    label: `Playwright capture for ${captureName}`,
  });
  logRefreshStep(`Saved ${captureName}`);
};

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

    if (url.pathname === '/upstream/meta/movie/fill-missing-movie.json') {
      return jsonResponse(res, {
        meta: {
          id: 'tt0133093',
          type: 'movie',
          title: 'N/A',
          overview: '',
        },
      });
    }

    if (url.pathname === '/upstream/meta/series/prefer-language-show.json') {
      return jsonResponse(res, {
        meta: {
          id: 'tt0944947',
          type: 'series',
          name: 'Game of Thrones',
          description: 'Original show description from upstream.',
          videos: [
            {
              id: 'got:1:1',
              season: 1,
              episode: 1,
              title: 'Winter Is Coming',
              description: 'Original pilot description from upstream.',
            },
            {
              id: 'got:1:2',
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
          id: 'mal:16498',
          type: 'series',
          name: '',
          description: '',
        },
      });
    }

    if (url.pathname === '/tmdb/3/find/tt0133093') {
      return jsonResponse(res, {
        movie_results: [{ id: 603 }],
        tv_results: [],
      });
    }

    if (url.pathname === '/tmdb/3/movie/603') {
      const requestedLanguage = String(url.searchParams.get('language') || '').toLowerCase();
      if (requestedLanguage.startsWith('fr')) {
        return jsonResponse(res, {
          title: 'Matrix',
          overview:
            "Programmeur anonyme dans un service administratif le jour, Thomas Anderson devient Neo la nuit venue.",
        });
      }
      return jsonResponse(res, {
        title: 'The Matrix',
        overview: 'English overview placeholder',
      });
    }

    if (url.pathname === '/tmdb/3/movie/603/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'fr',
            iso_3166_1: 'FR',
            data: {
              title: 'Matrix',
              overview:
                "Programmeur anonyme dans un service administratif le jour, Thomas Anderson devient Neo la nuit venue.",
            },
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/find/tt0944947') {
      return jsonResponse(res, {
        movie_results: [],
        tv_results: [{ id: 1399 }],
      });
    }

    if (url.pathname === '/tmdb/3/tv/1399') {
      const requestedLanguage = String(url.searchParams.get('language') || '').toLowerCase();
      if (requestedLanguage.startsWith('fr')) {
        return jsonResponse(res, {
          name: 'Le Trone de Fer',
          overview: 'Resume serie FR',
        });
      }
      return jsonResponse(res, {
        name: 'Game of Thrones FR',
        overview: 'English show overview placeholder',
      });
    }

    if (url.pathname === '/tmdb/3/tv/1399/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'fr',
            iso_3166_1: 'FR',
            data: {
              name: 'Le Trone de Fer',
              overview: 'Resume serie FR',
            },
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/tv/1399/season/1') {
      return jsonResponse(res, {
        episodes: [
          {
            episode_number: 1,
            name: 'L hiver vient',
            overview: 'Resume episode FR',
          },
          {
            episode_number: 2,
            name: 'La route royale',
            overview: 'Resume episode deux FR',
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/tv/1399/season/1/episode/1/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'en',
            iso_3166_1: 'US',
            data: {
              name: 'Winter Is Coming',
              overview: 'English overview',
            },
          },
        ],
      });
    }

    if (url.pathname === '/tmdb/3/tv/1399/season/1/episode/2/translations') {
      return jsonResponse(res, {
        translations: [
          {
            iso_639_1: 'fr',
            iso_3166_1: 'FR',
            data: {
              name: 'La route royale',
              overview: 'Resume episode deux FR',
            },
          },
        ],
      });
    }

    if (url.pathname === '/anime-mapping/mal/16498') {
      return jsonResponse(res, {
        ok: true,
        requested: {
          provider: 'mal',
          externalId: '16498',
          resolvedKitsuId: '200',
        },
        kitsu: {
          id: '200',
          subtype: 'TV',
          canonicalTitle: null,
          titles: {
            ja_jp: '進撃の巨人',
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
              name: 'Attack on Titan',
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
            canonicalTitle: null,
            titles: {
              ja_jp: '進撃の巨人',
            },
            synopsis: 'Kitsu synopsis fallback',
          },
        },
      });
    }

    if (url.pathname === '/anilist') {
      return jsonResponse(res, {
        data: {
          Media: {
            title: {
              english: null,
              native: '進撃の巨人',
              romaji: null,
              userPreferred: null,
            },
            description: null,
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

const getJson = async (url) =>
  fetchWithRetries(url, async (response) => {
    const body = await response.text();
    try {
      return JSON.parse(body);
    } catch (error) {
      error.body = body;
      throw error;
    }
  });

const buildPrettyJson = (payload) => `${JSON.stringify(payload, null, 2)}\n`;

const buildMovieMetadataExcerpt = (payload) => ({
  meta: {
    id: payload?.meta?.id,
    type: payload?.meta?.type,
    title: payload?.meta?.title,
    overview: payload?.meta?.overview,
    _xrdbMetaTranslation: {
      requestedLanguage: payload?.meta?._xrdbMetaTranslation?.requestedLanguage ?? null,
      mode: payload?.meta?._xrdbMetaTranslation?.mode ?? null,
      fields: payload?.meta?._xrdbMetaTranslation?.fields ?? null,
    },
  },
});

const buildShowMetadataExcerpt = (payload) => {
  const videos = Array.isArray(payload?.meta?.videos) ? payload.meta.videos : [];
  const preservedEpisode = videos[0] || null;
  const filledEpisode = videos[1] || null;

  return {
    meta: {
      id: payload?.meta?.id,
      type: payload?.meta?.type,
      name: payload?.meta?.name,
      description: payload?.meta?.description,
      _xrdbMetaTranslation: {
        requestedLanguage: payload?.meta?._xrdbMetaTranslation?.requestedLanguage ?? null,
        mode: payload?.meta?._xrdbMetaTranslation?.mode ?? null,
        fields: payload?.meta?._xrdbMetaTranslation?.fields ?? null,
      },
    },
    episodePreserved: preservedEpisode
      ? {
          season: preservedEpisode.season,
          episode: preservedEpisode.episode,
          title: preservedEpisode.title,
          description: preservedEpisode.description,
          _xrdbMetaTranslation: {
            requestedLanguage: preservedEpisode?._xrdbMetaTranslation?.requestedLanguage ?? null,
            fields: preservedEpisode?._xrdbMetaTranslation?.fields ?? null,
          },
        }
      : null,
    episodeFilled: filledEpisode
      ? {
          season: filledEpisode.season,
          episode: filledEpisode.episode,
          title: filledEpisode.title,
          description: filledEpisode.description,
          _xrdbMetaTranslation: {
            requestedLanguage: filledEpisode?._xrdbMetaTranslation?.requestedLanguage ?? null,
            fields: filledEpisode?._xrdbMetaTranslation?.fields ?? null,
          },
        }
      : null,
  };
};

const buildAnimeMetadataExcerpt = (payload) => ({
  meta: {
    id: payload?.meta?.id,
    type: payload?.meta?.type,
    name: payload?.meta?.name,
    description: payload?.meta?.description,
    _xrdbMetaTranslation: {
      requestedLanguage: payload?.meta?._xrdbMetaTranslation?.requestedLanguage ?? null,
      mode: payload?.meta?._xrdbMetaTranslation?.mode ?? null,
      animeFallback: payload?.meta?._xrdbMetaTranslation?.animeFallback ?? null,
      fields: payload?.meta?._xrdbMetaTranslation?.fields ?? null,
    },
  },
});

const sanitizePayload = (payload) => {
  const stripNoise = (value) => {
    if (Array.isArray(value)) {
      return value.map(stripNoise);
    }

    if (!value || typeof value !== 'object') {
      if (typeof value === 'string' && value.includes('api_key=')) {
        return value.replace(/api_key=[^&"]+/g, 'api_key=redacted');
      }
      if (typeof value === 'string' && value.includes('tmdbKey=')) {
        return value
          .replace(/tmdbKey=[^&"]+/g, 'tmdbKey=redacted')
          .replace(/mdblistKey=[^&"]+/g, 'mdblistKey=redacted');
      }
      return value;
    }

    const next = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      if (key === 'poster' || key === 'background' || key === 'logo') {
        continue;
      }
      next[key] = stripNoise(nestedValue);
    }
    return next;
  };

  return stripNoise(payload);
};

const generateMetadataExamples = async () => {
  logRefreshStep('Generating metadata translation examples');
  const mockServer = await startMockServer();
  const mockAddress = mockServer.address();
  const mockPort = typeof mockAddress === 'object' && mockAddress ? mockAddress.port : 0;
  const upstreamManifestUrl = `http://127.0.0.1:${mockPort}/upstream/manifest.json`;
  const nextServer = await startNextDevServer({
    port: FIXTURE_NEXT_PORT,
    env: {
      XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS: 'true',
      XRDB_TMDB_API_BASE_URL: `http://127.0.0.1:${mockPort}/tmdb/3`,
      XRDB_ANIME_MAPPING_BASE_URL: `http://127.0.0.1:${mockPort}/anime-mapping`,
      XRDB_KITSU_API_BASE_URL: `http://127.0.0.1:${mockPort}/kitsu`,
      XRDB_ANILIST_GRAPHQL_URL: `http://127.0.0.1:${mockPort}/anilist`,
    },
  });

  try {
    const buildProxyUrl = (resourcePath, params = {}) => {
      const url = new URL(`/proxy/${resourcePath}`, nextServer.origin);
      url.searchParams.set('url', upstreamManifestUrl);
      url.searchParams.set('tmdbKey', 'fixture-tmdb-key');
      url.searchParams.set('mdblistKey', 'fixture-mdblist-key');
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
      return url.toString();
    };

    const moviePayload = sanitizePayload(
      await getJson(
        buildProxyUrl('meta/movie/fill-missing-movie.json', {
          translateMeta: 'true',
          translateMetaMode: 'fill-missing',
          debugMetaTranslation: 'true',
          lang: 'fr-FR',
        }),
      ),
    );

    const showPayload = sanitizePayload(
      await getJson(
        buildProxyUrl('meta/series/prefer-language-show.json', {
          translateMeta: 'true',
          translateMetaMode: 'prefer-requested-language',
          debugMetaTranslation: 'true',
          lang: 'fr-BE',
        }),
      ),
    );

    const animePayload = sanitizePayload(
      await getJson(
        buildProxyUrl('meta/series/anime-fallback.json', {
          translateMeta: 'true',
          translateMetaMode: 'prefer-requested-language',
          debugMetaTranslation: 'true',
          lang: 'en-GB',
        }),
      ),
    );

    await createMonospacePng({
      text: buildPrettyJson(buildMovieMetadataExcerpt(moviePayload)),
      outputPath: resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.proxyTranslationFillMissingMovieFr),
    });

    await createMonospacePng({
      text: buildPrettyJson(buildShowMetadataExcerpt(showPayload)),
      outputPath: resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.proxyTranslationPreferLanguageShowFrBe),
    });

    await createMonospacePng({
      text: buildPrettyJson(buildAnimeMetadataExcerpt(animePayload)),
      outputPath: resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.proxyTranslationAnimeFallbackEnGb),
    });
    logRefreshStep('Finished metadata translation examples');
  } catch (error) {
    throw new Error(`${String(error)}\n\n${nextServer.getLogs()}`);
  } finally {
    await terminateProcess(nextServer.nextProcess);
    await new Promise((resolve, reject) => {
      mockServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

const buildWorkspaceCaptureUrl = (origin, { path: routePath = '/', requirePreview = false } = {}) => {
  const previewKeys = readPreviewEnvKeys();
  const url = new URL(routePath, origin);
  url.searchParams.set('docsCapture', '1');
  url.searchParams.set('captureExperience', 'advanced');
  url.searchParams.set('captureWorkspaceCenterView', 'showcase');
  if (requirePreview) {
    url.searchParams.set('captureRequirePreview', 'true');
  }
  url.searchParams.set('captureTmdbKey', previewKeys.tmdbKey);
  if (previewKeys.mdblistKey) {
    url.searchParams.set('captureMdblistKey', previewKeys.mdblistKey);
  }
  url.searchParams.set(
    'captureProxyManifestUrl',
    new URL('/docs-capture/mock-addon-manifest.json', origin).toString(),
  );
  url.searchParams.set('captureProxyTranslateMeta', 'true');
  url.searchParams.set('captureProxyDebugMetaTranslation', 'true');
  url.searchParams.set(
    'capturePanels',
    ['configurator', 'center-view', 'addon-proxy', 'quick-actions'].join(','),
  );
  return url.toString();
};

const generateWorkspaceCaptures = async (origin) => {
  const captureDir = path.join(ROOT_DIR, 'output', 'playwright');
  const previewViewportPath = path.join(captureDir, 'preview-viewport.png');
  const proxyViewportPath = path.join(captureDir, 'proxy-viewport.png');
  const proxyNarrowViewportPath = path.join(captureDir, 'proxy-narrow-viewport.png');

  await captureScreenshot({
    url: buildWorkspaceCaptureUrl(origin, {
      path: '/',
      requirePreview: true,
    }),
    outputPath: previewViewportPath,
    width: 1440,
    height: 1200,
    waitForSelector: '.xrdb-page[data-docs-capture-ready="true"]',
  });

  await captureScreenshot({
    url: buildWorkspaceCaptureUrl(origin, { path: '/addon' }),
    outputPath: proxyViewportPath,
    width: 1440,
    height: 1200,
    waitForSelector: '.xrdb-page[data-docs-capture-ready="true"]',
  });

  await captureScreenshot({
    url: buildWorkspaceCaptureUrl(origin, { path: '/addon' }),
    outputPath: proxyNarrowViewportPath,
    width: 900,
    height: 1200,
    waitForSelector: '.xrdb-page[data-docs-capture-ready="true"]',
  });

  await sharp(previewViewportPath)
    .extract({ left: 0, top: 80, width: 1440, height: 1120 })
    .resize(840, 720, { fit: 'cover', position: 'top' })
    .png()
    .toFile(resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.configuratorLiveDemo));

  await sharp(proxyViewportPath)
    .resize(520, 720, { fit: 'cover', position: 'left top' })
    .png()
    .toFile(resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.addonProxyLiveDemo));

  await sharp(proxyNarrowViewportPath)
    .extract({ left: 28, top: 700, width: 430, height: 488 })
    .resize(244, 277, { fit: 'cover', position: 'left top' })
    .png()
    .toFile(resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.proxyTranslationSettingsPanel));
};

const generateComparisonBoards = async ({
  includeBoards = true,
  includeCaptures = true,
} = {}) => {
  const renderServer = RENDER_ORIGIN_OVERRIDE
    ? {
        origin: RENDER_ORIGIN_OVERRIDE,
        nextProcess: null,
        getLogs: () => '',
      }
    : await startNextDevServer({
        port: RENDER_NEXT_PORT,
        env: {
          NEXT_PUBLIC_XRDB_ENABLE_DOCS_CAPTURE: 'true',
          XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS: 'true',
        },
      });

  try {
    if (includeBoards) {
      logRefreshStep('Generating render comparison boards');
      const posterCards = [
        {
          title: 'Glass poster stack',
          caption: 'Original text, top bottom layout, TMDB plus IMDb, stream badges on.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'poster',
              id: 'tt15239678',
              params: {
                lang: 'en',
                posterRatings: 'tmdb,imdb',
                posterRatingsLayout: 'top bottom',
                posterStreamBadges: 'on',
                ratingStyle: 'glass',
                imageText: 'original',
              },
            }),
          ),
        },
        {
          title: 'Square split layout',
          caption: 'Clean text, left right stack, TMDB only, stream badges off.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'poster',
              id: 'tt15239678',
              params: {
                lang: 'en',
                posterRatings: 'tmdb',
                posterRatingsLayout: 'left right',
                posterStreamBadges: 'off',
                posterQualityBadgesStyle: 'square',
                ratingStyle: 'square',
                imageText: 'clean',
              },
            }),
          ),
        },
        {
          title: 'Plain capped stack',
          caption:
            'Top layout, plain badges, max 2 ratings, quality badges pinned right with cap 2.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'poster',
              id: 'tt15239678',
              params: {
                lang: 'en',
                posterRatings: 'tmdb,imdb',
                posterRatingsLayout: 'top',
                posterRatingsMaxPerSide: '2',
                posterStreamBadges: 'on',
                posterQualityBadgesStyle: 'plain',
                posterQualityBadgesPosition: 'right',
                posterQualityBadgesMax: '2',
                ratingStyle: 'plain',
                imageText: 'original',
              },
            }),
          ),
        },
      ];

      await createBoard({
        outputPath: resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.moviePosterComparison),
        width: 1900,
        height: 1700,
        title: 'Movie Poster Comparison',
        subtitle: 'Dune Part Two poster with three current settings mixes',
        stamp: `Captured from the local app on ${CAPTURE_DATE}.`,
        cards: posterCards,
        imageHeight: 720,
        imageFit: 'cover',
      });
      logRefreshStep('Saved movie poster comparison board');

      const backdropCards = [
        {
          title: 'Center glass layout',
          caption: 'Clean text, center ratings, TMDB plus IMDb, no stream badges.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'backdrop',
              id: 'tt0944947',
              params: {
                lang: 'en',
                backdropRatings: 'tmdb,imdb',
                backdropRatingsLayout: 'center',
                backdropStreamBadges: 'off',
                ratingStyle: 'glass',
                imageText: 'clean',
              },
            }),
          ),
        },
        {
          title: 'Right vertical square',
          caption: 'Clean text, right vertical ratings, square badges, stream badges on, cap 2.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'backdrop',
              id: 'tt0944947',
              params: {
                lang: 'en',
                backdropRatings: 'tmdb,imdb',
                backdropRatingsLayout: 'right vertical',
                backdropStreamBadges: 'on',
                backdropQualityBadgesStyle: 'square',
                backdropQualityBadgesMax: '2',
                ratingStyle: 'square',
                imageText: 'clean',
              },
            }),
          ),
        },
        {
          title: 'Right plain layout',
          caption: 'Original text, right ratings, TMDB only, plain style, max 1 quality badge.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'backdrop',
              id: 'tt0944947',
              params: {
                lang: 'en',
                backdropRatings: 'tmdb',
                backdropRatingsLayout: 'right',
                backdropStreamBadges: 'on',
                backdropQualityBadgesStyle: 'plain',
                backdropQualityBadgesMax: '1',
                ratingStyle: 'plain',
                imageText: 'original',
              },
            }),
          ),
        },
      ];

      await createBoard({
        outputPath: resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.showBackdropComparison),
        width: 1900,
        height: 1500,
        title: 'Show Backdrop Comparison',
        subtitle: 'Game of Thrones backdrop with three current settings mixes',
        stamp: `Captured from the local app on ${CAPTURE_DATE}.`,
        cards: backdropCards,
        imageHeight: 290,
        imageFit: 'cover',
      });
      logRefreshStep('Saved show backdrop comparison board');

      const logoCards = [
        {
          title: 'Transparent plain logo',
          caption: 'Transparent background, plain badges, TMDB plus AniList plus Kitsu.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'logo',
              id: 'mal:16498',
              params: {
                lang: 'ja',
                logoRatings: 'tmdb,anilist,kitsu',
                logoBackground: 'transparent',
                logoRatingsMax: '3',
                ratingStyle: 'plain',
              },
            }),
          ),
        },
        {
          title: 'Transparent glass logo',
          caption:
            'Transparent background, glass badges, TMDB plus AniList plus Kitsu with the neutral Kitsu chip.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'logo',
              id: 'mal:16498',
              params: {
                lang: 'ja',
                logoRatings: 'tmdb,anilist,kitsu',
                logoBackground: 'transparent',
                logoRatingsMax: '3',
                ratingStyle: 'glass',
              },
            }),
          ),
        },
        {
          title: 'Dark square logo',
          caption: 'Dark background, square badges, current logo rating cap set to 1.',
          image: await fetchBuffer(
            buildRenderUrl({
              origin: renderServer.origin,
              type: 'logo',
              id: 'mal:16498',
              params: {
                lang: 'ja',
                logoRatings: 'tmdb,anilist,kitsu',
                logoBackground: 'dark',
                logoRatingsMax: '1',
                ratingStyle: 'square',
              },
            }),
          ),
        },
      ];

      await createBoard({
        outputPath: resolveDocAssetPath(DOC_STATIC_ASSET_PATHS.animeLogoComparison),
        width: 1900,
        height: 1300,
        title: 'Anime Logo Comparison',
        subtitle: 'Attack on Titan logo with transparent and dark badge settings mixes',
        stamp: `Captured from the local app on ${CAPTURE_DATE}.`,
        cards: logoCards,
        imageHeight: 230,
        imageFit: 'contain',
      });
      logRefreshStep('Saved anime logo comparison board');
    }

    if (includeCaptures) {
      logRefreshStep('Generating workspace captures');
      if (RENDER_ORIGIN_OVERRIDE) {
        const captureServer = await startNextDevServer({
          port: CAPTURE_NEXT_PORT,
          env: {
            NEXT_PUBLIC_XRDB_ENABLE_DOCS_CAPTURE: 'true',
            XRDB_ALLOW_PRIVATE_SOURCES_FOR_TESTS: 'true',
          },
        });

        try {
          await generateWorkspaceCaptures(captureServer.origin);
        } catch (error) {
          throw new Error(`${String(error)}\n\n${captureServer.getLogs()}`);
        } finally {
          await terminateProcess(captureServer.nextProcess);
        }
      } else {
        await generateWorkspaceCaptures(renderServer.origin);
      }
    }
  } catch (error) {
    throw new Error(`${String(error)}\n\n${renderServer.getLogs()}`);
  } finally {
    await terminateProcess(renderServer.nextProcess);
  }
};

const main = async () => {
  const mode = String(process.argv[2] || 'all').trim().toLowerCase();
  const validModes = new Set(['all', 'boards', 'captures', 'metadata']);

  if (!validModes.has(mode)) {
    throw new Error(`Unknown mode "${mode}". Use "all", "boards", "captures", or "metadata".`);
  }

  logRefreshStep(`Starting static doc asset refresh (${mode})`);
  if (mode === 'all') {
    await generateComparisonBoards({
      includeBoards: true,
      includeCaptures: true,
    });
    await generateMetadataExamples();
  } else if (mode === 'boards') {
    await generateComparisonBoards({
      includeBoards: true,
      includeCaptures: false,
    });
  } else if (mode === 'captures') {
    await generateComparisonBoards({
      includeBoards: false,
      includeCaptures: true,
    });
  } else {
    await generateMetadataExamples();
  }

  logRefreshStep(`Refreshed static doc assets (${mode})`);

  const readmePath = path.join(ROOT_DIR, 'README.md');
  const readmeContent = await fs.readFile(readmePath, 'utf-8');
  const datePattern = /^(These screenshots were regenerated from the local )\S+ \d{1,2}, \d{4}( codebase)/m;
  const dateMatch = readmeContent.match(datePattern);
  if (dateMatch) {
    const updatedReadme = readmeContent.replace(datePattern, `$1${CAPTURE_DATE}$2`);
    if (updatedReadme !== readmeContent) {
      await fs.writeFile(readmePath, updatedReadme);
      logRefreshStep(`Updated README.md capture date to ${CAPTURE_DATE}`);
    }
  } else {
    console.warn('[refresh] WARNING: Could not find the screenshot capture date pattern in README.md');
  }
};

await main();
