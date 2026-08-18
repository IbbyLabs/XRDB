// Run with: node --test .github/scripts/post-discord-dev-build.test.mjs
//
// This script assembles a body and hands it to buildDiscordReleasePayloads,
// which escapes markdown on the way out. Escaping here as well put a visible
// backslash before every underscore, so the body must leave this script raw.

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBodyFromCommits } from './post-discord-dev-build.mjs';
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
