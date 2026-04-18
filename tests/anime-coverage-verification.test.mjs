import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveCanonicalEpisodeIdentity } from '../lib/canonicalAnimeIdentity/episodeResolver.ts';
import { resolveCanonicalSeriesIdentity } from '../lib/canonicalAnimeIdentity/seriesResolver.ts';
import { upsertCanonicalMappingOverride } from '../lib/canonicalAnimeIdentity/overrides.ts';
import { buildCanonicalEpisodeLookupKey } from '../lib/canonicalAnimeIdentity/cache.ts';
import { resolveImageRouteMediaTarget } from '../lib/imageRouteMediaTarget.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

const withTempDataDir = async (t, callback) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'xrdb-anime-coverage-'));
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

test('anime coverage verification set keeps automatic and override-required classes visible', async (t) => {
  await withTempDataDir(t, async () => {
    const automaticMainstreamSeasonBased = await (async () => {
      const fetchJsonCached = async () => ({
        ok: true,
        status: 200,
        data: {
          mappings: {
            ids: {
              tmdb: '46298',
              mal: '5114',
            },
            tmdb_episode: {
              id: '46298',
              season_number: 2,
              episode_number: 1,
            },
          },
        },
      });

      const series = await resolveCanonicalSeriesIdentity({
        input: {
          rawId: 'mal:5114',
          rawProvider: 'mal',
          rawExternalId: '5114',
          mediaType: 'tv',
          season: '2',
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

      const episode = await resolveCanonicalEpisodeIdentity({
        input: {
          rawId: 'mal:5114',
          rawProvider: 'mal',
          rawExternalId: '5114',
          mediaType: 'tv',
          season: '2',
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
        fetchJsonCached,
      });

      return {
        id: 'mainstream-season-based-mal',
        resolutionClass: 'automatic',
        season: episode.season,
        episode: episode.episode,
        source: episode.source,
      };
    })();

    const automaticMixedProvider = await (async () => {
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

      const series = await resolveCanonicalSeriesIdentity({
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
        phases,
        fetchJsonCached,
      });

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

      return {
        id: 'mixed-provider-imdb-plus-kitsu',
        resolutionClass: 'automatic',
        season: episode.season,
        episode: episode.episode,
        source: episode.source,
      };
    })();

    const automaticKitsuShorthand = await (async () => {
      const result = await resolveImageRouteMediaTarget({
        imageType: 'backdrop',
        isThumbnailRequest: true,
        tmdbKey: 'tmdb-key',
        phases: { ...phases },
        fetchJsonCached: async (key) => {
          if (key === 'anime:kitsu:42765:s:-:e:7' || key === 'kitsu:mapping:42765:7') {
            return {
              ok: true,
              status: 200,
              data: {
                mappings: {
                  ids: {
                    imdb: 'tt12343534',
                  },
                  tmdb_episode: {
                    id: '46298',
                    season_number: 2,
                    episode_number: 7,
                  },
                },
              },
            };
          }
          if (key === 'tmdb:tv:46298') {
            return {
              ok: true,
              status: 200,
              data: { id: 46298, name: 'Mapped Show', number_of_seasons: 2 },
            };
          }
          if (key === 'tmdb:tv:46298:season:1' || key === 'tmdb:tv:46298:season:2') {
            return {
              ok: true,
              status: 200,
              data: {
                episodes: Array(12).fill(null).map((_, index) => ({ episode_number: index + 1 })),
              },
            };
          }
          throw new Error(`Unexpected key: ${key}`);
        },
        fetchTextCached: async () => ({ ok: false, status: 404, data: null }),
        mediaId: '42765',
        season: null,
        episode: '7',
        isTmdb: false,
        isTvdb: false,
        isCanonId: false,
        isKitsu: true,
        inputAnimeMappingProvider: null,
        inputAnimeMappingExternalId: null,
        cleanId: 'kitsu:42765',
        idPrefix: 'kitsu',
        explicitTmdbMediaType: null,
        tvdbSeriesId: null,
        hasNativeAnimeInput: true,
        allowAnimeOnlyRatings: false,
        hasConfirmedAnimeMapping: false,
        tmdbEpOrder: 'tmdb',
      });

      return {
        id: 'kitsu-shorthand',
        resolutionClass: 'automatic',
        season: result.season,
        episode: result.episode,
        mediaType: result.mediaType,
      };
    })();

    const automaticConsolidatedSeason = await (async () => {
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
        fetchJsonCached: async (key) => {
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
        },
        tmdbKey: 'tmdb-key',
        applyTmdbConsolidatedRemap: true,
      });

      return {
        id: 'consolidated-tmdb-season',
        resolutionClass: 'automatic',
        season: episode.season,
        episode: episode.episode,
      };
    })();

    const specialOverride = await (async () => {
      const lookupKey = buildCanonicalEpisodeLookupKey('mal', '5114', '0', '1', null);
      upsertCanonicalMappingOverride({
        lookupKey: `episode:${lookupKey}`,
        scope: 'episode',
        provider: 'mal',
        externalKey: '5114:s:0:e:1',
        payload: {
          canonicalEpisodeId: 'mal:5114:special-1',
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
        reason: 'Special numbering disagrees with inferred mapping',
        updatedAt: Date.now(),
      });

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
        series: {
          canonicalSeriesId: 'mal:5114',
          provider: 'mal',
          externalId: '5114',
          mediaType: 'tv',
          mappedIds: { mal: '5114', tmdb: '999' },
          links: [],
          source: 'raw',
          confidence: 0.5,
          sourceUpdatedAt: Date.now(),
        },
        phases,
        fetchJsonCached: async () => {
          throw new Error('special override case should not need provider fetches');
        },
      });

      return {
        id: 'special-override',
        resolutionClass: 'override-required',
        season: episode.season,
        episode: episode.episode,
        source: episode.source,
      };
    })();

    const ovaOverride = await (async () => {
      const lookupKey = buildCanonicalEpisodeLookupKey('mal', '5114', '0', '2', null);
      upsertCanonicalMappingOverride({
        lookupKey: `episode:${lookupKey}`,
        scope: 'episode',
        provider: 'mal',
        externalKey: '5114:s:0:e:2',
        payload: {
          canonicalEpisodeId: 'mal:5114:ova-2',
          canonicalSeriesId: 'mal:5114',
          season: '0',
          episode: '2',
          absoluteEpisode: null,
          mappedIds: { tmdb: '999' },
          providerRefs: [
            {
              provider: 'mal',
              seriesExternalId: '5114',
              seasonNumber: '0',
              episodeNumber: '2',
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

      const episode = await resolveCanonicalEpisodeIdentity({
        input: {
          rawId: 'mal:5114',
          rawProvider: 'mal',
          rawExternalId: '5114',
          mediaType: 'tv',
          season: '0',
          episode: '2',
          absoluteEpisode: null,
          episodeProvider: null,
          episodeSourceId: null,
          episodeSourceSeason: null,
          episodeSourceEpisode: null,
          episodeAbsolute: null,
          tmdbEpOrder: 'tmdb',
        },
        series: {
          canonicalSeriesId: 'mal:5114',
          provider: 'mal',
          externalId: '5114',
          mediaType: 'tv',
          mappedIds: { mal: '5114', tmdb: '999' },
          links: [],
          source: 'raw',
          confidence: 0.5,
          sourceUpdatedAt: Date.now(),
        },
        phases,
        fetchJsonCached: async () => {
          throw new Error('override case should not need provider fetches');
        },
      });

      return {
        id: 'ova-override',
        resolutionClass: 'override-required',
        season: episode.season,
        episode: episode.episode,
        source: episode.source,
      };
    })();

    const splitCourOverride = await (async () => {
      const lookupKey = buildCanonicalEpisodeLookupKey('mal', '11061', '2', '1', '25');
      upsertCanonicalMappingOverride({
        lookupKey: `episode:${lookupKey}`,
        scope: 'episode',
        provider: 'mal',
        externalKey: '11061:s:2:e:1',
        payload: {
          canonicalEpisodeId: 'mal:11061:split-cour-1',
          canonicalSeriesId: 'mal:11061',
          season: '3',
          episode: '1',
          absoluteEpisode: '25',
          mappedIds: { tmdb: '1001' },
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
        reason: 'Split cour sequel needs manual correction',
        updatedAt: Date.now(),
      });

      const episode = await resolveCanonicalEpisodeIdentity({
        input: {
          rawId: 'mal:11061',
          rawProvider: 'mal',
          rawExternalId: '11061',
          mediaType: 'tv',
          season: '2',
          episode: '1',
          absoluteEpisode: '25',
          episodeProvider: null,
          episodeSourceId: null,
          episodeSourceSeason: null,
          episodeSourceEpisode: null,
          episodeAbsolute: null,
          tmdbEpOrder: 'tmdb',
        },
        series: {
          canonicalSeriesId: 'mal:11061',
          provider: 'mal',
          externalId: '11061',
          mediaType: 'tv',
          mappedIds: { mal: '11061', tmdb: '1001' },
          links: [],
          source: 'raw',
          confidence: 0.5,
          sourceUpdatedAt: Date.now(),
        },
        phases,
        fetchJsonCached: async () => {
          throw new Error('split cour override case should not need provider fetches');
        },
      });

      return {
        id: 'split-cour-override',
        resolutionClass: 'override-required',
        season: episode.season,
        episode: episode.episode,
        source: episode.source,
      };
    })();

    const matrix = [
      automaticMainstreamSeasonBased,
      automaticMixedProvider,
      automaticKitsuShorthand,
      automaticConsolidatedSeason,
      specialOverride,
      ovaOverride,
      splitCourOverride,
    ];

    assert.deepEqual(
      matrix.map((entry) => [entry.id, entry.resolutionClass]),
      [
        ['mainstream-season-based-mal', 'automatic'],
        ['mixed-provider-imdb-plus-kitsu', 'automatic'],
        ['kitsu-shorthand', 'automatic'],
        ['consolidated-tmdb-season', 'automatic'],
        ['special-override', 'override-required'],
        ['ova-override', 'override-required'],
        ['split-cour-override', 'override-required'],
      ],
    );
    assert.equal(automaticMainstreamSeasonBased.season, '2');
    assert.equal(automaticMainstreamSeasonBased.episode, '1');
    assert.notEqual(automaticMainstreamSeasonBased.source, 'raw');
    assert.equal(automaticMixedProvider.season, '2');
    assert.equal(automaticMixedProvider.episode, '1');
    assert.notEqual(automaticMixedProvider.source, 'raw');
    assert.equal(automaticKitsuShorthand.mediaType, 'tv');
    assert.equal(automaticKitsuShorthand.season, '2');
    assert.equal(automaticKitsuShorthand.episode, '7');
    assert.equal(automaticConsolidatedSeason.season, '2');
    assert.equal(automaticConsolidatedSeason.episode, '3');
    assert.equal(specialOverride.source, 'override');
    assert.equal(ovaOverride.source, 'override');
    assert.equal(splitCourOverride.source, 'override');
  });
});