import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConfigProfileFingerprint,
  buildRevealedConfigState,
  buildSavedProfileComparableParams,
  getNextAiometadataUrlMode,
  getActiveConfigProfileUnlockSession,
  hasConfigProfileUnsavedChanges,
  hasConfigProfileLoginConflict,
  isProtectedConfigProfileId,
  parseConfigProfileUnlockSession,
  serializeConfigProfileUnlockSession,
  shouldClearConfigProfileUnlockSession,
  toConfigModeAiometadataUrl,
} from '../lib/configProfileClientState.ts';
import { encodeQualityBadgeAppearanceOverrides } from '../lib/badgeCustomization.ts';
import { buildProfileParams, buildProxyPayload, normalizeSavedUiConfig, parseSavedUiConfig } from '../lib/uiConfig.ts';

test('isProtectedConfigProfileId accepts UUID profile identifiers', () => {
  assert.equal(isProtectedConfigProfileId('550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(isProtectedConfigProfileId('xr_deadbeef'), false);
  assert.equal(isProtectedConfigProfileId(''), false);
});

test('a disabled accent bar survives the save and reveal round trip', () => {
  const { settings } = normalizeSavedUiConfig({ settings: { aggregateAccentBarVisible: false } });
  const params = buildProfileParams(settings, {
    allowMissingTmdbKey: true,
    allowMissingMdblistKey: true,
    preserveXrdbKey: true,
  });

  assert.equal(params?.aggregateAccentBarVisible, 'false');

  const { normalizedConfig } = buildRevealedConfigState(params ?? {});
  assert.equal(normalizedConfig.settings.aggregateAccentBarVisible, false);
});

test('a normalised rating value mode survives the save and reveal round trip', () => {
  const { settings } = normalizeSavedUiConfig({ settings: { ratingValueMode: 'normalized' } });
  const params = buildProfileParams(settings, {
    allowMissingTmdbKey: true,
    allowMissingMdblistKey: true,
    preserveXrdbKey: true,
  });

  assert.equal(params?.ratingValueMode, 'normalized');

  const { normalizedConfig } = buildRevealedConfigState(params ?? {});
  assert.equal(normalizedConfig.settings.ratingValueMode, 'normalized');
});

test('getNextAiometadataUrlMode defaults to config when a protected profile becomes active', () => {
  assert.equal(getNextAiometadataUrlMode({
    currentMode: 'inline',
    hasProtectedProfile: true,
    hasExplicitOverride: false,
  }), 'config');
});

test('getNextAiometadataUrlMode preserves an explicit inline fallback while a protected profile stays active', () => {
  assert.equal(getNextAiometadataUrlMode({
    currentMode: 'inline',
    hasProtectedProfile: true,
    hasExplicitOverride: true,
  }), 'inline');
});

test('getNextAiometadataUrlMode resets to inline when the protected profile is removed', () => {
  assert.equal(getNextAiometadataUrlMode({
    currentMode: 'config',
    hasProtectedProfile: false,
    hasExplicitOverride: true,
  }), 'inline');
});

test('getNextAiometadataUrlMode defaults to config on first render when a protected profile is already active', () => {
  assert.equal(getNextAiometadataUrlMode({
    currentMode: 'inline',
    hasProtectedProfile: true,
    hasExplicitOverride: false,
  }), 'config');
});

test('config profile unlock session stays active for the same profile until expiry', () => {
  const session = {
    profileId: 'xrc_0123456789abcdef',
    token: 'unlock-token',
    expiresAt: 2_000,
  };

  assert.deepEqual(
    getActiveConfigProfileUnlockSession(session, 'xrc_0123456789abcdef', 1_999),
    session,
  );
  assert.equal(
    getActiveConfigProfileUnlockSession(session, 'xrc_0123456789abcdef', 2_000),
    null,
  );
  assert.equal(getActiveConfigProfileUnlockSession(session, 'xrc_other', 1_999), null);
});

test('config profile unlock session serializes and restores valid sessions', () => {
  const session = {
    profileId: 'xrc_0123456789abcdef',
    token: 'unlock-token',
    expiresAt: 2_000,
  };

  assert.deepEqual(
    parseConfigProfileUnlockSession(serializeConfigProfileUnlockSession(session), 1_000),
    session,
  );
  assert.equal(
    parseConfigProfileUnlockSession(serializeConfigProfileUnlockSession(session), 2_000),
    null,
  );
  assert.equal(parseConfigProfileUnlockSession('{"profileId":1}', 1_000), null);
  assert.equal(serializeConfigProfileUnlockSession(null), null);
});

test('config profile unlock session is not cleared before saved profile id hydration completes', () => {
  const session = {
    profileId: 'xrc_0123456789abcdef',
    token: 'unlock-token',
    expiresAt: 2_000,
  };

  assert.equal(
    shouldClearConfigProfileUnlockSession({
      session,
      profileIdLoaded: false,
      profileId: null,
    }),
    false,
  );

  assert.equal(
    shouldClearConfigProfileUnlockSession({
      session,
      profileIdLoaded: true,
      profileId: 'xrc_0123456789abcdef',
    }),
    false,
  );

  assert.equal(
    shouldClearConfigProfileUnlockSession({
      session,
      profileIdLoaded: true,
      profileId: 'xrc_other',
    }),
    true,
  );
});

test('revealed config state immediately exposes restored keys to proxy payloads', () => {
  const revealed = buildRevealedConfigState({
    tmdbKey: 'tmdb',
    mdblistKey: 'mdb',
    proxyManifestUrl: 'https://addon.example.com/manifest.json',
  });

  const parsed = parseSavedUiConfig(revealed.serializedConfig, {
    skipCrossTypeFallbacks: true,
  });
  const proxyPayload = buildProxyPayload(
    'https://xrdb.example.com',
    {
      ...revealed.normalizedConfig.proxy,
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
    revealed.normalizedConfig.settings,
  );

  assert.equal(parsed?.settings.tmdbKey, 'tmdb');
  assert.equal(parsed?.settings.mdblistKey, 'mdb');
  assert.equal(parsed?.proxy.manifestUrl, '');
  assert.ok(proxyPayload);
  assert.equal(proxyPayload?.tmdbKey, 'tmdb');
  assert.equal(proxyPayload?.mdblistKey, 'mdb');
  assert.notEqual(revealed.fingerprint, '[]');
});

test('buildConfigProfileFingerprint returns a stable sorted fingerprint', () => {
  assert.equal(
    buildConfigProfileFingerprint({ b: '2', a: '1' }),
    buildConfigProfileFingerprint({ a: '1', b: '2' }),
  );
  assert.equal(buildConfigProfileFingerprint(null), null);
});

test('hasConfigProfileUnsavedChanges detects persisted saved-profile setting changes', () => {
  const revealed = buildRevealedConfigState({
    tmdbKey: 'tmdb',
    mdblistKey: 'mdb',
    thumbnailRatings: 'tmdb,imdb',
  });
  const currentParams = {
    ...(buildProfileParams(revealed.normalizedConfig.settings) ?? {}),
    thumbnailRatings: 'tmdb',
  };

  assert.equal(
    hasConfigProfileUnsavedChanges({
      currentParams,
      savedFingerprint: revealed.fingerprint,
      snapshotReady: true,
    }),
    true,
  );
});

test('hasConfigProfileUnsavedChanges ignores local-only controls outside saved-profile params', () => {
  const revealed = buildRevealedConfigState({
    tmdbKey: 'tmdb',
    mdblistKey: 'mdb',
  });

  assert.equal(
    hasConfigProfileUnsavedChanges({
      currentParams: buildProfileParams(revealed.normalizedConfig.settings) ?? {},
      savedFingerprint: revealed.fingerprint,
      snapshotReady: true,
    }),
    false,
  );
});

test('buildSavedProfileComparableParams keeps provider-credential omissions stable for dirty checks', () => {
  const savedProfileParams = {
    xrdbKey: 'shared-xrdb-key-000',
    posterRatings: 'imdb,tmdb',
    posterGenreBadge: 'imdb',
  };

  const currentParams = {
    xrdbKey: 'shared-xrdb-key-000',
    posterGenreBadge: 'imdb',
    posterRatings: 'imdb,tmdb',
  };

  const savedFingerprint = buildConfigProfileFingerprint(
    buildSavedProfileComparableParams(savedProfileParams),
  );

  assert.equal(
    hasConfigProfileUnsavedChanges({
      currentParams: buildSavedProfileComparableParams(currentParams),
      savedFingerprint,
      snapshotReady: true,
    }),
    false,
  );

  assert.equal(
    hasConfigProfileUnsavedChanges({
      currentParams: buildSavedProfileComparableParams({
        ...currentParams,
        xrdbKey: 'different-xrdb-key',
      }),
      savedFingerprint,
      snapshotReady: true,
    }),
    true,
  );

  assert.equal(
    hasConfigProfileUnsavedChanges({
      currentParams: buildSavedProfileComparableParams({
        ...currentParams,
        posterRatings: 'imdb',
      }),
      savedFingerprint,
      snapshotReady: true,
    }),
    true,
  );
});

test('buildSavedProfileComparableParams preserves quality badge appearance without provider appearance', () => {
  const qualityBadgeAppearance = encodeQualityBadgeAppearanceOverrides({
    atmos: {
      iconUrl: 'https://cdn.example.com/atmos.svg',
    },
  });

  const savedParams = {
    xrdbKey: 'shared-xrdb-key-000',
    posterRatings: 'imdb,tmdb',
    qualityBadgeAppearance,
  };

  const currentParams = {
    qualityBadgeAppearance,
    posterRatings: 'imdb,tmdb',
    xrdbKey: 'shared-xrdb-key-000',
  };

  const savedFingerprint = buildConfigProfileFingerprint(
    buildSavedProfileComparableParams(savedParams),
  );

  assert.equal(
    hasConfigProfileUnsavedChanges({
      currentParams: buildSavedProfileComparableParams(currentParams),
      savedFingerprint,
      snapshotReady: true,
    }),
    false,
  );
});

test('hasConfigProfileLoginConflict returns true when local and profile params differ', () => {
  assert.equal(
    hasConfigProfileLoginConflict({
      localParams: { tmdbKey: 'tmdb', mdblistKey: 'mdb' },
      profileParams: { tmdbKey: 'tmdb', mdblistKey: 'mdb-v2' },
    }),
    true,
  );
});

test('hasConfigProfileLoginConflict returns false for equivalent params in different key order', () => {
  assert.equal(
    hasConfigProfileLoginConflict({
      localParams: { mdblistKey: 'mdb', tmdbKey: 'tmdb' },
      profileParams: { tmdbKey: 'tmdb', mdblistKey: 'mdb' },
    }),
    false,
  );
});

test('toConfigModeAiometadataUrl rewrites inline urls to config urls deterministically', () => {
  const value = toConfigModeAiometadataUrl(
    'https://xrdb.example.com/poster/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&lang=en',
    '550e8400-e29b-41d4-a716-446655440000',
  );

  assert.equal(
    value,
    'https://xrdb.example.com/poster/tmdb:{type}:{tmdb_id}.jpg?config=550e8400-e29b-41d4-a716-446655440000',
  );
});

test('toConfigModeAiometadataUrl reflects profile id changes for regenerated rows', () => {
  const inlinePattern = 'https://xrdb.example.com/backdrop/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb';
  const first = toConfigModeAiometadataUrl(inlinePattern, '550e8400-e29b-41d4-a716-446655440000');
  const second = toConfigModeAiometadataUrl(inlinePattern, '550e8400-e29b-41d4-a716-446655440001');

  assert.equal(first.endsWith('?config=550e8400-e29b-41d4-a716-446655440000'), true);
  assert.equal(second.endsWith('?config=550e8400-e29b-41d4-a716-446655440001'), true);
});

test('toConfigModeAiometadataUrl regenerates from updated inline pattern state', () => {
  const beforeReset = toConfigModeAiometadataUrl(
    'https://xrdb.example.com/logo/tmdb:{type}:{tmdb_id}.png?idSource=tmdb&posterImageText=textless',
    '550e8400-e29b-41d4-a716-446655440000',
  );
  const afterReset = toConfigModeAiometadataUrl(
    'https://xrdb.example.com/logo/tmdb:{type}:{tmdb_id}.png?idSource=tmdb&posterImageText=clean',
    '550e8400-e29b-41d4-a716-446655440000',
  );

  assert.equal(
    beforeReset,
    'https://xrdb.example.com/logo/tmdb:{type}:{tmdb_id}.png?config=550e8400-e29b-41d4-a716-446655440000',
  );
  assert.equal(
    afterReset,
    'https://xrdb.example.com/logo/tmdb:{type}:{tmdb_id}.png?config=550e8400-e29b-41d4-a716-446655440000',
  );
});