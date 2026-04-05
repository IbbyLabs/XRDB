import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fanartAssetsToUrls,
  isTextlessPosterSelection,
  isTextlessFanartAsset,
  normalizeFanartLanguage,
  pickBackdropByPreference,
  pickDeterministicItemBySeed,
  pickFanartPosterByPreference,
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

test('image route selection picks textless poster when textless preference is set', () => {
  const images = [
    { file_path: '/original', iso_639_1: 'en' },
    { file_path: '/textless', iso_639_1: null },
    { file_path: '/alt', iso_639_1: 'fr' },
  ];

  assert.equal(
    pickPosterByPreference(images, 'textless', 'en', 'fr')?.file_path,
    '/textless',
  );
});

test('image route selection falls back to language poster when no textless poster exists', () => {
  const images = [
    { file_path: '/original', iso_639_1: 'en' },
    { file_path: '/alt', iso_639_1: 'fr' },
  ];

  assert.equal(
    pickPosterByPreference(images, 'textless', 'en', 'fr')?.file_path,
    '/original',
  );
});

test('image route selection picks textless backdrop when textless preference is set', () => {
  const images = [
    { file_path: '/original', iso_639_1: 'en' },
    { file_path: '/textless', iso_639_1: null },
    { file_path: '/alt', iso_639_1: 'fr' },
  ];

  assert.equal(
    pickBackdropByPreference(images, 'textless', 'en', 'fr')?.file_path,
    '/textless',
  );
});

test('image route selection falls back to language backdrop when no textless backdrop exists', () => {
  const images = [
    { file_path: '/original', iso_639_1: 'en' },
    { file_path: '/alt', iso_639_1: 'fr' },
  ];

  assert.equal(
    pickBackdropByPreference(images, 'textless', 'en', 'fr')?.file_path,
    '/original',
  );
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

test('image route selection applies random poster filters and deterministic fallback rules', () => {
  const images = [
    { file_path: '/a', iso_639_1: 'en', vote_average: 8, vote_count: 100, width: 1000, height: 1500 },
    { file_path: '/b', iso_639_1: null, vote_average: 9, vote_count: 200, width: 1200, height: 1800 },
    { file_path: '/c', iso_639_1: 'fr', vote_average: 7, vote_count: 400, width: 900, height: 1300 },
  ];

  const filtered = pickPosterByPreference(
    images,
    'random',
    'en',
    'fr',
    '/a',
    'seed-filtered',
    {
      randomPosterTextMode: 'textless',
      randomPosterLanguageMode: 'any',
      randomPosterMinVoteCount: null,
      randomPosterMinVoteAverage: null,
      randomPosterMinWidth: 1100,
      randomPosterMinHeight: null,
      randomPosterFallbackMode: 'best',
    },
  );
  assert.equal(filtered?.file_path, '/b');

  const fallbackOriginal = pickPosterByPreference(
    images,
    'random',
    'en',
    'fr',
    '/a',
    'seed-no-match',
    {
      randomPosterTextMode: 'text',
      randomPosterLanguageMode: 'requested',
      randomPosterMinVoteCount: 1000,
      randomPosterMinVoteAverage: 10,
      randomPosterMinWidth: 5000,
      randomPosterMinHeight: 5000,
      randomPosterFallbackMode: 'original',
    },
  );
  assert.equal(fallbackOriginal?.file_path, '/a');

  const fallbackBest = pickPosterByPreference(
    images,
    'random',
    'en',
    'fr',
    '/a',
    'seed-no-match-best',
    {
      randomPosterTextMode: 'text',
      randomPosterLanguageMode: 'requested',
      randomPosterMinVoteCount: 1000,
      randomPosterMinVoteAverage: 10,
      randomPosterMinWidth: 5000,
      randomPosterMinHeight: 5000,
      randomPosterFallbackMode: 'best',
    },
  );
  assert.equal(fallbackBest?.file_path, '/b');
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

test('image route selection applies fanart textless and random text preferences', () => {
  const assets = [
    { url: 'https://img/text-en', lang: 'en', likes: '2' },
    { url: 'https://img/textless', lang: '00', likes: '50' },
    { url: 'https://img/text-fr', lang: 'fr', likes: '20' },
  ];

  const explicitTextless = pickFanartPosterByPreference(
    selectFanartAssets(assets, 'en', 'fr'),
    'textless',
    'fanart-explicit',
    'any',
  );
  assert.equal(explicitTextless?.url, 'https://img/textless');
  assert.equal(isTextlessFanartAsset(explicitTextless), true);

  const randomText = pickFanartPosterByPreference(
    selectFanartAssets(assets, 'en', 'fr'),
    'random',
    'fanart-random-text',
    'text',
  );
  assert.notEqual(randomText?.url, 'https://img/textless');

  const randomTextless = pickFanartPosterByPreference(
    selectFanartAssets(assets, 'en', 'fr'),
    'random',
    'fanart-random-textless',
    'textless',
  );
  assert.equal(randomTextless?.url, 'https://img/textless');
});
