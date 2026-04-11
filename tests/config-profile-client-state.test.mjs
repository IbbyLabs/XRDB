import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRevealedConfigState,
  getActiveConfigProfileUnlockSession,
  shouldClearConfigProfileUnlockSession,
} from '../lib/configProfileClientState.ts';
import { buildProxyPayload, parseSavedUiConfig } from '../lib/uiConfig.ts';

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