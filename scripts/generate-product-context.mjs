import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPublicCommitRecords } from './public-commit-records.mjs';

const PRODUCT_CONTEXT_ARTIFACT_TYPE = 'xrdb-product-context';
const PRODUCT_CONTEXT_SCHEMA_VERSION = 1;
const PRODUCT_CONTEXT_OUTPUT_PATH = join('public', 'product-context.json');
const DEFAULT_APP_URL = 'http://localhost:3000';
const DEFAULT_GENERATED_AT = new Date().toISOString();
const KNOWN_ROUTE_LABELS = {
  '/': 'Configurator workspace for render settings and live preview.',
  '/addon': 'Addon proxy workspace and manifest export flow.',
  '/export': 'Export workspace for generated URLs and patterns.',
  '/reference': 'Reference surface for shipped options and behavior.',
  '/preview/[slug]': 'Fixed preview routes used by docs and live samples.',
  '/proxy/manifest.json': 'Proxy addon manifest endpoint.',
  '/proxy/[...path]': 'Proxy pass through endpoint for addon traffic.',
  '/thumbnail/[id]/[episodeToken]': 'Episode thumbnail render route.',
  '/api/latest-release': 'Latest release feed used by the site.',
  '/api/media-search': 'Configurator media search endpoint.',
  '/api/media-resolve': 'Configurator media resolve endpoint.',
  '/api/discord-widget': 'Community widget endpoint.',
  '/docs-capture/mock-addon-manifest.json': 'Docs capture mock addon manifest endpoint.',
};

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function extractExportAssignment(source, constName) {
  const match = source.match(
    new RegExp(`(?:export\\s+)?const ${constName}(?:\\s*:[^=]+)?\\s*=([\\s\\S]*?);`)
  );
  return match?.[1] || '';
}

function extractLastStringLiteral(source, constName) {
  const assignment = extractExportAssignment(source, constName);
  const matches = Array.from(assignment.matchAll(/'([^']+)'/g)).map((match) => match[1]);
  return matches.at(-1) || null;
}

function extractSetValues(source, constName) {
  const assignment = extractExportAssignment(source, constName);
  return Array.from(assignment.matchAll(/'([^']+)'/g)).map((match) => match[1]);
}

function extractDimensions(source, constName) {
  const assignment = extractExportAssignment(source, constName);
  const matches = Array.from(
    assignment.matchAll(/([a-zA-Z0-9']+)\s*:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/g)
  );
  return matches.map((match) => ({
    key: match[1].replace(/'/g, ''),
    width: Number(match[2]),
    height: Number(match[3]),
  }));
}

function walkFiles(rootDir) {
  const results = [];
  const queue = [rootDir];

  while (queue.length) {
    const currentDir = queue.shift();
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeAppRoutePath(relativeFilePath) {
  const normalized = relativeFilePath.replace(/\\/g, '/');
  const isPage = normalized.endsWith('/page.tsx');
  const isRoute = normalized.endsWith('/route.ts');
  if (!isPage && !isRoute) {
    return null;
  }

  const withoutLeaf = normalized.replace(/\/(page\.tsx|route\.ts)$/, '');
  const parts = withoutLeaf
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\(.+\)$/.test(segment));

  if (parts[0] === 'app') {
    parts.shift();
  }

  return `/${parts.join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function collectRoutePaths(rootDir) {
  const appDir = resolve(rootDir, 'app');
  return Array.from(
    new Set(
      walkFiles(appDir)
        .map((filePath) => normalizeAppRoutePath(relative(appDir, filePath)))
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function parseRepositoryOwner(repositoryUrl) {
  try {
    const url = new URL(String(repositoryUrl || '').replace(/^git\+/, ''));
    const [owner] = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/');
    return owner || 'XRDB';
  } catch {
    return 'XRDB';
  }
}

function resolveLiveUrl({ readme, env }) {
  const explicitUrl = String(env.NEXT_PUBLIC_APP_URL || '').trim();
  if (explicitUrl) {
    return explicitUrl.replace(/\/+$/, '');
  }

  const matches = Array.from(readme.matchAll(/https:\/\/[^\s)"'>]+/g)).map((match) => match[0]);
  const liveCandidate = matches.find((value) => /\/preview\//.test(value) || /#preview/.test(value));

  if (!liveCandidate) {
    return DEFAULT_APP_URL;
  }

  try {
    return new URL(liveCandidate).origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

function buildRouteLines(routePaths) {
  return routePaths.map((routePath) => {
    const label = KNOWN_ROUTE_LABELS[routePath];
    return label ? `${routePath}: ${label}` : routePath;
  });
}

function formatDimensionLines(label, dimensions) {
  if (!dimensions.length) {
    return null;
  }

  const body = dimensions
    .map((entry) => `${entry.key} ${entry.width}x${entry.height}`)
    .join(', ');
  return `${label}: ${body}.`;
}

function pickRecentHighlightLines(rootDir) {
  return buildPublicCommitRecords({ cwd: rootDir, limit: 12 })
    .filter((entry) => entry.type !== 'chore')
    .slice(0, 5)
    .map((entry) => entry.title);
}

function buildOutputCapabilityLines({ imageRouteSource, routePaths, readme }) {
  const allowedImageTypes = extractSetValues(imageRouteSource, 'ALLOWED_IMAGE_TYPES');
  const explicitIdSources = extractSetValues(imageRouteSource, 'EXPLICIT_ID_SOURCE_SET');
  const artworkSources = extractSetValues(imageRouteSource, 'ARTWORK_SOURCE_SET');
  const posterDimensions = extractDimensions(imageRouteSource, 'POSTER_IMAGE_DIMENSIONS');
  const backdropDimensions = extractDimensions(imageRouteSource, 'BACKDROP_IMAGE_DIMENSIONS');
  const lines = [];

  if (allowedImageTypes.length) {
    const outputTypes = routePaths.includes('/thumbnail/[id]/[episodeToken]')
      ? [...allowedImageTypes, 'thumbnail']
      : allowedImageTypes;
    lines.push(`Supported image outputs: ${outputTypes.join(', ')}.`);
  }

  const posterLine = formatDimensionLines('Poster sizes', posterDimensions);
  if (posterLine) {
    lines.push(posterLine);
  }

  const backdropLine = formatDimensionLines('Backdrop sizes', backdropDimensions);
  if (backdropLine) {
    lines.push(backdropLine);
  }

  if (artworkSources.length) {
    lines.push(`Artwork sources in route config: ${artworkSources.join(', ')}.`);
  }

  if (explicitIdSources.length) {
    lines.push(`Explicit input id sources: ${explicitIdSources.join(', ')}.`);
  }

  if (/AIOMetadata/i.test(readme)) {
    lines.push('AIOMetadata export patterns are generated from the configurator export flow.');
  }

  return lines;
}

function buildMetadataBehaviorLines({ readme, envTemplate, serviceBaseUrlsSource }) {
  const lines = [];

  if (/Bring Your Own Key \(BYOK\)/.test(readme)) {
    lines.push('BYOK is the default runtime model. Provider keys come from configurator state or request URLs.');
  }

  const defaultTmdbBaseUrl = extractLastStringLiteral(serviceBaseUrlsSource, 'DEFAULT_TMDB_API_BASE_URL');
  const defaultAnimeMappingBaseUrl = extractLastStringLiteral(serviceBaseUrlsSource, 'DEFAULT_ANIME_MAPPING_BASE_URL');
  const defaultKitsuBaseUrl = extractLastStringLiteral(serviceBaseUrlsSource, 'DEFAULT_KITSU_API_BASE_URL');
  const defaultOmdbBaseUrl = extractLastStringLiteral(serviceBaseUrlsSource, 'DEFAULT_OMDB_API_BASE_URL');

  const providerBaseUrls = [
    ['TMDB', defaultTmdbBaseUrl],
    ['anime mapping', defaultAnimeMappingBaseUrl],
    ['Kitsu', defaultKitsuBaseUrl],
    ['OMDb', defaultOmdbBaseUrl],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label} ${value}`);

  if (providerBaseUrls.length) {
    lines.push(`Configured base URLs: ${providerBaseUrls.join(', ')}.`);
  }

  const optionalProviders = [
    ['MyAnimeList', /XRDB_MAL_CLIENT_ID/],
    ['Trakt', /XRDB_TRAKT_CLIENT_ID/],
    ['SIMKL', /SIMKL_CLIENT_ID/],
    ['Fanart', /XRDB_FANART_API_KEY/],
    ['OMDb', /OMDB_KEY/],
  ]
    .filter(([, pattern]) => pattern.test(readme) || pattern.test(envTemplate))
    .map(([label]) => label);

  if (optionalProviders.length) {
    lines.push(`Optional server side provider support exists for ${optionalProviders.join(', ')}.`);
  }

  return lines;
}

function buildProxyBehaviorLines({ proxyManifestSource, requestKeySource, envTemplate }) {
  const lines = [];

  if (
    /Missing "url" query parameter\./.test(proxyManifestSource) &&
    /Missing "tmdbKey" or "mdblistKey" query parameter\./.test(proxyManifestSource)
  ) {
    lines.push('Proxy manifest requests require url, tmdbKey, and mdblistKey query params.');
  }

  const requestKeyNames = extractSetValues(requestKeySource, 'REQUEST_KEY_HEADER_NAMES');
  if (/XRDB_REQUEST_KEY_QUERY_PARAM = 'xrdbKey'/.test(requestKeySource)) {
    const keyInputs = ['xrdbKey', 'xrdb_key', ...requestKeyNames, 'Authorization Bearer'];
    lines.push(`XRDB request keys can be supplied through ${keyInputs.join(', ')}.`);
  }

  if (/XRDB_PROXY_ALLOWED_ORIGINS/.test(envTemplate)) {
    lines.push('Proxy CORS allowlists are controlled by XRDB_PROXY_ALLOWED_ORIGINS.');
  }

  return lines;
}

function buildRuntimeLines({ packageJson, readme, supportUrl }) {
  const lines = [];

  if (/release:patch/.test(JSON.stringify(packageJson.scripts || {}))) {
    lines.push('Tagged releases run through the npm release scripts and the npm version lifecycle.');
  }

  if (/GitHub release/.test(readme) && /GHCR/.test(readme)) {
    lines.push('Tagged releases publish GitHub release notes and GHCR container images.');
  }

  if (/final render cache version/i.test(readme)) {
    lines.push('Release automation bumps the final render cache version to invalidate stale output.');
  }

  if (/compose\.yaml/.test(readme) && /local-compose\.yaml/.test(readme)) {
    lines.push('compose.yaml is the stack path and local-compose.yaml is the standalone local path.');
  }

  if (supportUrl) {
    lines.push(`Project support link: ${supportUrl}.`);
  }

  return lines;
}

export function buildProductContext({
  generatedAt = DEFAULT_GENERATED_AT,
  rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  tagName,
} = {}) {
  const packageJson = readJson(resolve(rootDir, 'package.json'));
  const readme = readText(resolve(rootDir, 'README.md'));
  const envTemplate = readText(resolve(rootDir, 'env.template'));
  const imageRouteSource = readText(resolve(rootDir, 'lib', 'imageRouteConfig.ts'));
  const siteBrandSource = readText(resolve(rootDir, 'lib', 'siteBrand.ts'));
  const serviceBaseUrlsSource = readText(resolve(rootDir, 'lib', 'serviceBaseUrls.ts'));
  const proxyManifestSource = readText(resolve(rootDir, 'lib', 'proxyManifestRoute.ts'));
  const requestKeySource = readText(resolve(rootDir, 'lib', 'xrdbRequestKey.ts'));
  const routePaths = collectRoutePaths(rootDir);
  const packageVersion = String(packageJson.version || '').trim() || 'dev';
  const resolvedTagName = String(tagName || '').trim() || `v${packageVersion}`;
  const productName = extractLastStringLiteral(siteBrandSource, 'BRAND_NAME') || 'XRDB';
  const expandedName = extractLastStringLiteral(siteBrandSource, 'BRAND_FULL_NAME') || 'XRDB';
  const ownerName = parseRepositoryOwner(packageJson.repository?.url);
  const liveUrl = resolveLiveUrl({ readme, env: process.env });
  const serverInvite = extractLastStringLiteral(siteBrandSource, 'BRAND_DISCORD_OFFICIAL_URL') || '';
  const supportUrl = extractLastStringLiteral(siteBrandSource, 'BRAND_SUPPORT_URL') || '';
  const introLines = [
    String(packageJson.description || '').trim(),
    `XRDB publishes live configurator, export, reference, preview, proxy, and thumbnail surfaces from ${liveUrl}.`,
  ].filter(Boolean);
  const recentHighlights = pickRecentHighlightLines(rootDir);

  return {
    artifactType: PRODUCT_CONTEXT_ARTIFACT_TYPE,
    schemaVersion: PRODUCT_CONTEXT_SCHEMA_VERSION,
    xrdbTag: resolvedTagName,
    generatedAt,
    productName,
    expandedName,
    ownerName,
    liveUrl,
    serverInvite,
    introLines,
    sections: [
      {
        heading: 'Primary XRDB routes and surfaces',
        lines: buildRouteLines(routePaths),
      },
      {
        heading: 'Recent XRDB feature highlights',
        lines: recentHighlights.length ? recentHighlights : ['No recent public commit highlights were detected.'],
      },
      {
        heading: 'Output and export capabilities',
        lines: buildOutputCapabilityLines({ imageRouteSource, routePaths, readme }),
      },
      {
        heading: 'Metadata and proxy behavior',
        lines: [
          ...buildMetadataBehaviorLines({ readme, envTemplate, serviceBaseUrlsSource }),
          ...buildProxyBehaviorLines({ proxyManifestSource, requestKeySource, envTemplate }),
        ],
      },
      {
        heading: 'Runtime and deployment notes',
        lines: buildRuntimeLines({ packageJson, readme, supportUrl }),
      },
    ].filter((section) => section.lines.length > 0),
  };
}

export function writeProductContext({
  outputPath = PRODUCT_CONTEXT_OUTPUT_PATH,
  payload,
  rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const resolvedPayload = payload || buildProductContext({ rootDir });
  const targetPath = resolve(rootDir, outputPath);
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, `${JSON.stringify(resolvedPayload, null, 2)}\n`, 'utf8');
  return targetPath;
}

const executedScriptPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (executedScriptPath === modulePath) {
  const targetPath = writeProductContext();
  console.log(`Wrote XRDB product context to ${targetPath}`);
}