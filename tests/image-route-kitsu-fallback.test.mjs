import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchAniListFallbackAsset,
  fetchMyAnimeListFallbackAsset,
  fetchKitsuFallbackAsset,
  normalizeKitsuTitleCandidate,
  pickKitsuImageUrl,
  pickKitsuOriginalTitle,
  pickPosterTitleFromMedia,
} from '../lib/imageRouteKitsuFallback.ts';

const phases = {
  auth: 0,
  tmdb: 0,
  mdb: 0,
  fanart: 0,
  stream: 0,
  render: 0,
};

test('image route kitsu fallback normalizes titles and picks best image candidates', () => {
  assert.equal(normalizeKitsuTitleCandidate('  Example   Title  '), 'Example Title');
  assert.equal(normalizeKitsuTitleCandidate(42), null);
  assert.equal(
    pickKitsuImageUrl({
      medium: ' ',
      small: 'https://img.test/small.jpg',
    }),
    'https://img.test/small.jpg',
  );
  assert.equal(
    pickKitsuOriginalTitle({
      canonicalTitle: 'Example',
      titles: {
        ja_jp: 'Japanese',
      },
    }),
    'Example',
  );
});

test('image route kitsu fallback picks poster titles from media and fallback text', () => {
  assert.equal(
    pickPosterTitleFromMedia(
      {
        name: '  Show Name  ',
      },
      'tv',
      null,
    ),
    'Show Name',
  );
  assert.equal(
    pickPosterTitleFromMedia(
      {},
      'movie',
      '  Backup Title  ',
    ),
    'Backup Title',
  );
});

test('image route kitsu fallback builds poster backdrop and logo assets', async () => {
  const fetchJsonCached = async () => ({
    ok: true,
    status: 200,
    data: {
      data: {
        attributes: {
          averageRating: '79.4',
          canonicalTitle: 'Example Show',
          posterImage: {
            medium: 'https://img.test/poster.jpg',
          },
          coverImage: {
            original: 'https://img.test/cover.jpg',
          },
        },
      },
    },
  });

  const poster = await fetchKitsuFallbackAsset('55', 'poster', phases, fetchJsonCached);
  const backdrop = await fetchKitsuFallbackAsset('55', 'backdrop', phases, fetchJsonCached);
  const logo = await fetchKitsuFallbackAsset('55', 'logo', phases, fetchJsonCached);

  assert.deepEqual(poster, {
    imageUrl: 'https://img.test/poster.jpg',
    rating: '79.4',
    title: 'Example Show',
    logoAspectRatio: null,
  });
  assert.deepEqual(backdrop, {
    imageUrl: 'https://img.test/cover.jpg',
    rating: '79.4',
    title: 'Example Show',
    logoAspectRatio: null,
  });
  assert.equal(logo?.rating, '79.4');
  assert.equal(logo?.title, 'Example Show');
  assert.match(String(logo?.imageUrl), /^data:image\/svg\+xml,/);
  assert.equal(typeof logo?.logoAspectRatio, 'number');
});

test('image route provider fallback builds MAL assets via Jikan fallback', async () => {
  const fetchJsonCached = async (key) => {
    if (key.startsWith('jikan:anime:16498:details')) {
      return {
        ok: true,
        status: 200,
        data: {
          data: {
            title: 'Shingeki no Kyojin',
            score: 8.57,
            images: {
              jpg: {
                large_image_url: 'https://cdn.example/aot-large.jpg',
              },
            },
          },
        },
      };
    }

    return { ok: false, status: 404, data: null };
  };

  const poster = await fetchMyAnimeListFallbackAsset('mal:16498', 'poster', phases, fetchJsonCached);
  const logo = await fetchMyAnimeListFallbackAsset('16498', 'logo', phases, fetchJsonCached);

  assert.equal(poster?.imageUrl, 'https://cdn.example/aot-large.jpg');
  assert.equal(poster?.rating, '8.6');
  assert.equal(poster?.title, 'Shingeki no Kyojin');
  assert.match(String(logo?.imageUrl), /^data:image\/svg\+xml,/);
});

test('image route provider fallback keeps MAL rating and title when artwork is missing', async () => {
  const fetchJsonCached = async (key) => {
    if (key.startsWith('jikan:anime:16498:details')) {
      return {
        ok: true,
        status: 200,
        data: {
          data: {
            title: 'Shingeki no Kyojin',
            score: 8.57,
            images: {},
          },
        },
      };
    }

    return { ok: false, status: 404, data: null };
  };

  const poster = await fetchMyAnimeListFallbackAsset('mal:16498', 'poster', phases, fetchJsonCached);

  assert.deepEqual(poster, {
    imageUrl: null,
    rating: '8.6',
    title: 'Shingeki no Kyojin',
    logoAspectRatio: null,
  });
});

test('image route provider fallback builds AniList assets', async () => {
  const fetchJsonCached = async (key) => {
    if (key.startsWith('anilist:anime:16498:details')) {
      return {
        ok: true,
        status: 200,
        data: {
          data: {
            Media: {
              title: {
                romaji: 'Shingeki no Kyojin',
              },
              averageScore: 85,
              coverImage: {
                extraLarge: 'https://cdn.example/anilist-cover.jpg',
              },
              bannerImage: 'https://cdn.example/anilist-banner.jpg',
            },
          },
        },
      };
    }

    return { ok: false, status: 404, data: null };
  };

  const poster = await fetchAniListFallbackAsset('anilist:16498', 'poster', phases, fetchJsonCached);
  const backdrop = await fetchAniListFallbackAsset('16498', 'backdrop', phases, fetchJsonCached);

  assert.equal(poster?.imageUrl, 'https://cdn.example/anilist-cover.jpg');
  assert.equal(poster?.rating, '85');
  assert.equal(backdrop?.imageUrl, 'https://cdn.example/anilist-banner.jpg');
});

test('image route provider fallback keeps AniList rating and title when artwork is missing', async () => {
  const fetchJsonCached = async (key) => {
    if (key.startsWith('anilist:anime:16498:details')) {
      return {
        ok: true,
        status: 200,
        data: {
          data: {
            Media: {
              title: {
                romaji: 'Shingeki no Kyojin',
              },
              averageScore: 85,
              coverImage: null,
              bannerImage: null,
            },
          },
        },
      };
    }

    return { ok: false, status: 404, data: null };
  };

  const poster = await fetchAniListFallbackAsset('anilist:16498', 'poster', phases, fetchJsonCached);

  assert.deepEqual(poster, {
    imageUrl: null,
    rating: '85',
    title: 'Shingeki no Kyojin',
    logoAspectRatio: null,
  });
});
