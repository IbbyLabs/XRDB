import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helperSource = readFileSync(
  new URL('../lib/imageRouteExternalRatings.ts', import.meta.url),
  'utf8',
);
const preparedMediaSource = readFileSync(
  new URL('../lib/imageRoutePreparedMedia.ts', import.meta.url),
  'utf8',
);
const configSource = readFileSync(
  new URL('../lib/imageRouteConfig.ts', import.meta.url),
  'utf8',
);

test('Simkl integration resolves IDs through the redirect endpoint', () => {
  assert.match(helperSource, /https:\/\/api\.simkl\.com\/redirect\?/);
  assert.doesNotMatch(helperSource, /https:\/\/api\.simkl\.com\/ratings\?/);
});

test('Simkl requests include required query metadata and headers', () => {
  assert.match(helperSource, /query\.set\('client_id',\s*clientId\);/);
  assert.match(helperSource, /query\.set\('app-name',\s*SIMKL_APP_NAME\);/);
  assert.match(helperSource, /query\.set\('app-version',\s*SIMKL_APP_VERSION\);/);
  assert.match(helperSource, /'simkl-api-key':\s*normalizedClientId,/);
  assert.match(helperSource, /'User-Agent':\s*SIMKL_USER_AGENT,/);
});

test('Simkl summary lookups use canonical movies/tv/anime endpoints', () => {
  assert.match(
    helperSource,
    /https:\/\/api\.simkl\.com\/\$\{simklSummaryType\}\/\$\{encodeURIComponent\(simklId\)\}\?/,
  );
});

test('Simkl-only requests still enable provider ratings fetch path', () => {
  assert.match(
    preparedMediaSource,
    /needsTraktRating\s*\|\|\s*needsSimklRating/,
  );
});

test('Simkl ID cache keeps resolved IDs long-lived and empty responses short-lived', () => {
  assert.match(
    configSource,
    /const SIMKL_ID_CACHE_TTL_MS = parseCacheTtlMs\([\s\S]*?180 \* 24 \* 60 \* 60 \* 1000,/,
  );
  assert.match(
    configSource,
    /const SIMKL_ID_EMPTY_CACHE_TTL_MS = parseCacheTtlMs\([\s\S]*?24 \* 60 \* 60 \* 1000,/,
  );
});
