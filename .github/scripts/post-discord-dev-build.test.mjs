// Run with: node --test .github/scripts/post-discord-dev-build.test.mjs
//
// This script assembles a body and hands it to buildDiscordReleasePayloads,
// which escapes markdown on the way out. Escaping here as well put a visible
// backslash before every underscore, so the body must leave this script raw.

import assert from 'node:assert/strict';
import test from 'node:test';

import { readFileSync } from 'node:fs';

import { ATTRIBUTION, buildBodyFromCommits } from './post-discord-dev-build.mjs';
import { buildDiscordReleasePayloads } from './post-discord-release.mjs';

const NAME = 'XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS';

function commit(message) {
  return { id: 'abc1234567', url: 'https://example.invalid/c/abc1234', commit: { message } };
}

test('the assembled body leaves this script unescaped', () => {
  const body = buildBodyFromCommits(
    [commit(`fix(render): a change\n\nset ${NAME} to 1`)],
    '', '', '',
  );
  assert.ok(body.includes(NAME), 'the name must appear verbatim');
  assert.ok(!body.includes('\\_'), 'escaping belongs to the payload builder, not here');
});

test('the name survives the whole path exactly once escaped', () => {
  const body = buildBodyFromCommits(
    [commit(`fix(render): a change\n\nset ${NAME} to 1`)],
    '', '', '',
  );
  const text = JSON.stringify(buildDiscordReleasePayloads({
    repository: 'IbbyLabs/xrdb',
    release: {
      tag_name: 'v3.90.0', name: 'v3.90.0', body,
      html_url: 'https://example.invalid/releases/tag/v3.90.0',
      published_at: '2026-08-18T20:00:00Z',
    },
    previousReleaseTag: 'v3.89.2',
  }));
  assert.ok(!text.includes('XRDBRENDERQUEUEWAITBURSTSECONDS'), 'underscores must not be deleted');
  assert.ok(!text.includes('XRDB\\\\\\\\_'), 'and must not be escaped twice');
});

test('a hard-wrapped body becomes one bullet per paragraph', () => {
  const body = buildBodyFromCommits(
    [commit(`feat(render): add a shorter queue wait\n\nAdmission takes three paths: bulk, a caller drawing on its\nburst allowance, and everything else. The new bound is\n${NAME}, default 1.\n\nA second paragraph stays separate.`)],
    '',
    '',
    '',
  );

  assert.match(body, /- Admission takes three paths: bulk, a caller drawing on its burst allowance, and everything else\. The new bound is XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS, default 1\./);
  assert.match(body, /- A second paragraph stays separate\./);
  assert.doesNotMatch(body, /- burst allowance,/);
});

const SESSION_URL = 'https://claude.ai/code/session_01FAKEfakeFAKEfake00';

test('an attribution trailer never reaches the assembled body', () => {
  const body = buildBodyFromCommits(
    [commit(`fix(render): a change\n\nthe prose that explains it\n\nClaude-Session: ${SESSION_URL}`)],
    '', '', '',
  );
  assert.ok(body.includes('the prose that explains it'), 'the real body must survive');
  assert.ok(!body.includes('Claude-Session'), 'the trailer key must not be published');
  assert.ok(!body.includes('session_'), 'the session id must not be published');
});

test('a trailer sharing a paragraph with prose loses only the trailer', () => {
  const body = buildBodyFromCommits(
    [commit('fix(render): a change\n\nkept prose\nCo-Authored-By: Someone <s@example.invalid>')],
    '', '', '',
  );
  assert.ok(body.includes('kept prose'));
  assert.ok(!body.includes('Co-Authored-By'));
});

test('prose that merely starts with a word and a colon is kept', () => {
  const body = buildBodyFromCommits(
    [commit('fix(render): a change\n\nNote: the ceiling is per caller')],
    '', '', '',
  );
  assert.ok(body.includes('Note: the ceiling is per caller'), 'only known trailers are dropped');
});

// The shapes the CI scan stops at the commit but a backfill can still reach.
for (const [label, line] of [
  ['underscore key', 'Claude_Session: 01FAKEfakeFAKEfake00'],
  ['url without /code/', 'see https://claude.ai/session_01FAKEfake for context'],
  ['emoji footer', '\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)'],
  ['anthropic co-author', 'Co-Authored-By: Claude <noreply@anthropic.com>'],
]) {
  test(`attribution is stripped: ${label}`, () => {
    const body = buildBodyFromCommits([commit(`fix(render): a change\n\nkept prose\n\n${line}`)], '', '', '');
    assert.ok(body.includes('kept prose'), 'the real body must survive');
    assert.ok(!/claude[-_ ]?session|claude\.ai\/(code\/)?session|generated with .*claude|anthropic/i.test(body), label);
  });
}

// The scan gates commits and this gates a backfill, so the two patterns are one
// rule in two languages. A comment saying so is what drifts.
test('the strip pattern is the CI scan pattern', () => {
  const workflow = readFileSync(new URL('../workflows/attribution-scan.yml', import.meta.url), 'utf8');
  const found = workflow.match(/PATTERN='([^']+)'/);
  assert.ok(found, 'no PATTERN= in attribution-scan.yml, so this test read nothing');
  const scan = found[1].replace(/\[\[:space:\]\]/g, String.raw`\s`);
  const strip = ATTRIBUTION.source.replace(/\\\//g, '/');
  assert.equal(strip, scan);
});
