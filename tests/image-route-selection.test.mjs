import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fanartAssetsToUrls,
  isTextlessPosterSelection,
  normalizeFanartLanguage,
  pickBackdropByPreference,
  pickDeterministicItemBySeed,
  pickFanartUrlByPreference,
  pickPosterByPreference,
  selectFanartAssets,
} from '../lib/imageRouteSelection.ts';

test('image route selection picks deterministic seeded items', () => {
  const items = ['a', 'b', 'c'];
  assert.equal(pickDeterministicItemBySeed(items, 'seed'), pickDeterministicItemBySeed(items, 'seed'));
  assert.equal(pickDeterministicItemBySeed([], 'seed'), null);
});

test('image route selection handles poster and backdrop preferences', () => {
  const images = [
    { file_path: '/original', iso_639_1: 'en' },
    { file_path: '/clean', iso_639_1: null },
    { file_path: '/alt', iso_639_1: 'fr' },
  ];

  assert.equal(
    pickPosterByPreference(images, 'clean', 'en', 'fr')?.file_path,
    '/clean',
  );
  assert.equal(
    pickPosterByPreference(images, 'original', 'en', 'fr', '/original')?.file_path,
    '/original',
  );
  assert.equal(
    pickBackdropByPreference(images, 'alternative', 'en', 'fr', '/original')?.file_path,
    '/alt',
  );
  assert.equal(isTextlessPosterSelection(images, { file_path: '/clean' }), true);
});

test('image route selection keeps random picks stable per seed', () => {
  const images = [
    { file_path: '/a', iso_639_1: 'en' },
    { file_path: '/b', iso_639_1: 'en' },
    { file_path: '/c', iso_639_1: 'en' },
  ];

  const first = pickPosterByPreference(images, 'random', 'en', 'fr', null, 'abc')?.file_path;
  const second = pickPosterByPreference(images, 'random', 'en', 'fr', null, 'abc')?.file_path;
  assert.equal(first, second);
});

test('image route selection ranks fanart assets by language and likes', () => {
  const assets = [
    { url: 'https://img/one', lang: 'fr', likes: '20' },
    { url: 'https://img/two', lang: 'en', likes: '2' },
    { url: 'https://img/three', lang: '', likes: '50' },
  ];

  const selected = selectFanartAssets(assets, 'en', 'fr');
  assert.deepEqual(selected.map((asset) => asset.url), [
    'https://img/two',
    'https://img/one',
    'https://img/three',
  ]);
  assert.equal(normalizeFanartLanguage('00'), null);
  assert.deepEqual(fanartAssetsToUrls(selected), [
    'https://img/two',
    'https://img/one',
    'https://img/three',
  ]);
});

test('image route selection applies fanart preferences safely', () => {
  const urls = ['https://img/a', 'https://img/b', 'https://img/a'];
  const first = pickFanartUrlByPreference(urls, 'random', 'fan');
  const second = pickFanartUrlByPreference(urls, 'random', 'fan');

  assert.equal(pickFanartUrlByPreference(urls, 'original'), 'https://img/a');
  assert.equal(pickFanartUrlByPreference(urls, 'alternative'), 'https://img/b');
  assert.equal(first, second);
});
