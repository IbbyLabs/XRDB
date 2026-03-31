import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
