import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyConfiguratorPreset,
  getConfiguratorPreset,
  recommendConfiguratorPreset,
} from '../lib/configuratorPresets.ts';
import { createDefaultSavedUiConfig } from '../lib/uiConfig.ts';

test('public-fast preset preserves existing keys and manifest while applying public-instance defaults', () => {
  const current = createDefaultSavedUiConfig();
  current.settings.tmdbKey = 'tmdb-key';
  current.settings.mdblistKey = 'mdblist-key';
  current.settings.fanartKey = 'fanart-key';
  current.proxy.manifestUrl = 'https://addon.example.com/manifest.json';

  const next = applyConfiguratorPreset(current, 'public-fast');

  assert.equal(next.settings.tmdbKey, 'tmdb-key');
  assert.equal(next.settings.mdblistKey, 'mdblist-key');
  assert.equal(next.settings.fanartKey, 'fanart-key');
  assert.equal(next.proxy.manifestUrl, 'https://addon.example.com/manifest.json');
  assert.deepEqual(next.settings.posterRatingPreferences, ['imdb', 'tmdb', 'mdblist']);
  assert.deepEqual(next.settings.backdropRatingPreferences, ['imdb', 'tmdb', 'mdblist']);
  assert.deepEqual(next.settings.logoRatingPreferences, ['imdb', 'tmdb']);
  assert.equal(next.settings.posterStreamBadges, 'off');
  assert.equal(next.settings.backdropStreamBadges, 'off');
  assert.equal(next.proxy.translateMeta, true);
  assert.equal(next.proxy.translateMetaMode, 'fill-missing');
  assert.equal(next.proxy.debugMetaTranslation, false);
});

test('full-stack preset enables dense layouts and full rating coverage', () => {
  const next = applyConfiguratorPreset(createDefaultSavedUiConfig(), 'full-stack');

  assert.equal(next.settings.posterRatingPresentation, 'blockbuster');
  assert.equal(next.settings.backdropRatingPresentation, 'blockbuster');
  assert.equal(next.settings.logoRatingPresentation, 'dual-minimal');
  assert.equal(next.settings.posterRatingStyle, 'stacked');
  assert.equal(next.settings.backdropRatingStyle, 'stacked');
  assert.equal(next.settings.posterRatingsLayout, 'left-right');
  assert.equal(next.settings.backdropRatingsLayout, 'right-vertical');
  assert.equal(next.settings.posterRatingsMaxPerSide, 4);
  assert.equal(next.settings.posterGenreBadgeMode, 'both');
  assert.equal(next.settings.backdropGenreBadgeMode, 'both');
  assert.equal(next.settings.logoGenreBadgeMode, 'both');
  assert.ok(next.settings.posterRatingPreferences.length > 6);
  assert.deepEqual(next.settings.posterRatingPreferences, next.settings.backdropRatingPreferences);
  assert.deepEqual(next.settings.posterRatingPreferences, next.settings.logoRatingPreferences);
});

test('wizard recommendation favors public-fast for public instances and richer presets for manual tuning', () => {
  assert.equal(
    recommendConfiguratorPreset({
      deployment: 'public',
      density: 'maximal',
      tuning: 'hands-on',
    }),
    'public-fast',
  );

  assert.equal(
    recommendConfiguratorPreset({
      deployment: 'personal',
      density: 'minimal',
      tuning: 'guided',
    }),
    'starter',
  );

  assert.equal(
    recommendConfiguratorPreset({
      deployment: 'personal',
      density: 'balanced',
      tuning: 'guided',
    }),
    'balanced',
  );

  assert.equal(
    recommendConfiguratorPreset({
      deployment: 'personal',
      density: 'balanced',
      tuning: 'hands-on',
    }),
    'full-stack',
  );
});

test('preset metadata stays stable for the onboarding UI', () => {
  const preset = getConfiguratorPreset('balanced');

  assert.equal(preset.label, 'Balanced');
  assert.equal(preset.badge, 'Recommended');
  assert.equal(preset.recommendedExperienceMode, 'simple');
  assert.equal(Array.isArray(preset.bullets), true);
  assert.ok(preset.bullets.length >= 3);
});
