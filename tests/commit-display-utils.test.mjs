import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCommitForDisplay } from '../scripts/commit-display-utils.mjs';

test('normalizes generic homepage update subjects into user facing copy', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'Update page.tsx',
    body: '',
    files: ['app/page.tsx'],
  });

  assert.equal(normalized.type, 'feat');
  assert.equal(normalized.title, 'update homepage and configurator');
  assert.equal(normalized.body, null);
});

test('removes user facing hyphens from conventional titles and bodies', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'fix(proxy): verify episode requested-language translations before replacement',
    body: [
      'Add explicit fill-missing and prefer-requested-language modes.',
      '',
      '- keep proxy-side metadata wording readable',
      '- avoid non-production list markers in the UI',
    ].join('\n'),
    files: ['app/proxy/[...path]/route.ts'],
  });

  assert.equal(normalized.title, 'verify episode requested language translations before replacement');
  assert.equal(
    normalized.body,
    [
      'Add explicit fill missing and prefer requested language modes.',
      '',
      '• keep proxy side metadata wording readable',
      '• avoid non production list markers in the UI',
    ].join('\n')
  );
});

test('normalizes placeholder subjects by summarizing the touched areas', () => {
  const normalized = normalizeCommitForDisplay({
    subject: '.',
    body: '',
    files: [
      'app/[type]/[id]/route.tsx',
      'lib/imageObjectStorage.ts',
      'env.template',
    ],
  });

  assert.equal(normalized.type, 'fix');
  assert.equal(normalized.title, 'update multiple project areas');
  assert.equal(
    normalized.body,
    'Touches image rendering route, project internals, and rendering and data pipeline.'
  );
});

test('normalizes uploaded media subjects into demo video copy', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'Add files via upload',
    body: '',
    files: ['for supported addons.mp4', 'for unsupported addons.mp4'],
  });

  assert.equal(normalized.type, 'style');
  assert.equal(normalized.title, 'add demo videos');
  assert.equal(normalized.body, null);
});

test('normalizes upstream merge copy for user facing surfaces', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'chore: merge upstream/main (ours)',
    body: '',
    files: [],
  });

  assert.equal(normalized.type, 'chore');
  assert.equal(normalized.title, 'sync upstream changes');
  assert.equal(normalized.body, null);
});

test('normalizes upstream synchronize copy for user facing surfaces', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'chore: synchronize with upstream/main to clear behind status',
    body: '',
    files: [],
  });

  assert.equal(normalized.type, 'chore');
  assert.equal(normalized.title, 'sync upstream changes');
  assert.equal(normalized.body, null);
});

test('normalizes pull request merge copy for user facing surfaces', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'Merge pull request #3 from qwertyuiop8899/patch-1',
    body: '',
    files: [],
  });

  assert.equal(normalized.type, 'chore');
  assert.equal(normalized.title, 'merge contributor changes');
  assert.equal(normalized.body, null);
});

test('normalizes conventional pull request merge copy for user facing surfaces', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'chore: merge pull request #3 from qwertyuiop8899/patch 1',
    body: '',
    files: [],
  });

  assert.equal(normalized.type, 'chore');
  assert.equal(normalized.title, 'merge contributor changes');
  assert.equal(normalized.body, null);
});

test('rewrites low signal conventional titles into area based copy', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'docs: update README.md (Upstream change - video link)',
    body: '',
    files: ['README.md'],
  });

  assert.equal(normalized.type, 'docs');
  assert.equal(normalized.title, 'refresh README guide');
  assert.equal(normalized.body, null);
});

test('preserves standard technical hyphens such as ISO 639-1', () => {
  const normalized = normalizeCommitForDisplay({
    subject: 'docs: restore standard ISO 639-1 notation',
    body: 'Bring back ISO 639-1 labels in the docs.',
    files: ['app/page.tsx'],
  });

  assert.equal(normalized.title, 'restore standard ISO 639-1 notation');
  assert.equal(normalized.body, 'Bring back ISO 639-1 labels in the docs.');
});
