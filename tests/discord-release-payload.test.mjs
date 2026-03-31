import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDiscordReleasePayload } from '../.github/scripts/post-discord-release.mjs';

test('buildDiscordReleasePayload creates a branded embed with release links and parsed sections', () => {
  const payload = buildDiscordReleasePayload({
    repository: 'IbbyLabs/xrdb',
    previousReleaseTag: 'v2.30.0',
    release: {
      tag_name: 'v2.31.0',
      name: 'v2.31.0',
      html_url: 'https://github.com/IbbyLabs/xrdb/releases/tag/v2.31.0',
      published_at: '2026-03-25T01:05:37Z',
      body: [
        '[!TIP]',
        'Changelog: read the matching entry or browse the full compare.',
        '',
        '## Added',
        '- add optional XRDB request protection',
        '- add XRDB community Discord links',
        '',
        '## Other Changes',
        '- notify Discord after release workflow completes',
      ].join('\n'),
    },
  });

  assert.equal(payload.username, 'XRDB Releases');
  assert.equal(payload.embeds.length, 1);
  assert.equal(payload.embeds[0].color, 0x7c3aed);
  assert.equal(payload.embeds[0].author.name, 'XRDB, eXtended Ratings DataBase');
  assert.equal(payload.embeds[0].title, 'v2.31.0');
  assert.match(payload.embeds[0].description, /v2\.31\.0/);

  const fields = payload.embeds[0].fields;
  assert.equal(fields[0].name, 'Tag');
  assert.equal(fields[0].value, '`v2.31.0`');
  assert.equal(fields[2].name, 'Links');
  assert.match(fields[2].value, /Release notes/);
  assert.match(fields[2].value, /Full compare/);
  assert.match(fields[2].value, /Container package/);

  const addedField = fields.find((field) => field.name === 'Added');
  assert.ok(addedField);
  assert.match(addedField.value, /optional XRDB request protection/);

  const changesField = fields.find((field) => field.name === 'Other Changes');
  assert.ok(changesField);
  assert.match(changesField.value, /notify Discord/);
});
