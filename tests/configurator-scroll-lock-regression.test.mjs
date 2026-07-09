import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const uiHookPath = join(testsDir, '..', 'lib', 'useConfiguratorWorkspaceUi.ts');
const uiHookSource = readFileSync(uiHookPath, 'utf8');

// The configurator provider is mounted on every route, so any body scroll lock it
// applies leaks onto pages that never render the modal it was meant for (e.g.
// /reference), leaving visitors unable to scroll. Keep the lock out of this shared hook.
test('workspace UI hook does not lock body scroll globally', () => {
  assert.ok(
    !/document\.body\.style\.overflow\s*=/.test(uiHookSource),
    'useConfiguratorWorkspaceUi must not set document.body.style.overflow — a globally mounted lock traps page scroll on routes without the modal.',
  );
});
