import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { loadLocalEnv } from '../scripts/load-local-env.mjs';

test('loadLocalEnv layers .env.local over .env without overwriting existing env vars', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrdb-load-local-env-'));

  try {
    await fs.writeFile(
      path.join(rootDir, '.env'),
      ['FROM_ENV=env', 'SHARED=env', 'CHAIN=env'].join('\n'),
      'utf8',
    );
    await fs.writeFile(
      path.join(rootDir, '.env.local'),
      ['CHAIN=local', 'LOCAL_ONLY=local'].join('\n'),
      'utf8',
    );

    const env = {
      SHARED: 'shell',
    };

    const loadedFiles = loadLocalEnv({ rootDir, env });

    assert.equal(loadedFiles.length, 2);
    assert.equal(env.SHARED, 'shell');
    assert.equal(env.FROM_ENV, 'env');
    assert.equal(env.CHAIN, 'local');
    assert.equal(env.LOCAL_ONLY, 'local');
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});

test('loadLocalEnv skips missing env files', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xrdb-load-local-env-empty-'));

  try {
    const env = {};
    const loadedFiles = loadLocalEnv({ rootDir, env });

    assert.deepEqual(loadedFiles, []);
    assert.deepEqual(env, {});
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }
});
