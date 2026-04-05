import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReadmePreviewTargetUrl,
  getReadmePreviewDefinitions,
  getReadmePreviewPoolDefinitions,
  renderReadmePreviewGallerySection,
  replaceReadmePreviewGallerySection,
  resolveReadmePreviewDefinition,
  resolveReadmePreviewOrigin,
  resolveReadmePreviewOrigins,
  selectReadmePreviewGallery,
  validateReadmePreviewPool,
} from '../lib/readmePreview.ts';

test('README preview active gallery resolves to the generated selection and pool slugs stay addressable', () => {
  const activeSlugs = getReadmePreviewDefinitions().map((definition) => definition.slug);

  assert.equal(activeSlugs.length, 10);
  assert.ok(activeSlugs.includes('attack-on-titan-poster'));
  assert.ok(activeSlugs.includes('dune-part-two-logo'));
  assert.ok(activeSlugs.includes('attack-on-titan-logo'));
  assert.equal(resolveReadmePreviewDefinition('attack-on-titan-poster')?.imageType, 'poster');
  assert.equal(resolveReadmePreviewDefinition('the-boys-poster')?.imageType, 'poster');
  assert.equal(resolveReadmePreviewDefinition('missing-slug'), null);
});

test('README preview pool supports the configured gallery constraints', () => {
  assert.ok(getReadmePreviewPoolDefinitions().length > getReadmePreviewDefinitions().length);
  assert.doesNotThrow(() => validateReadmePreviewPool());
});

test('README preview selection is deterministic for the same seed and version', () => {
  const first = selectReadmePreviewGallery({
    seed: 'v1.9.0',
    version: '1.9.0',
    selectedAt: '2026-04-05T00:00:00.000Z',
  });
  const second = selectReadmePreviewGallery({
    seed: 'v1.9.0',
    version: '1.9.0',
    selectedAt: '2026-04-05T00:00:00.000Z',
  });

  assert.deepEqual(first.state.activeSlugs, second.state.activeSlugs);
  assert.deepEqual(first.state.historySlugs, second.state.historySlugs);
});

test('README preview selection avoids recent slugs when enough fresh candidates remain', () => {
  const selection = selectReadmePreviewGallery({
    seed: 'v1.9.1',
    version: '1.9.1',
    selectedAt: '2026-04-05T00:00:00.000Z',
    previousState: {
      schemaVersion: 1,
      version: '1.9.0',
      seed: 'v1.9.0',
      selectedAt: '2026-04-05T00:00:00.000Z',
      activeSlugs: {
        poster: ['the-boys-poster'],
        backdrop: ['game-of-thrones-backdrop'],
        logo: ['the-boys-logo'],
      },
      historySlugs: {
        poster: ['the-boys-poster'],
        backdrop: ['game-of-thrones-backdrop'],
        logo: ['the-boys-logo'],
      },
    },
  });

  assert.ok(!selection.state.activeSlugs.poster.includes('the-boys-poster'));
  assert.ok(!selection.state.activeSlugs.backdrop.includes('game-of-thrones-backdrop'));
  assert.ok(!selection.state.activeSlugs.logo.includes('the-boys-logo'));
});

test('README preview gallery output renders the generated section and replaces the README block', () => {
  const selection = selectReadmePreviewGallery({
    seed: 'v1.9.0',
    version: '1.9.0',
    selectedAt: '2026-04-05T00:00:00.000Z',
  });
  const section = renderReadmePreviewGallerySection({
    definitions: selection.definitions,
    version: '1.9.0',
  });

  assert.match(section, /rotate through a curated, varied set of preview cards/i);
  assert.match(section, /readme-preview-attack-on-titan-poster-v1-9-0/);
  assert.match(section, /Japanese text, TMDB \/ MyAnimeList \/ AniList \/ Kitsu, top and bottom rows/);
  assert.match(section, /Square ratings, TMDB \/ Rotten Tomatoes \/ Metacritic \/ Letterboxd, clean text, split side layout/);
  assert.match(section, /### Posters/);
  assert.match(section, /### Backdrops/);
  assert.match(section, /### Logos/);

  const readme = [
    '# XRDB',
    '',
    '## Live Preview Gallery',
    '',
    'old',
    '',
    '## Rendering Option Comparisons',
    '',
    'rest',
  ].join('\n');
  const replaced = replaceReadmePreviewGallerySection({ readme, section });

  assert.match(replaced, /attack-on-titan-poster/);
  assert.doesNotMatch(replaced, /\nold\n/);
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
    'https://xrdb.ibbylabs.dev/poster/mal%3A16498.jpg?tmdbKey=tmdb-preview-key&mdblistKey=mdblist-preview-key&lang=ja&posterRatings=tmdb%2Cmyanimelist%2Canilist%2Ckitsu&posterRatingsLayout=top+bottom&posterStreamBadges=off&ratingStyle=glass&imageText=original&cb=preview123'
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