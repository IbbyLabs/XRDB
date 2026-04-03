import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeRatingProviderAppearanceOverrides } from '../lib/badgeCustomization.ts';
import { parseConfiguratorLinkImport } from '../lib/configuratorLinkImport.ts';

test('parseConfiguratorLinkImport imports settings from shared logo URL', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.ibbylabs.dev//logo/%7Bimdb_id%7D.jpg?logoRatingsMax=6&logoRatings=myanimelist,anilist,kitsu,rogerebert,metacritic,letterboxd,tomatoesaudience&ratingValueMode=native&tmdbKey={tmdb_key}&mdblistKey={mdblist_key}',
  );

  assert.ok(parsed);
  assert.equal(parsed.previewType, 'logo');
  assert.equal(parsed.mediaId, null);
  assert.equal(parsed.config.settings.logoRatingsMax, 6);
  assert.deepEqual(parsed.config.settings.logoRatingPreferences, [
    'myanimelist',
    'anilist',
    'kitsu',
    'rogerebert',
    'metacritic',
    'letterboxd',
    'tomatoesaudience',
  ]);
  assert.equal(parsed.config.settings.ratingValueMode, 'native');
  assert.equal(parsed.config.settings.tmdbKey, '{tmdb_key}');
  assert.equal(parsed.config.settings.mdblistKey, '{mdblist_key}');
});

test('parseConfiguratorLinkImport scopes generic imageText to preview type', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/backdrop/tmdb:tv:1399.jpg?tmdbKey=tmdb-key&mdblistKey=mdblist-key&imageText=alternative',
  );

  assert.ok(parsed);
  assert.equal(parsed.previewType, 'backdrop');
  assert.equal(parsed.mediaId, 'tmdb:tv:1399');
  assert.equal(parsed.config.settings.backdropImageText, 'alternative');
  assert.equal(parsed.config.settings.posterImageText, 'clean');
  assert.equal(parsed.config.settings.thumbnailImageText, 'alternative');
});

test('parseConfiguratorLinkImport decodes provider appearance overrides', () => {
  const providerAppearance = encodeRatingProviderAppearanceOverrides({
    trakt: {
      accentColor: '#7c3aed',
      iconScalePercent: 118,
    },
  });
  const parsed = parseConfiguratorLinkImport(
    `https://xrdb.example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&mdblistKey=mdblist-key&providerAppearance=${providerAppearance}`,
  );

  assert.ok(parsed);
  assert.equal(parsed.config.settings.ratingProviderAppearanceOverrides.trakt?.accentColor, '#7c3aed');
  assert.equal(parsed.config.settings.ratingProviderAppearanceOverrides.trakt?.iconScalePercent, 118);
});

test('parseConfiguratorLinkImport rejects URLs without importable settings', () => {
  const parsed = parseConfiguratorLinkImport('https://xrdb.example.com/logo/tt0133093.jpg?foo=bar');
  assert.equal(parsed, null);
});
