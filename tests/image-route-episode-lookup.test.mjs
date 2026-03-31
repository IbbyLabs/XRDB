import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractTvdbEpisodeIdFromAiredOrderHtml,
  resolveTvdbEpisodeToTmdb,
  resolveTmdbEpisodeByAirYear,
} from '../lib/imageRouteEpisodeLookup.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

test('image route episode lookup extracts a TVDB episode id from aired order markup', () => {
  const html = `
    <section>
      <span>S02E03</span>
      <a href="/series/example-show/episodes/123456">Name</a>
    </section>
  `;

  assert.equal(
    extractTvdbEpisodeIdFromAiredOrderHtml(
      html,
      'https://thetvdb.com/series/example-show',
      '2',
      '3',
    ),
    '123456',
  );
  assert.equal(
    extractTvdbEpisodeIdFromAiredOrderHtml(
      html,
      'https://thetvdb.com/series/example-show',
      'x',
      '3',
    ),
    null,
  );
});

test('image route episode lookup resolves TVDB aired order episodes through TMDB find', async () => {
  const requested = [];
  const fetchTextCached = async (key, url) => {
    requested.push({ key, url, kind: 'text' });
    return {
      ok: true,
      status: 200,
      data: '<span>S01E02</span><a href="/series/example-show/episodes/987654">Name</a>',
    };
  };
  const fetchJsonCached = async (key, url) => {
    requested.push({ key, url, kind: 'json' });
    return {
      ok: true,
      status: 200,
      data: {
        tv_episode_results: [
          {
            show_id: 321,
            season_number: 4,
            episode_number: 5,
          },
        ],
      },
    };
  };
  const fetchImpl = async () => ({
    ok: true,
    url: 'https://thetvdb.com/series/example-show',
  });

  const mapping = await resolveTvdbEpisodeToTmdb(
    'example-show',
    '1',
    '2',
    'tmdb-key',
    { ...phases },
    fetchJsonCached,
    fetchTextCached,
    fetchImpl,
  );

  assert.deepEqual(mapping, {
    showId: '321',
    season: '4',
    episode: '5',
  });
  assert.deepEqual(requested, [
    {
      key: 'tvdb:series:example-show:aired-order',
      url: 'https://thetvdb.com/series/example-show/allseasons/official',
      kind: 'text',
    },
    {
      key: 'tmdb:find:tvdb-episode:987654',
      url: 'https://api.themoviedb.org/3/find/987654?api_key=tmdb-key&external_source=tvdb_id',
      kind: 'json',
    },
  ]);
});

test('image route episode lookup remaps air year buckets into TMDB season and episode numbers', async () => {
  const requested = [];
  const fetchJsonCached = async (key) => {
    requested.push(key);
    if (key === 'tmdb:tv:777') {
      return {
        ok: true,
        status: 200,
        data: { number_of_seasons: 2 },
      };
    }
    if (key === 'tmdb:tv:777:season:1') {
      return {
        ok: true,
        status: 200,
        data: {
          episodes: [
            { air_date: '2020-01-05', episode_number: 1 },
            { air_date: '2020-01-12', episode_number: 2 },
          ],
        },
      };
    }
    if (key === 'tmdb:tv:777:season:2') {
      return {
        ok: true,
        status: 200,
        data: {
          episodes: [
            { air_date: '2021-01-05', episode_number: 1 },
            { air_date: '2021-01-12', episode_number: 2 },
          ],
        },
      };
    }
    return { ok: false, status: 404, data: null };
  };

  const mapping = await resolveTmdbEpisodeByAirYear(
    '777',
    '2',
    '2',
    'tmdb-key',
    { ...phases },
    fetchJsonCached,
  );

  assert.deepEqual(mapping, {
    showId: '777',
    season: '2',
    episode: '2',
  });
  assert.deepEqual(requested, [
    'tmdb:tv:777',
    'tmdb:tv:777:season:1',
    'tmdb:tv:777:season:2',
  ]);
});
