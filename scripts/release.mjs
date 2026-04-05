import { spawnSync } from 'node:child_process';

import { ensureNativeDeps } from './ensure-native-deps.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const level = process.argv[2];
const allowedLevels = new Set(['patch', 'minor', 'major']);

if (!allowedLevels.has(level)) {
  console.error('Usage: npm run release -- <patch|minor|major>');
  process.exit(1);
}

ensureNativeDeps();

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

const tmdbKey = process.env.XRDB_README_PREVIEW_TMDB_KEY || process.env.TMDB_KEY || '';

if (tmdbKey) {
  console.log('Refreshing doc static assets before release...');
  const refreshResult = spawnSync('node', ['scripts/refresh-doc-static-assets.mjs', 'all'], { stdio: 'inherit' });
  if (refreshResult.error) {
    throw refreshResult.error;
  }
  if (refreshResult.status !== 0) {
    console.error('Doc asset refresh failed. Fix the issue and try again.');
    process.exit(refreshResult.status ?? 1);
  }

  const docsDiff = spawnSync('git', ['status', '--porcelain', '--', 'README.md', 'docs/images'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (String(docsDiff.stdout || '').trim()) {
    run('git', ['add', 'README.md', 'docs/images']);
    run('git', ['commit', '-m', 'docs: refresh static doc assets']);
    console.log('Committed refreshed doc assets.');
  } else {
    console.log('Doc assets are already up to date.');
  }
} else {
  console.warn('WARNING: TMDB key not configured. Skipping doc asset refresh.');
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
