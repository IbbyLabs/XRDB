import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCinemetaBackdropUrl,
  buildCinemetaLogoUrl,
  buildCinemetaPosterUrl,
  buildProviderIconMemoryCacheKey,
  buildProviderIconStorageKey,
  buildSourceImageFallbackCacheControl,
  buildTmdbImageUrl,
  isSharedCacheableSourceImageUrl,
  pickTmdbImageSize,
  toImageContentType,
} from '../lib/imageRouteSourceUrls.ts';

test('image route source urls normalize content types and cache headers', () => {
  assert.equal(toImageContentType('image/jpeg; charset=utf-8'), 'image/jpeg');
  assert.equal(toImageContentType('text/plain'), 'image/png');
  assert.equal(
    buildSourceImageFallbackCacheControl(120_000),
    'public, max-age=120, s-maxage=120, stale-while-revalidate=3600',
  );
});

test('image route source urls detect shared cacheable source hosts', () => {
  assert.equal(isSharedCacheableSourceImageUrl('https://image.tmdb.org/t/p/w500/a.jpg'), true);
  assert.equal(isSharedCacheableSourceImageUrl('https://m.media-amazon.com/images/I/51y2h75fMoL.png'), true);
  assert.equal(isSharedCacheableSourceImageUrl('https://example.com/a.jpg'), false);
  assert.equal(isSharedCacheableSourceImageUrl('not a url'), false);
});

test('image route source urls build stable provider icon keys', () => {
  const storageKey = buildProviderIconStorageKey('https://img/icon.png', 12);
  const memoryKey = buildProviderIconMemoryCacheKey('https://img/icon.png', 12);

  assert.match(storageKey, /^icons\/v3\/[a-f0-9]{40}\.png$/);
  assert.equal(memoryKey, 'icon:v3:https://img/icon.png|r:12');
});

test('image route source urls map TMDB sizes and source urls predictably', () => {
  assert.equal(pickTmdbImageSize('poster', 300), 'w500');
  assert.equal(pickTmdbImageSize('poster', 700), 'w780');
  assert.equal(pickTmdbImageSize('backdrop', 1920), 'w1280');
  assert.equal(pickTmdbImageSize('logo', 400), 'w500');
  assert.equal(
    buildTmdbImageUrl('poster', '/abc.png', 300),
    'https://image.tmdb.org/t/p/w500/abc.png',
  );
});

test('image route source urls build Cinemeta endpoints', () => {
  assert.equal(
    buildCinemetaPosterUrl('tt0944947'),
    'https://images.metahub.space/poster/medium/tt0944947/img',
  );
  assert.equal(
    buildCinemetaBackdropUrl('tt0944947'),
    'https://images.metahub.space/background/medium/tt0944947/img',
  );
  assert.equal(
    buildCinemetaLogoUrl('tt0944947'),
    'https://images.metahub.space/logo/medium/tt0944947/img',
  );
});
