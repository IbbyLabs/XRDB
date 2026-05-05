import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const navBarPath = join(testsDir, '..', 'components', 'nav-bar.tsx');

const navBarSource = readFileSync(navBarPath, 'utf8');

test('ThemeModePopover avoids window reads in useState initializer', () => {
  assert.ok(
    !navBarSource.includes('useState<XRDBModePreference>(() =>'),
    'ThemeModePopover should not read client-only mode in useState initializer because it causes SSR hydration drift.',
  );
});

test('ThemeModePopover syncs client mode after mount', () => {
  assert.ok(
    navBarSource.includes('queueMicrotask(() => setPref(getActiveModePreference()));'),
    'ThemeModePopover should sync mode preference after mount instead of during initial render.',
  );
});
