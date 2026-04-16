import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const runScript = (script, extraEnv = {}) => {
  const output = execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--input-type=module', '--eval', script],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      encoding: 'utf8',
    },
  );
  return JSON.parse(output.trim());
};

test('hardening kill switch overrides per-feature flags', () => {
  const result = runScript(
    `
      import {
        CACHE_HARDENING_ENABLED,
        CACHE_HARDENING_NEGATIVE_CACHE,
        CACHE_HARDENING_SWR,
        CACHE_HARDENING_CIRCUIT_BREAKER,
        CACHE_HARDENING_PROVIDER_BUDGETS,
      } from './lib/imageRouteConfig.ts';
      console.log(JSON.stringify({
        enabled: CACHE_HARDENING_ENABLED,
        negative: CACHE_HARDENING_NEGATIVE_CACHE,
        swr: CACHE_HARDENING_SWR,
        circuit: CACHE_HARDENING_CIRCUIT_BREAKER,
        budgets: CACHE_HARDENING_PROVIDER_BUDGETS,
      }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'false',
      CACHE_HARDENING_NEGATIVE_CACHE: 'true',
      CACHE_HARDENING_SWR: 'true',
      CACHE_HARDENING_CIRCUIT_BREAKER: 'true',
      CACHE_HARDENING_PROVIDER_BUDGETS: 'true',
    },
  );

  assert.deepEqual(result, {
    enabled: false,
    negative: false,
    swr: false,
    circuit: false,
    budgets: false,
  });
});

test('hardening rollback path preserves legacy empty-result ttl', () => {
  const id = `tt${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const result = runScript(
    `
      import { fetchTorrentioBadges, resetTorrentioHardeningStateForTests } from './lib/imageRouteTorrentio.ts';
      resetTorrentioHardeningStateForTests();
      const response = await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(id)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ streams: [] }) }),
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      console.log(JSON.stringify({ cacheTtlMs: response.cacheTtlMs, badgeCount: response.badges.length }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'false',
      CACHE_HARDENING_NEGATIVE_CACHE: 'true',
    },
  );

  assert.equal(result.badgeCount, 0);
  assert.ok(result.cacheTtlMs > 5 * 60 * 1000);
});

test('negative cache applies short ttl when enabled', () => {
  const id = `tt${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const result = runScript(
    `
      import { fetchTorrentioBadges, resetTorrentioHardeningStateForTests } from './lib/imageRouteTorrentio.ts';
      resetTorrentioHardeningStateForTests();
      const response = await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(id)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({ streams: [] }) }),
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      console.log(JSON.stringify({ cacheTtlMs: response.cacheTtlMs, badgeCount: response.badges.length }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'true',
      CACHE_HARDENING_NEGATIVE_CACHE: 'true',
      XRDB_TORRENTIO_NEGATIVE_CACHE_TTL_MS: '300000',
    },
  );

  assert.equal(result.badgeCount, 0);
  assert.equal(result.cacheTtlMs, 300000);
});

test('circuit breaker skips the second failing provider call after threshold', () => {
  const id = `tt${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const result = runScript(
    `
      import { fetchTorrentioBadges, resetTorrentioHardeningStateForTests } from './lib/imageRouteTorrentio.ts';
      resetTorrentioHardeningStateForTests();
      let fetchCalls = 0;
      const fetchImpl = async () => {
        fetchCalls += 1;
        throw new Error('upstream failed');
      };
      await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(`${id}a`)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        fetchImpl,
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      const second = await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(`${id}b`)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        fetchImpl,
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      console.log(JSON.stringify({ fetchCalls, secondBadgeCount: second.badges.length }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'true',
      CACHE_HARDENING_CIRCUIT_BREAKER: 'true',
      XRDB_TORRENTIO_CIRCUIT_FAILURE_THRESHOLD: '1',
      XRDB_TORRENTIO_CIRCUIT_WINDOW_MS: '60000',
      XRDB_TORRENTIO_CIRCUIT_COOLDOWN_MS: '60000',
    },
  );

  assert.equal(result.fetchCalls, 1);
  assert.equal(result.secondBadgeCount, 0);
});

test('provider budget skips the second request in the active window', () => {
  const id = `tt${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const result = runScript(
    `
      import { fetchTorrentioBadges, resetTorrentioHardeningStateForTests } from './lib/imageRouteTorrentio.ts';
      resetTorrentioHardeningStateForTests();
      let fetchCalls = 0;
      const fetchImpl = async () => {
        fetchCalls += 1;
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ streams: [{ title: 'BluRay REMUX' }] }) };
      };
      await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(`${id}a`)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        fetchImpl,
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      const second = await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(`${id}b`)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        fetchImpl,
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      console.log(JSON.stringify({ fetchCalls, secondBadgeCount: second.badges.length }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'true',
      CACHE_HARDENING_PROVIDER_BUDGETS: 'true',
      XRDB_TORRENTIO_BUDGET_REQUESTS_PER_WINDOW: '1',
      XRDB_TORRENTIO_BUDGET_WINDOW_MS: '60000',
    },
  );

  assert.equal(result.fetchCalls, 1);
  assert.equal(result.secondBadgeCount, 0);
});

test('stale while revalidate serves stale data and refreshes in the background', () => {
  const id = `tt${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const result = runScript(
    `
      import { fetchTorrentioBadges, resetTorrentioHardeningStateForTests } from './lib/imageRouteTorrentio.ts';
      resetTorrentioHardeningStateForTests();
      let fetchCalls = 0;
      const fetchImpl = async () => {
        fetchCalls += 1;
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ streams: [{ title: 'BluRay REMUX 2160p' }] }) };
      };
      await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(id)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        cacheTtlMs: 1,
        fetchImpl,
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const stale = await fetchTorrentioBadges({
        type: 'movie',
        id: ${JSON.stringify(id)},
        phases: { auth: 0, tmdb: 0, mdb: 0, fanart: 0, stream: 0, render: 0 },
        cacheTtlMs: 1,
        fetchImpl,
        baseUrl: 'https://primary.example',
        fallbackBaseUrl: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      console.log(JSON.stringify({ fetchCalls, staleBadgeCount: stale.badges.length, cacheHit: stale.cacheHit === true }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'true',
      CACHE_HARDENING_SWR: 'true',
      XRDB_TORRENTIO_SWR_WINDOW_MS: '60000',
    },
  );

  assert.equal(result.staleBadgeCount > 0, true);
  assert.equal(result.cacheHit, true);
  assert.equal(result.fetchCalls, 2);
});

test('prewarm popularity and snapshot restore can be enabled together', () => {
  const result = runScript(
    `
      import { loadPrewarmSnapshot, rankTargetsByPopularity, savePrewarmSnapshot } from './lib/posterCacheWarmScheduler.ts';
      const recentEntries = [
        { id: 'tt2', searchParams: new URLSearchParams() },
        { id: 'tt2', searchParams: new URLSearchParams() },
        { id: 'tt1', searchParams: new URLSearchParams() },
      ];
      savePrewarmSnapshot(['tt3', 'tt2']);
      const restored = loadPrewarmSnapshot();
      const ranked = rankTargetsByPopularity(['tt1', 'tt2', 'tt3'], recentEntries);
      console.log(JSON.stringify({ restored, ranked }));
    `,
    {
      CACHE_HARDENING_ENABLED: 'true',
      CACHE_HARDENING_PREWARM_POPULARITY: 'true',
      CACHE_HARDENING_SNAPSHOT_RESTORE: 'true',
    },
  );

  assert.deepEqual(result.restored, ['tt3', 'tt2']);
  assert.deepEqual(result.ranked, ['tt2', 'tt1', 'tt3']);
});

test('auto tune stats collect observe-only telemetry when enabled', () => {
  const result = runScript(
    `
      import {
        getAutoTuneStatsForTests,
        recordAutoTuneStat,
        resetTorrentioHardeningStateForTests,
      } from './lib/imageRouteTorrentio.ts';
      resetTorrentioHardeningStateForTests();
      recordAutoTuneStat('hits');
      recordAutoTuneStat('misses');
      recordAutoTuneStat('negativeCaches');
      console.log(JSON.stringify(getAutoTuneStatsForTests()));
    `,
    {
      CACHE_HARDENING_ENABLED: 'true',
      CACHE_HARDENING_AUTO_TUNE: 'true',
    },
  );

  assert.equal(result.hits, 1);
  assert.equal(result.misses, 1);
  assert.equal(result.negativeCaches, 1);
});
