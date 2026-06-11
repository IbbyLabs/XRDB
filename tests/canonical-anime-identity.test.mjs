import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildCanonicalEpisodeLookupKey,
  buildCanonicalSeriesLookupKey,
  getCanonicalEpisodeMapping,
  getCanonicalSeriesMapping,
  hasCanonicalNegativeSeriesMapping,
  setCanonicalEpisodeMapping,
  setCanonicalSeriesMapping,
} from '../lib/canonicalAnimeIdentity/cache.ts';
import { upsertCanonicalMappingOverride } from '../lib/canonicalAnimeIdentity/overrides.ts';
import { resolveCanonicalEpisodeIdentity } from '../lib/canonicalAnimeIdentity/episodeResolver.ts';
import { resolveCanonicalSeriesIdentity } from '../lib/canonicalAnimeIdentity/seriesResolver.ts';
import { getDb } from '../lib/sqliteStore.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

const withTempDataDir = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-canonical-identity-'));
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

test('canonical anime identity cache keys are stable', () => {
  assert.equal(buildCanonicalSeriesLookupKey('MAL', '5114'), 'mal:5114');
  assert.equal(
    buildCanonicalEpisodeLookupKey('kitsu', '42765', '1', '1', null),
    'kitsu:42765:s:1:e:1:a:-',
  );
});

test('canonical series resolution preserves mixed-provider raw source and mapped ids', async (t) => {
  await withTempDataDir(t, async () => {
    const fetchJsonCached = async () => ({
      ok: true,
      status: 200,
      data: {
        mappings: {
          ids: {
            tmdb: '46298',
            mal: '5114',
            anilist: '16498',
          },
        },
        requested: {
          resolvedKitsuId: 'kitsu:42765',
        },
      },
    });

    const series = await resolveCanonicalSeriesIdentity({
      input: {
        rawId: 'kitsu:42765',
        rawProvider: 'kitsu',
        rawExternalId: '42765',
        mediaType: 'tv',
        season: '1',
        episode: '1',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      phases,
      fetchJsonCached,
    });

    assert.equal(series.provider, 'kitsu');
    assert.equal(series.externalId, '42765');
    assert.equal(series.mappedIds.tmdb, '46298');
    assert.equal(series.mappedIds.kitsu, '42765');
  });
});

test('canonical episode resolution prefers mixed-provider hints over path coordinates', async (t) => {
  await withTempDataDir(t, async () => {
    const fetchJsonCached = async () => ({
      ok: true,
      status: 200,
      data: {
        mappings: {
          ids: {
            tmdb: '46298',
          },
          tmdb_episode: {
            id: '46298',
            season_number: 2,
            episode_number: 1,
          },
        },
      },
    });

    const series = {
      canonicalSeriesId: 'imdb:tt12343534',
      provider: 'imdb',
      externalId: 'tt12343534',
      mediaType: 'tv',
      mappedIds: { imdb: 'tt12343534', tmdb: '46298' },
      links: [],
      source: 'raw',
      confidence: 0.5,
      sourceUpdatedAt: Date.now(),
    };

    const episode = await resolveCanonicalEpisodeIdentity({
      input: {
        rawId: 'tt12343534',
        rawProvider: 'imdb',
        rawExternalId: 'tt12343534',
        mediaType: 'tv',
        season: '1',
        episode: '1',
        absoluteEpisode: null,
        episodeProvider: 'kitsu',
        episodeSourceId: '42765',
        episodeSourceSeason: null,
        episodeSourceEpisode: '1',
        episodeAbsolute: '1',
        tmdbEpOrder: 'tmdb',
      },
      series,
      phases,
      fetchJsonCached,
    });

    assert.equal(episode.season, '2');
    assert.equal(episode.episode, '1');
    assert.equal(episode.absoluteEpisode, '1');
    assert.deepEqual(
      episode.providerRefs.map((providerRef) => ({
        provider: providerRef.provider,
        seriesExternalId: providerRef.seriesExternalId,
        seasonNumber: providerRef.seasonNumber,
        episodeNumber: providerRef.episodeNumber,
        absoluteEpisodeNumber: providerRef.absoluteEpisodeNumber,
        role: providerRef.role,
      })),
      [
        {
          provider: 'imdb',
          seriesExternalId: 'tt12343534',
          seasonNumber: '1',
          episodeNumber: '1',
          absoluteEpisodeNumber: null,
          role: 'raw-source',
        },
        {
          provider: 'kitsu',
          seriesExternalId: '42765',
          seasonNumber: null,
          episodeNumber: '1',
          absoluteEpisodeNumber: '1',
          role: 'authority',
        },
        {
          provider: 'tmdb',
          seriesExternalId: '46298',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '1',
          role: 'mapped',
        },
      ],
    );
  });
});

test('canonical episode resolution applies consolidated TMDB remap when canonical show id is known', async (t) => {
  await withTempDataDir(t, async () => {
    const fetchJsonCached = async (key) => {
      if (key === 'canonical:reverse:imdb:tt1234567:s:1:e:15') {
        return { ok: false, status: 404, data: null };
      }
      if (key === 'tmdb:tv:99') {
        return {
          ok: true,
          status: 200,
          data: { id: 99, number_of_seasons: 2 },
        };
      }
      if (key === 'tmdb:tv:99:season:1') {
        return {
          ok: true,
          status: 200,
          data: {
            episodes: Array(12).fill(null).map((_, index) => ({ episode_number: index + 1 })),
          },
        };
      }
      if (key === 'tmdb:tv:99:season:2') {
        return {
          ok: true,
          status: 200,
          data: {
            episodes: Array(12).fill(null).map((_, index) => ({ episode_number: index + 1 })),
          },
        };
      }
      throw new Error(`Unexpected key: ${key}`);
    };

    const series = {
      canonicalSeriesId: 'imdb:tt1234567',
      provider: 'imdb',
      externalId: 'tt1234567',
      mediaType: 'tv',
      mappedIds: { imdb: 'tt1234567', tmdb: '99' },
      links: [],
      source: 'raw',
      confidence: 0.5,
      sourceUpdatedAt: Date.now(),
    };

    const episode = await resolveCanonicalEpisodeIdentity({
      input: {
        rawId: 'tt1234567',
        rawProvider: 'imdb',
        rawExternalId: 'tt1234567',
        mediaType: 'tv',
        season: '1',
        episode: '15',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      series,
      phases,
      fetchJsonCached,
      tmdbKey: 'tmdb-key',
      applyTmdbConsolidatedRemap: true,
    });

    assert.equal(episode.season, '2');
    assert.equal(episode.episode, '3');
  });
});

test('canonical episode resolution prefers persisted episode overrides for specials and OVAs', async (t) => {
  await withTempDataDir(t, async () => {
    const lookupKey = buildCanonicalEpisodeLookupKey('mal', '5114', '0', '1', null);
    upsertCanonicalMappingOverride({
      lookupKey: `episode:${lookupKey}`,
      scope: 'episode',
      provider: 'mal',
      externalKey: '5114:s:0:e:1',
      payload: {
        canonicalEpisodeId: 'mal:5114:ova-1',
        canonicalSeriesId: 'mal:5114',
        season: '0',
        episode: '1',
        absoluteEpisode: null,
        mappedIds: { tmdb: '999' },
        providerRefs: [
          {
            provider: 'mal',
            seriesExternalId: '5114',
            seasonNumber: '0',
            episodeNumber: '1',
            absoluteEpisodeNumber: null,
            source: 'override',
            confidence: 1,
          },
        ],
        source: 'override',
        confidence: 1,
      },
      reason: 'OVA numbering disagrees with inferred mapping',
      updatedAt: Date.now(),
    });

    const series = {
      canonicalSeriesId: 'mal:5114',
      provider: 'mal',
      externalId: '5114',
      mediaType: 'tv',
      mappedIds: { mal: '5114', tmdb: '999' },
      links: [],
      source: 'raw',
      confidence: 0.5,
      sourceUpdatedAt: Date.now(),
    };

    let fetchCalled = false;
    const episode = await resolveCanonicalEpisodeIdentity({
      input: {
        rawId: 'mal:5114',
        rawProvider: 'mal',
        rawExternalId: '5114',
        mediaType: 'tv',
        season: '0',
        episode: '1',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      series,
      phases,
      fetchJsonCached: async () => {
        fetchCalled = true;
        throw new Error('provider mapping should not run when an override exists');
      },
    });

    assert.equal(fetchCalled, false);
    assert.equal(episode.source, 'override');
    assert.equal(episode.season, '0');
    assert.equal(episode.episode, '1');
    assert.equal(episode.providerRefs[0]?.provider, 'mal');
  });
});

test('canonical series resolution negative-caches missing mappings', async (t) => {
  await withTempDataDir(t, async () => {
    let fetchCount = 0;
    const fetchJsonCached = async () => {
      fetchCount += 1;
      return { ok: false, status: 404, data: null };
    };

    const first = await resolveCanonicalSeriesIdentity({
      input: {
        rawId: 'mal:99999',
        rawProvider: 'mal',
        rawExternalId: '99999',
        mediaType: 'tv',
        season: '1',
        episode: '1',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      phases,
      fetchJsonCached,
    });
    const second = await resolveCanonicalSeriesIdentity({
      input: {
        rawId: 'mal:99999',
        rawProvider: 'mal',
        rawExternalId: '99999',
        mediaType: 'tv',
        season: '1',
        episode: '1',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      phases,
      fetchJsonCached: async () => {
        throw new Error('negative cache should prevent a second provider fetch');
      },
    });

    assert.equal(fetchCount, 1);
    assert.equal(first.source, 'raw');
    assert.equal(second.source, 'raw');
    assert.equal(hasCanonicalNegativeSeriesMapping('mal', '99999'), true);
  });
});

test('canonical cache invalidation boundary hides stale linked series caches after override updates', async (t) => {
  await withTempDataDir(t, async () => {
    setCanonicalSeriesMapping({
      canonicalSeriesId: 'tmdb:46298',
      provider: 'kitsu',
      externalId: '42765',
      mediaType: 'tv',
      mappedIds: { kitsu: '42765', tmdb: '46298' },
      links: [
        {
          provider: 'kitsu',
          externalId: '42765',
          isPrimary: true,
          source: 'kitsu-mapping',
          confidence: 0.9,
        },
        {
          provider: 'tmdb',
          externalId: '46298',
          isPrimary: false,
          source: 'kitsu-mapping',
          confidence: 0.8,
        },
      ],
      source: 'kitsu-mapping',
      confidence: 0.9,
      sourceUpdatedAt: Date.now(),
    });

    assert.equal(getCanonicalSeriesMapping('tmdb', '46298')?.identity.canonicalSeriesId, 'tmdb:46298');

    upsertCanonicalMappingOverride({
      lookupKey: 'series:kitsu:42765',
      scope: 'series',
      provider: 'kitsu',
      externalKey: '42765',
      payload: {
        canonicalSeriesId: 'tmdb:99999',
        provider: 'kitsu',
        externalId: '42765',
        mediaType: 'tv',
        mappedIds: { kitsu: '42765', tmdb: '99999' },
        links: [],
        source: 'override',
        confidence: 1,
        sourceUpdatedAt: Date.now(),
      },
      reason: 'split-cour correction',
      updatedAt: Date.now(),
    });

    assert.equal(getCanonicalSeriesMapping('tmdb', '46298'), null);
  });
});

test('series overrides are materialized for mapped provider lookups immediately', async (t) => {
  await withTempDataDir(t, async () => {
    upsertCanonicalMappingOverride({
      lookupKey: 'series:kitsu:42765',
      scope: 'series',
      provider: 'kitsu',
      externalKey: '42765',
      payload: {
        canonicalSeriesId: 'tmdb:99999',
        provider: 'kitsu',
        externalId: '42765',
        mediaType: 'tv',
        mappedIds: { kitsu: '42765', tmdb: '99999', imdb: 'tt76543210' },
        links: [],
        source: 'override',
        confidence: 1,
        sourceUpdatedAt: Date.now(),
      },
      reason: 'materialize mapped provider override',
      updatedAt: Date.now(),
    });

    const tmdbLookup = getCanonicalSeriesMapping('tmdb', '99999');
    const imdbLookup = getCanonicalSeriesMapping('imdb', 'tt76543210');

    assert.equal(tmdbLookup?.identity.canonicalSeriesId, 'tmdb:99999');
    assert.equal(tmdbLookup?.identity.source, 'override');
    assert.equal(imdbLookup?.identity.canonicalSeriesId, 'tmdb:99999');
    assert.equal(imdbLookup?.identity.source, 'override');
  });
});

test('xrdbid-backed requests reuse imdb-keyed series overrides', async (t) => {
  await withTempDataDir(t, async () => {
    upsertCanonicalMappingOverride({
      lookupKey: 'series:imdb:tt12343534',
      scope: 'series',
      provider: 'imdb',
      externalKey: 'tt12343534',
      payload: {
        canonicalSeriesId: 'tmdb:99999',
        provider: 'imdb',
        externalId: 'tt12343534',
        mediaType: 'tv',
        mappedIds: { imdb: 'tt12343534', tmdb: '99999' },
        links: [],
        source: 'override',
        confidence: 1,
        sourceUpdatedAt: Date.now(),
      },
      reason: 'xrdbid should resolve through imdb authority',
      updatedAt: Date.now(),
    });

    const series = await resolveCanonicalSeriesIdentity({
      input: {
        rawId: 'xrdbid:tt12343534',
        rawProvider: 'xrdbid',
        rawExternalId: 'tt12343534',
        mediaType: 'tv',
        season: '1',
        episode: '1',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      phases,
      fetchJsonCached: async () => {
        throw new Error('xrdbid series override should not fall through to provider fetches');
      },
    });

    assert.equal(series.canonicalSeriesId, 'tmdb:99999');
    assert.equal(series.provider, 'imdb');
    assert.equal(series.source, 'override');
  });
});

test('canonical series cache removes superseded provider links on rewrite', async (t) => {
  await withTempDataDir(t, async () => {
    setCanonicalSeriesMapping({
      canonicalSeriesId: 'tmdb:46298',
      provider: 'kitsu',
      externalId: '42765',
      mediaType: 'tv',
      mappedIds: { kitsu: '42765', tmdb: '46298' },
      links: [
        {
          provider: 'kitsu',
          externalId: '42765',
          isPrimary: true,
          source: 'kitsu-mapping',
          confidence: 0.9,
        },
        {
          provider: 'mal',
          externalId: '5114',
          isPrimary: false,
          source: 'kitsu-mapping',
          confidence: 0.75,
        },
      ],
      source: 'kitsu-mapping',
      confidence: 0.9,
      sourceUpdatedAt: Date.now(),
    });

    setCanonicalSeriesMapping({
      canonicalSeriesId: 'tmdb:46298',
      provider: 'kitsu',
      externalId: '42765',
      mediaType: 'tv',
      mappedIds: { kitsu: '42765', tmdb: '46298' },
      links: [
        {
          provider: 'kitsu',
          externalId: '42765',
          isPrimary: true,
          source: 'kitsu-mapping',
          confidence: 0.9,
        },
      ],
      source: 'kitsu-mapping',
      confidence: 0.9,
      sourceUpdatedAt: Date.now(),
    });

    assert.equal(getCanonicalSeriesMapping('kitsu', '42765')?.identity.canonicalSeriesId, 'tmdb:46298');
    assert.equal(getCanonicalSeriesMapping('mal', '5114'), null);
  });
});

test('canonical series cache drops orphaned mapping rows when a lookup is reassigned to a new canonical id', async (t) => {
  await withTempDataDir(t, async () => {
    setCanonicalSeriesMapping({
      canonicalSeriesId: 'tmdb:46298',
      provider: 'kitsu',
      externalId: '42765',
      mediaType: 'tv',
      mappedIds: { kitsu: '42765', tmdb: '46298' },
      links: [
        {
          provider: 'kitsu',
          externalId: '42765',
          isPrimary: true,
          source: 'raw',
          confidence: 1,
        },
      ],
      source: 'raw',
      confidence: 1,
      sourceUpdatedAt: Date.now(),
    });

    setCanonicalSeriesMapping({
      canonicalSeriesId: 'tmdb:99999',
      provider: 'kitsu',
      externalId: '42765',
      mediaType: 'tv',
      mappedIds: { kitsu: '42765', tmdb: '99999' },
      links: [
        {
          provider: 'kitsu',
          externalId: '42765',
          isPrimary: true,
          source: 'override',
          confidence: 1,
        },
      ],
      source: 'override',
      confidence: 1,
      sourceUpdatedAt: Date.now(),
    });

    const rows = getDb()
      .prepare(
        `SELECT canonical_series_id
         FROM canonical_series_mappings
         ORDER BY canonical_series_id`,
      )
      .all();

    assert.deepEqual(rows, [{ canonical_series_id: 'tmdb:99999' }]);
  });
});

test('canonical episode cache removes superseded provider refs on rewrite', async (t) => {
  await withTempDataDir(t, async () => {
    const staleLookupKey = buildCanonicalEpisodeLookupKey('mal', '5114', '2', '1', '13');
    setCanonicalEpisodeMapping({
      canonicalEpisodeId: 'tmdb:46298:ep2-1',
      canonicalSeriesId: 'tmdb:46298',
      season: '2',
      episode: '1',
      absoluteEpisode: '13',
      mappedIds: { tmdb: '46298' },
      providerRefs: [
        {
          provider: 'mal',
          seriesExternalId: '5114',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '13',
          source: 'reverse-mapping',
          confidence: 0.9,
        },
        {
          provider: 'tmdb',
          seriesExternalId: '46298',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '13',
          source: 'reverse-mapping',
          confidence: 0.9,
        },
      ],
      source: 'reverse-mapping',
      confidence: 0.9,
    });

    setCanonicalEpisodeMapping({
      canonicalEpisodeId: 'tmdb:46298:ep2-1',
      canonicalSeriesId: 'tmdb:46298',
      season: '2',
      episode: '1',
      absoluteEpisode: '13',
      mappedIds: { tmdb: '46298' },
      providerRefs: [
        {
          provider: 'tmdb',
          seriesExternalId: '46298',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '13',
          source: 'reverse-mapping',
          confidence: 0.9,
        },
      ],
      source: 'reverse-mapping',
      confidence: 0.9,
    });

    assert.equal(getCanonicalEpisodeMapping(staleLookupKey), null);
  });
});

test('episode overrides are materialized for mapped provider episode lookups immediately', async (t) => {
  await withTempDataDir(t, async () => {
    const updatedAt = Date.now();
    upsertCanonicalMappingOverride({
      lookupKey: 'episode:mal:11061:s:2:e:1:a:25',
      scope: 'episode',
      provider: 'mal',
      externalKey: '11061:s:2:e:1',
      payload: {
        canonicalEpisodeId: 'mal:11061:split-cour-1',
        canonicalSeriesId: 'mal:11061',
        season: '3',
        episode: '1',
        absoluteEpisode: '25',
        mappedIds: { mal: '11061', tmdb: '1001' },
        providerRefs: [
          {
            provider: 'mal',
            seriesExternalId: '11061',
            seasonNumber: '2',
            episodeNumber: '1',
            absoluteEpisodeNumber: '25',
            source: 'override',
            confidence: 1,
          },
        ],
        source: 'override',
        confidence: 1,
      },
      reason: 'materialize mapped episode override',
      updatedAt,
    });

    const tmdbLookup = getCanonicalEpisodeMapping(
      buildCanonicalEpisodeLookupKey('tmdb', '1001', '3', '1', '25'),
    );

    assert.equal(tmdbLookup?.identity.canonicalEpisodeId, 'mal:11061:split-cour-1');
    assert.equal(tmdbLookup?.identity.source, 'override');
  });
});

test('xrdbid-backed requests reuse imdb-keyed episode overrides', async (t) => {
  await withTempDataDir(t, async () => {
    const updatedAt = Date.now();
    upsertCanonicalMappingOverride({
      lookupKey: 'series:imdb:tt12343534',
      scope: 'series',
      provider: 'imdb',
      externalKey: 'tt12343534',
      payload: {
        canonicalSeriesId: 'tmdb:99999',
        provider: 'imdb',
        externalId: 'tt12343534',
        mediaType: 'tv',
        mappedIds: { imdb: 'tt12343534', tmdb: '99999' },
        links: [],
        source: 'override',
        confidence: 1,
        sourceUpdatedAt: updatedAt,
      },
      reason: 'xrdbid series bridge',
      updatedAt,
    });
    upsertCanonicalMappingOverride({
      lookupKey: 'episode:imdb:tt12343534:s:1:e:7:a:-',
      scope: 'episode',
      provider: 'imdb',
      externalKey: 'tt12343534:s:1:e:7',
      payload: {
        canonicalEpisodeId: 'tmdb:99999:ep1-7',
        canonicalSeriesId: 'tmdb:99999',
        season: '1',
        episode: '7',
        absoluteEpisode: null,
        mappedIds: { imdb: 'tt12343534', tmdb: '99999' },
        providerRefs: [
          {
            provider: 'imdb',
            seriesExternalId: 'tt12343534',
            seasonNumber: '1',
            episodeNumber: '7',
            absoluteEpisodeNumber: null,
            source: 'override',
            confidence: 1,
          },
        ],
        source: 'override',
        confidence: 1,
      },
      reason: 'xrdbid episode bridge',
      updatedAt,
    });

    const series = await resolveCanonicalSeriesIdentity({
      input: {
        rawId: 'xrdbid:tt12343534',
        rawProvider: 'xrdbid',
        rawExternalId: 'tt12343534',
        mediaType: 'tv',
        season: '1',
        episode: '7',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      phases,
      fetchJsonCached: async () => {
        throw new Error('xrdbid series lookup should not fall through');
      },
    });

    const episode = await resolveCanonicalEpisodeIdentity({
      input: {
        rawId: 'xrdbid:tt12343534',
        rawProvider: 'xrdbid',
        rawExternalId: 'tt12343534',
        mediaType: 'tv',
        season: '1',
        episode: '7',
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      series,
      phases,
      fetchJsonCached: async () => {
        throw new Error('xrdbid episode override should not fall through to provider fetches');
      },
    });

    assert.equal(episode.canonicalEpisodeId, 'tmdb:99999:ep1-7');
    assert.equal(episode.source, 'override');
  });
});

test('canonical episode cache drops orphaned mapping rows when a lookup is reassigned to a new canonical id', async (t) => {
  await withTempDataDir(t, async () => {
    setCanonicalEpisodeMapping({
      canonicalEpisodeId: 'tmdb:46298:ep2-1',
      canonicalSeriesId: 'tmdb:46298',
      season: '2',
      episode: '1',
      absoluteEpisode: '13',
      mappedIds: { tmdb: '46298' },
      providerRefs: [
        {
          provider: 'mal',
          seriesExternalId: '5114',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '13',
          source: 'raw',
          confidence: 1,
        },
      ],
      source: 'raw',
      confidence: 1,
    });

    setCanonicalEpisodeMapping({
      canonicalEpisodeId: 'tmdb:99999:ep3-1',
      canonicalSeriesId: 'tmdb:99999',
      season: '3',
      episode: '1',
      absoluteEpisode: '25',
      mappedIds: { tmdb: '99999' },
      providerRefs: [
        {
          provider: 'mal',
          seriesExternalId: '5114',
          seasonNumber: '2',
          episodeNumber: '1',
          absoluteEpisodeNumber: '13',
          source: 'override',
          confidence: 1,
        },
      ],
      source: 'override',
      confidence: 1,
    });

    const rows = getDb()
      .prepare(
        `SELECT canonical_episode_id
         FROM canonical_episode_mappings
         ORDER BY canonical_episode_id`,
      )
      .all();

    assert.deepEqual(rows, [{ canonical_episode_id: 'tmdb:99999:ep3-1' }]);
  });
});

test('override upsert rolls back fully when series materialization is invalid', async (t) => {
  await withTempDataDir(t, async () => {
    assert.throws(
      () => {
        upsertCanonicalMappingOverride({
          lookupKey: 'series:kitsu:42765',
          scope: 'series',
          provider: 'kitsu',
          externalKey: '42765',
          payload: {
            canonicalSeriesId: null,
            provider: 'kitsu',
            externalId: '42765',
            mediaType: 'tv',
            mappedIds: { kitsu: '42765' },
            links: [],
            source: 'override',
            confidence: 1,
            sourceUpdatedAt: Date.now(),
          },
          reason: 'invalid override probe',
          updatedAt: Date.now(),
        });
      },
      /canonicalSeriesId must be a non-empty string/,
    );

    const overrideRows = getDb()
      .prepare(
        `SELECT lookup_key
         FROM canonical_mapping_overrides`,
      )
      .all();
    const boundaryRow = getDb()
      .prepare(
        `SELECT value
         FROM config_meta
         WHERE key = 'canonical_cache_invalid_before'`,
      )
      .get();
    const seriesRows = getDb()
      .prepare(
        `SELECT canonical_series_id
         FROM canonical_series_mappings`,
      )
      .all();

    assert.deepEqual(overrideRows, []);
    assert.equal(boundaryRow, undefined);
    assert.deepEqual(seriesRows, []);
  });
});
test('canonical series resolution fails open when mapping host is unreachable', async (t) => {
  await withTempDataDir(t, async () => {
    const fetchJsonCached = async () => {
      throw new Error('getaddrinfo ENOTFOUND animemapping.stremio.dpdns.org');
    };

    const series = await resolveCanonicalSeriesIdentity({
      input: {
        rawId: 'kitsu:42765',
        rawProvider: 'kitsu',
        rawExternalId: '42765',
        mediaType: 'tv',
        season: null,
        episode: null,
        absoluteEpisode: null,
        episodeProvider: null,
        episodeSourceId: null,
        episodeSourceSeason: null,
        episodeSourceEpisode: null,
        episodeAbsolute: null,
        tmdbEpOrder: 'tmdb',
      },
      phases,
      fetchJsonCached,
    });

    assert.equal(series.provider, 'kitsu');
    assert.equal(series.externalId, '42765');
    assert.equal(series.source, 'raw');
    assert.equal(series.mappedIds.tmdb, undefined);
  });
});
