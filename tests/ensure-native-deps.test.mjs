import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDeclaredPackageManager,
  getRebuildCommand,
  getVerifyScript,
  isNativeAbiMismatch,
} from '../scripts/ensure-native-deps.mjs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('detects better-sqlite3 ABI mismatch output', () => {
  const output = [
    "Error: The module '/tmp/better_sqlite3.node'",
    'was compiled against a different Node.js version using',
    'NODE_MODULE_VERSION 137.',
    'Please try re-compiling or re-installing better-sqlite3.',
  ].join('\n');

  assert.equal(isNativeAbiMismatch(output), true);
});

test('ignores unrelated native load failures', () => {
  const output = [
    "Error: Cannot find module 'sharp'",
    'Require stack:',
    '- /tmp/test.js',
  ].join('\n');

  assert.equal(isNativeAbiMismatch(output), false);
});

test('uses pnpm rebuild when scripts run under pnpm', () => {
  assert.deepEqual(
    getRebuildCommand({
      userAgent: 'pnpm/10.32.1 npm/? node/v22.7.0 darwin arm64',
    }),
    {
      command: 'pnpm',
      args: ['rebuild', 'better-sqlite3'],
    },
  );
});

test('uses pnpm rebuild when the repo declares pnpm', () => {
  assert.deepEqual(
    getRebuildCommand({
      userAgent: 'npm/11.6.2 node/v24.13.0 darwin arm64 workspaces/false',
      packageManager: 'pnpm@10.32.1',
    }),
    {
      command: 'pnpm',
      args: ['rebuild', 'better-sqlite3'],
    },
  );
});

test('defaults to npm rebuild outside pnpm', () => {
  assert.deepEqual(
    getRebuildCommand({
      userAgent: 'npm/10.8.2 node/v22.7.0 darwin arm64 workspaces/false',
    }),
    {
      command: 'npm',
      args: ['rebuild', 'better-sqlite3'],
    },
  );
});

test('verify script opens and closes an in-memory database', () => {
  const script = getVerifyScript();

  assert.match(script, /require\("better-sqlite3"\)/);
  assert.match(script, /new Database\(':memory:'\)/);
  assert.match(script, /db\.close\(\)/);
});

test('reads the declared package manager from package.json', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'ensure-native-deps-'));
  const packageJsonPath = join(tempDir, 'package.json');

  try {
    writeFileSync(
      packageJsonPath,
      JSON.stringify({ name: 'test', packageManager: 'pnpm@10.32.1' }),
      'utf8',
    );

    assert.equal(
      getDeclaredPackageManager({ packageJsonPath }),
      'pnpm@10.32.1',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
