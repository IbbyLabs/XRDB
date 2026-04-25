import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildConfigProfileFingerprint,
  buildRevealedConfigState,
  hasConfigProfileUnsavedChanges,
} from '../lib/configProfileClientState.ts';
import {
  CONFIG_PROFILE_GLOBAL_KEYS,
  CONFIG_PROFILE_INTERACTION_CASES,
  CONFIG_PROFILE_LEGACY_SHARED_OPTION_KEYS,
  CONFIG_PROFILE_TYPE_SURFACES,
  CONFIG_PROFILE_VERIFICATION_ENTRIES,
} from '../lib/configProfileVerification.ts';
import { buildProfileParams, normalizeSavedUiConfig } from '../lib/uiConfig.ts';

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UI_CONFIG_PATH = path.join(ROOT_DIR, 'lib', 'uiConfig.ts');

const extractSerializerKeys = async () => {
  const source = await readFile(UI_CONFIG_PATH, 'utf8');
  const serializerSectionMatch = source.match(/const buildSharedPayload = \(settings: SharedXrdbSettings(?:, options\?: SharedPayloadOptions)?\) => \{([\s\S]*?)return payload;/);
  assert.ok(serializerSectionMatch, 'Unable to locate buildSharedPayload in uiConfig.ts');
  const section = serializerSectionMatch[1];
  const keys = new Set();

  const initialPayloadMatch = section.match(/const payload:\s*Record<string, string \| number \| boolean> = \{([\s\S]*?)\n\s*\};/);
  if (initialPayloadMatch) {
    for (const match of initialPayloadMatch[1].matchAll(/\b([A-Za-z0-9_]+),/g)) {
      keys.add(match[1]);
    }
  }

  for (const match of section.matchAll(/payload\.([A-Za-z0-9_]+)\s*=/g)) {
    keys.add(match[1]);
  }

  for (const match of section.matchAll(/globalKey:\s*'([^']+)'/g)) {
    keys.add(match[1]);
  }

  for (const match of section.matchAll(/perTypeKeys:\s*\{([\s\S]*?)\}/g)) {
    for (const keyMatch of match[1].matchAll(/'([^']+)'/g)) {
      keys.add(keyMatch[1]);
    }
  }

  return [...keys].sort();
};

test('saved profile verification schema covers every serialized config profile key', async () => {
  const serializerKeys = await extractSerializerKeys();
  const persistedKeys = CONFIG_PROFILE_VERIFICATION_ENTRIES
    .filter((entry) => !entry.surfaces.some((surface) => surface.endsWith('alias')))
    .map((entry) => entry.key)
    .sort();

  assert.deepEqual(persistedKeys, serializerKeys);
});

test('config profile hard rule blocks new shared option keys', () => {
  const globalKeySet = new Set(CONFIG_PROFILE_GLOBAL_KEYS);
  const legacySharedKeySet = new Set(CONFIG_PROFILE_LEGACY_SHARED_OPTION_KEYS);
  const typeSurfaceSet = new Set(CONFIG_PROFILE_TYPE_SURFACES);
  const sharedSurfaceSet = new Set(['shared', 'shared-alias', 'legacy-alias']);

  for (const entry of CONFIG_PROFILE_VERIFICATION_ENTRIES) {
    const hasSharedSurface = entry.surfaces.some((surface) => sharedSurfaceSet.has(surface));
    if (!hasSharedSurface) {
      continue;
    }

    if (globalKeySet.has(entry.key)) {
      continue;
    }

    assert.equal(
      legacySharedKeySet.has(entry.key),
      true,
      `Shared option key ${entry.key} must be listed in CONFIG_PROFILE_LEGACY_SHARED_OPTION_KEYS`,
    );
  }

  for (const entry of CONFIG_PROFILE_VERIFICATION_ENTRIES) {
    const isGlobal = globalKeySet.has(entry.key);
    const isLegacyShared = legacySharedKeySet.has(entry.key);
    if (isGlobal || isLegacyShared) {
      continue;
    }

    for (const surface of entry.surfaces) {
      assert.equal(
        typeSurfaceSet.has(surface),
        true,
        `${entry.key} must remain type scoped but uses surface ${surface}`,
      );
    }
  }
});

test('saved profile verification entries round-trip every declared coverage value', () => {
  for (const entry of CONFIG_PROFILE_VERIFICATION_ENTRIES) {
    for (const value of entry.coverageValues) {
      const rawParams = {
        tmdbKey: 'tmdb',
        mdblistKey: 'mdb',
        ...(entry.requiredParams ?? {}),
        [entry.key]: value,
      };

      const revealed = buildRevealedConfigState(rawParams);
      const params = buildProfileParams(revealed.normalizedConfig.settings);

      assert.ok(params, `${entry.key} should build profile params for ${value}`);

      const roundTripped = normalizeSavedUiConfig(
        { settings: params },
        { skipCrossTypeFallbacks: true },
      );

      assert.deepEqual(buildProfileParams(roundTripped.settings), params);
      assert.equal(
        hasConfigProfileUnsavedChanges({
          currentParams: params,
          savedFingerprint: buildConfigProfileFingerprint(params),
          snapshotReady: true,
        }),
        false,
      );
    }
  }
});

test('saved profile interaction cases preserve inclusion and omission rules', () => {
  for (const interactionCase of CONFIG_PROFILE_INTERACTION_CASES) {
    const revealed = buildRevealedConfigState(interactionCase.params);
    const params = buildProfileParams(revealed.normalizedConfig.settings) ?? {};

    for (const key of interactionCase.expectedIncludedKeys) {
      assert.equal(Boolean(params[key]), true, `${interactionCase.id} should include ${key}`);
    }

    for (const key of interactionCase.expectedOmittedKeys ?? []) {
      assert.equal(key in params, false, `${interactionCase.id} should omit ${key}`);
    }
  }
});
