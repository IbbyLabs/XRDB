import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('app/page.tsx does not use forbidden lint patterns', () => {
  const eslintBinary = join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'eslint.cmd' : 'eslint'
  );

  const run = spawnSync(eslintBinary, ['app/page.tsx', '--format', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(
    run.status,
    0,
    `eslint failed for app/page.tsx\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`
  );

  const reports = JSON.parse(run.stdout || '[]');
  const messages = reports.flatMap((entry) => entry.messages || []);

  const disallowedRules = new Set([
    'react-hooks/set-state-in-effect',
    '@next/next/no-html-link-for-pages',
  ]);

  const violations = messages.filter((message) => disallowedRules.has(message.ruleId));

  assert.equal(
    violations.length,
    0,
    `Disallowed lint rules found in app/page.tsx:\n${JSON.stringify(violations, null, 2)}`
  );
});
