import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectMDBListRatings,
  isTmdbAnimationTitle,
  normalizeRatingValue,
  outputFormatToContentType,
  outputFormatToExtension,
  pickOutputFormat,
  shouldRenderRatingValue,
} from '../lib/imageRouteMedia.ts';

test('image route media picks output formats predictably', () => {
  assert.equal(pickOutputFormat('logo', 'image/webp'), 'png');
  assert.equal(pickOutputFormat('poster', 'image/webp,image/*'), 'webp');
  assert.equal(pickOutputFormat('backdrop', 'image/jpeg'), 'jpeg');
  assert.equal(outputFormatToContentType('webp'), 'image/webp');
  assert.equal(outputFormatToExtension('jpeg'), 'jpg');
});

test('image route media normalizes rating values and skips empty render values', () => {
  assert.equal(normalizeRatingValue(7.34), '7.3');
  assert.equal(normalizeRatingValue({ score: '8,1' }), '8.1');
  assert.equal(normalizeRatingValue(0), null);
  assert.equal(normalizeRatingValue('0.04'), null);
  assert.equal(normalizeRatingValue(''), null);
  assert.equal(shouldRenderRatingValue('N/A'), false);
  assert.equal(shouldRenderRatingValue('0'), false);
  assert.equal(shouldRenderRatingValue('7.4'), true);
});

test('image route media detects animation titles from TMDB payloads', () => {
  assert.equal(isTmdbAnimationTitle({ genre_ids: [16] }), true);
  assert.equal(isTmdbAnimationTitle({ genres: [{ name: 'Animation' }] }), true);
  assert.equal(isTmdbAnimationTitle({ genre_ids: [18] }), false);
});

test('image route media collects MDBList ratings safely', () => {
  const ratings = collectMDBListRatings({
    ratings: [
      { source: 'IMDb', value: '7.4' },
      { source: 'MDBList', value: '-1' },
      { source: 'Rotten Tomatoes', value: '91' },
    ],
    mdblist_score: '82',
  });

  assert.equal(ratings.get('imdb'), '7.4');
  assert.equal(ratings.get('tomatoes'), '91');
  assert.equal(ratings.get('mdblist'), '82');
});

test('image route media drops zero MDBList provider entries that represent missing titles', () => {
  const ratings = collectMDBListRatings({
    ratings: [
      { source: 'IMDb', value: '0' },
      { source: 'Rotten Tomatoes', value: '0.04' },
      { source: 'Metacritic', value: '61' },
    ],
    mdblist_score: '0',
  });

  assert.equal(ratings.has('imdb'), false);
  assert.equal(ratings.has('tomatoes'), false);
  assert.equal(ratings.has('mdblist'), false);
  assert.equal(ratings.get('metacritic'), '61');
});
