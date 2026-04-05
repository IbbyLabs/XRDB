import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConfiguratorGlobalResetConfig,
  buildConfiguratorSectionResetConfig,
  getAllConfiguratorCustomizationResetKeys,
  getConfiguratorSectionResetKeys,
} from '../lib/configuratorResetGroups.ts';
import { createDefaultSavedUiConfig } from '../lib/uiConfig.ts';

test('configurator reset groups keep quality section scoped to the active preview', () => {
  const config = createDefaultSavedUiConfig();
  config.settings.posterQualityBadgesStyle = 'silver';
  config.settings.posterQualityBadgePreferences = ['certification'];
  config.settings.ageRatingBadgePosition = 'right-center';
  config.settings.backdropQualityBadgesStyle = 'minimal';
  config.settings.backdropQualityBadgesMax = 2;

  const next = buildConfiguratorSectionResetConfig(config, 'quality', 'poster');

  assert.equal(next.settings.posterQualityBadgesStyle, createDefaultSavedUiConfig().settings.posterQualityBadgesStyle);
  assert.deepEqual(
    next.settings.posterQualityBadgePreferences,
    createDefaultSavedUiConfig().settings.posterQualityBadgePreferences,
  );
  assert.equal(next.settings.ageRatingBadgePosition, 'inherit');
  assert.equal(next.settings.backdropQualityBadgesStyle, 'minimal');
  assert.equal(next.settings.backdropQualityBadgesMax, 2);
});

test('configurator reset groups restore provider ordering and overrides without touching look settings', () => {
  const config = createDefaultSavedUiConfig();
  config.settings.posterRatingPreferences = ['imdb'];
  config.settings.ratingProviderAppearanceOverrides = {
    imdb: {
      accentColor: '#ffffff',
    },
  };
  config.settings.posterArtworkSource = 'fanart';

  const next = buildConfiguratorSectionResetConfig(config, 'providers', 'poster');

  assert.deepEqual(
    next.settings.posterRatingPreferences,
    createDefaultSavedUiConfig().settings.posterRatingPreferences,
  );
  assert.deepEqual(next.settings.ratingProviderAppearanceOverrides, {});
  assert.equal(next.settings.posterArtworkSource, 'fanart');
});

test('configurator global reset restores customisation defaults while preserving non customisation inputs', () => {
  const config = createDefaultSavedUiConfig();
  config.settings.xrdbKey = 'xrdb-key';
  config.settings.tmdbKey = 'tmdb-key';
  config.settings.lang = 'fr';
  config.proxy.manifestUrl = 'https://example.com/manifest.json';
  config.settings.posterArtworkSource = 'fanart';
  config.settings.posterQualityBadgesStyle = 'silver';
  config.settings.posterRatingPreferences = ['imdb'];
  config.settings.aggregateAccentBarVisible = false;

  const next = buildConfiguratorGlobalResetConfig(config);

  assert.equal(next.settings.xrdbKey, 'xrdb-key');
  assert.equal(next.settings.tmdbKey, 'tmdb-key');
  assert.equal(next.settings.lang, 'fr');
  assert.equal(next.proxy.manifestUrl, 'https://example.com/manifest.json');
  assert.equal(next.settings.posterArtworkSource, createDefaultSavedUiConfig().settings.posterArtworkSource);
  assert.equal(
    next.settings.posterQualityBadgesStyle,
    createDefaultSavedUiConfig().settings.posterQualityBadgesStyle,
  );
  assert.deepEqual(
    next.settings.posterRatingPreferences,
    createDefaultSavedUiConfig().settings.posterRatingPreferences,
  );
  assert.equal(
    next.settings.aggregateAccentBarVisible,
    createDefaultSavedUiConfig().settings.aggregateAccentBarVisible,
  );
});

test('configurator reset key lists cover expanded customisation surfaces', () => {
  const posterLookKeys = getConfiguratorSectionResetKeys('look', 'poster');
  const posterQualityKeys = getConfiguratorSectionResetKeys('quality', 'poster');
  const allKeys = getAllConfiguratorCustomizationResetKeys();

  assert.ok(posterLookKeys.includes('posterEdgeOffset'));
  assert.ok(posterLookKeys.includes('posterNoBackgroundBadgeOutlineWidth'));
  assert.ok(posterQualityKeys.includes('ageRatingBadgePosition'));
  assert.ok(posterQualityKeys.includes('posterQualityBadgesPosition'));
  assert.ok(allKeys.includes('ratingProviderAppearanceOverrides'));
  assert.ok(allKeys.includes('logoBackground'));
  assert.ok(!allKeys.includes('xrdbKey'));
  assert.ok(!allKeys.includes('tmdbKey'));
  assert.ok(!allKeys.includes('lang'));
});