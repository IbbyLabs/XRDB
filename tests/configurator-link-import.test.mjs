import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeRatingProviderAppearanceOverrides } from '../lib/badgeCustomization.ts';
import {
  mergeConfiguratorLinkImportIntoProfileParams,
  parseConfiguratorLinkImport,
} from '../lib/configuratorLinkImport.ts';

test('parseConfiguratorLinkImport imports settings from shared logo URL', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://extendedratings.com//logo/%7Bimdb_id%7D.jpg?logoRatingsMax=6&logoRatings=myanimelist,anilist,kitsu,rogerebert,metacritic,letterboxd,tomatoesaudience&ratingValueMode=native&tmdbKey={tmdb_key}&mdblistKey={mdblist_key}',
  );

  assert.ok(parsed);
  assert.equal(parsed.configProfileId, null);
  assert.equal(parsed.previewType, 'logo');
  assert.equal(parsed.defaultSourceType, 'logo');
  assert.equal(parsed.mediaId, null);
  assert.deepEqual(parsed.sharedSettings, {
    ratingValueMode: 'native',
  });
  assert.deepEqual(parsed.typeSettings.logo, {
    logoRatingsMax: '6',
    logoRatings: 'myanimelist,anilist,kitsu,rogerebert,metacritic,letterboxd,tomatoesaudience',
  });
});

test('parseConfiguratorLinkImport scopes generic imageText to preview type', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/backdrop/tmdb:tv:1399.jpg?tmdbKey=tmdb-key&mdblistKey=mdblist-key&imageText=alternative',
  );

  assert.ok(parsed);
  assert.equal(parsed.configProfileId, null);
  assert.equal(parsed.previewType, 'backdrop');
  assert.equal(parsed.defaultSourceType, 'backdrop');
  assert.equal(parsed.mediaId, 'tmdb:tv:1399');
  assert.deepEqual(parsed.sharedSettings, {});
  assert.deepEqual(parsed.typeSettings.backdrop, {
    backdropImageText: 'alternative',
  });
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
  assert.equal(parsed.configProfileId, null);
  assert.deepEqual(parsed.sharedSettings, {
    providerAppearance,
  });
});

test('parseConfiguratorLinkImport preserves protected config profile links', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/poster/tt0133093.jpg?config=550e8400-e29b-41d4-a716-446655440000',
  );

  assert.ok(parsed);
  assert.equal(parsed.configProfileId, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(parsed.previewType, 'poster');
  assert.equal(parsed.mediaId, 'tt0133093');
});

test('parseConfiguratorLinkImport preserves encrypted xrc config profile links', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/poster/tt0133093.jpg?config=xrc_a1b2c3d4e5f6a7b8',
  );

  assert.ok(parsed);
  assert.equal(parsed.configProfileId, 'xrc_a1b2c3d4e5f6a7b8');
  assert.equal(parsed.previewType, 'poster');
  assert.equal(parsed.mediaId, 'tt0133093');
});

test('parseConfiguratorLinkImport preserves legacy xr config profile links', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/poster/tt0133093.jpg?config=xr_deadbeef',
  );

  assert.ok(parsed);
  assert.equal(parsed.configProfileId, 'xr_deadbeef');
  assert.equal(parsed.previewType, 'poster');
  assert.equal(parsed.mediaId, 'tt0133093');
});

test('parseConfiguratorLinkImport rejects URLs without importable settings', () => {
  const parsed = parseConfiguratorLinkImport('https://xrdb.example.com/logo/tt0133093.jpg?foo=bar');
  assert.equal(parsed, null);
});

test('parseConfiguratorLinkImport excludes non-visual values from import patches', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/poster/tt0133093.jpg?tmdbKey=tmdb-key&lang=fr&ratingValueMode=native&posterRatingStyle=plain',
  );

  assert.ok(parsed);
  assert.deepEqual(parsed.sharedSettings, {
    ratingValueMode: 'native',
  });
  assert.deepEqual(parsed.typeSettings.poster, {
    posterRatingStyle: 'plain',
  });
});

test('parseConfiguratorLinkImport keeps multi-type groups separate', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/poster/tt0133093.jpg?posterRatingStyle=plain&logoArtworkSource=fanart&logoRatings=imdb,tmdb',
  );

  assert.ok(parsed);
  assert.deepEqual(parsed.typeSettings.poster, {
    posterRatingStyle: 'plain',
  });
  assert.deepEqual(parsed.typeSettings.logo, {
    logoArtworkSource: 'fanart',
    logoRatings: 'imdb,tmdb',
  });
});

test('mergeConfiguratorLinkImportIntoProfileParams keeps unrelated sections intact for same-type imports', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/logo/tt0133093.jpg?logoRatingsMax=6&logoRatings=imdb,tmdb',
  );

  assert.ok(parsed);
  const nextParams = mergeConfiguratorLinkImportIntoProfileParams(
    {
      posterImageText: 'textless',
      backdropImageText: 'alternative',
      logoRatingsMax: '4',
    },
    parsed,
    {
      targetTypes: ['logo'],
      includeShared: false,
    },
  );

  assert.deepEqual(nextParams, {
    posterImageText: 'textless',
    backdropImageText: 'alternative',
    logoRatingsMax: '6',
    logoRatings: 'imdb,tmdb',
  });
});

test('mergeConfiguratorLinkImportIntoProfileParams can reuse compatible single-source settings across types', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/logo/tt0133093.jpg?logoRatingPresentation=standard&logoRatings=imdb,tmdb&logoArtworkSource=fanart&providerAppearance=test',
  );

  assert.ok(parsed);
  const nextParams = mergeConfiguratorLinkImportIntoProfileParams(
    {
      backdropRatings: 'metacritic',
    },
    parsed,
    {
      sourceType: 'logo',
      targetTypes: ['backdrop'],
      includeShared: true,
    },
  );

  assert.deepEqual(nextParams, {
    backdropRatings: 'imdb,tmdb',
    backdropRatingPresentation: 'standard',
    backdropArtworkSource: 'fanart',
    providerAppearance: 'test',
  });
});

test('mergeConfiguratorLinkImportIntoProfileParams skips unsupported cross-type settings', () => {
  const parsed = parseConfiguratorLinkImport(
    'https://xrdb.example.com/poster/tt0133093.jpg?posterRatingPresentation=ring&posterStreamBadges=on&posterRatings=imdb,tmdb',
  );

  assert.ok(parsed);
  const nextParams = mergeConfiguratorLinkImportIntoProfileParams(
    {},
    parsed,
    {
      sourceType: 'poster',
      targetTypes: ['logo'],
      includeShared: false,
    },
  );

  assert.deepEqual(nextParams, {
    logoRatings: 'imdb,tmdb',
  });
});
