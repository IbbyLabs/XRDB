import { spawnSync } from 'node:child_process';

import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const level = process.argv[2];
const allowedLevels = new Set(['patch', 'minor', 'major']);

if (!allowedLevels.has(level)) {
  console.error('Usage: npm run release -- <patch|minor|major>');
  process.exit(1);
}

function run(command, args, { stdio = 'inherit' } = {}) {
  const result = spawnSync(command, args, { stdio });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

const dirtyCheck = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
if (dirtyCheck.error) {
  throw dirtyCheck.error;
}
if (dirtyCheck.status !== 0) {
  process.exit(dirtyCheck.status ?? 1);
}
if (String(dirtyCheck.stdout || '').trim()) {
  console.error('Release aborted: working tree is not clean. Commit or stash changes first.');
  process.exit(1);
}

run('npm', ['version', level, '-m', 'chore: release %s']);
run('git', ['push', 'origin', 'HEAD', '--follow-tags']);
