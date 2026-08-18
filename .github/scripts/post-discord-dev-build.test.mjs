// Run with: node --test .github/scripts/post-discord-dev-build.test.mjs
//
// Commit text reaches Discord as the body of a message, so anything Discord
// reads as formatting is consumed rather than shown. An env var name is the
// case that bites: five underscores made XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS
// arrive as XRDBRENDERQUEUEWAITBURSTSECONDS, which is a name that does not
// exist and which a reader copies.

import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeMarkdown } from './post-discord-dev-build.mjs';

test('an env var name survives the trip intact', () => {
  const name = 'XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS';
  const escaped = escapeMarkdown(name);
  assert.ok(escaped.includes('\\_'), 'underscores must be escaped');
  assert.equal(escaped.replaceAll('\\', ''), name, 'escaping must reverse to the original');
});

test('every inline formatter Discord reads is escaped', () => {
  for (const ch of ['*', '_', '~', '`', '|', '\\']) {
    assert.ok(escapeMarkdown(`a${ch}b`).includes(`\\${ch}`), `${ch} must be escaped`);
  }
});

test('text with no formatting is left alone', () => {
  assert.equal(escapeMarkdown('fix(render): add a shorter queue wait'), 'fix(render): add a shorter queue wait');
});
