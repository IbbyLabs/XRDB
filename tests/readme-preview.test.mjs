import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReadmePreviewTargetUrl,
  getReadmePreviewDefinitions,
  resolveReadmePreviewDefinition,
  resolveReadmePreviewOrigin,
  resolveReadmePreviewOrigins,
} from '../lib/readmePreview.ts';

test('README preview slugs resolve to curated definitions', () => {
  const slugs = getReadmePreviewDefinitions().map((definition) => definition.slug);

  assert.ok(slugs.includes('the-boys-poster'));
  assert.ok(slugs.includes('attack-on-titan-logo'));
  assert.equal(resolveReadmePreviewDefinition('the-boys-poster')?.imageType, 'poster');
  assert.equal(resolveReadmePreviewDefinition('attack-on-titan-logo')?.imageType, 'logo');
  assert.equal(resolveReadmePreviewDefinition('missing-slug'), null);
});

test('README preview target URLs inject the dedicated keys server side', () => {
  const definition = resolveReadmePreviewDefinition('attack-on-titan-poster');
  assert.ok(definition);

  const url = buildReadmePreviewTargetUrl({
    origin: 'https://xrdb.ibbylabs.dev',
    definition,
    tmdbKey: 'tmdb-preview-key',
    mdblistKey: 'mdblist-preview-key',
    cacheBuster: 'preview123',
  });

  assert.equal(
    url.toString(),
    'https://xrdb.ibbylabs.dev/poster/mal%3A16498.jpg?tmdbKey=tmdb-preview-key&mdblistKey=mdblist-preview-key&lang=ja&posterRatings=tmdb%2Canilist%2Ckitsu&posterRatingsLayout=top+bottom&posterStreamBadges=off&ratingStyle=glass&imageText=original&cb=preview123'
  );
});

test('README preview origin prefers the preview app origin when configured', () => {
  assert.equal(
    resolveReadmePreviewOrigin({
      requestOrigin: 'https://xrdb.ibbylabs.dev',
      previewOrigin: 'http://127.0.0.1:3000/',
    }),
    'http://127.0.0.1:3000/'
  );

  assert.equal(
    resolveReadmePreviewOrigin({
      requestOrigin: 'https://xrdb.ibbylabs.dev',
      previewOrigin: 'not a url',
    }),
    'https://xrdb.ibbylabs.dev/'
  );
});

test('README preview origins fall back through the container bind host before the public origin', () => {
  assert.deepEqual(
    resolveReadmePreviewOrigins({
      requestOrigin: 'https://xrdb.ibbylabs.dev',
      previewOrigin: 'http://127.0.0.1:3000/',
      bindHost: 'b31b3ce79adc',
      port: '3000',
    }),
    ['http://127.0.0.1:3000/', 'http://b31b3ce79adc:3000/', 'https://xrdb.ibbylabs.dev/']
  );

  assert.deepEqual(
    resolveReadmePreviewOrigins({
      requestOrigin: 'https://xrdb.ibbylabs.dev',
      previewOrigin: 'http://127.0.0.1:3000/',
      bindHost: '0.0.0.0',
      port: '3000',
    }),
    ['http://127.0.0.1:3000/', 'https://xrdb.ibbylabs.dev/']
  );
});
